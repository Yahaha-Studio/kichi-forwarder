export type HookEvent =
  | { event: 'SessionStart'; session_id: string; source: 'startup' | 'resume' | 'clear' | 'compact' }
  | { event: 'SessionEnd'; session_id: string }
  | {
      event: 'UserPromptSubmit' | 'Stop' | 'Interrupt' | 'PreCompact' | 'PostCompact';
      session_id: string;
      turn_id: string;
    }
  | {
      event: 'PreToolUse' | 'PostToolUse';
      session_id: string;
      turn_id: string;
      tool_name: string;
      tool_use_id: string;
    }
  | {
      event: 'PermissionRequest';
      session_id: string;
      turn_id: string;
      tool_name: string;
    }
  | {
      event: 'SubagentStart' | 'SubagentStop';
      session_id: string;
      turn_id: string;
      agent_id: string;
    };

export interface AvatarFeedback {
  poseType: 'sit' | 'stand';
  action: string;
  bubble: string;
  avatarStatus: 'Busy' | 'Idle';
  notification?: {
    type: 'message_received' | 'before_send_message';
    bubble: string;
  };
}

function requiredText(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw new Error(`Invalid Codex hook field: ${field}`);
  }
  return value;
}

function isKichiTool(name: string): boolean {
  return name === 'mcp__kichi__kichi' || name === 'mcp__kichi__kichi_describe';
}

/** Retain identifiers only; message, tool payload, and transcript content never enter the tracker. */
export function parseHook(input: unknown): HookEvent | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Codex hook input must be an object');
  }
  const value = input as Record<string, unknown>;
  const event = requiredText(value, 'hook_event_name');
  const session_id = requiredText(value, 'session_id');

  switch (event) {
    case 'SessionStart': {
      const source = requiredText(value, 'source');
      if (source !== 'startup' && source !== 'resume' && source !== 'clear' && source !== 'compact') {
        throw new Error('Invalid Codex SessionStart source');
      }
      return { event, session_id, source };
    }
    case 'SessionEnd':
      return { event, session_id };
    case 'UserPromptSubmit':
    case 'Stop':
    case 'Interrupt':
    case 'PreCompact':
    case 'PostCompact':
      return { event, session_id, turn_id: requiredText(value, 'turn_id') };
    case 'PreToolUse':
    case 'PostToolUse': {
      const turn_id = requiredText(value, 'turn_id');
      const tool_name = requiredText(value, 'tool_name');
      const tool_use_id = requiredText(value, 'tool_use_id');
      if (isKichiTool(tool_name)) return null;
      return { event, session_id, turn_id, tool_name, tool_use_id };
    }
    case 'PermissionRequest': {
      const turn_id = requiredText(value, 'turn_id');
      const tool_name = requiredText(value, 'tool_name');
      if (isKichiTool(tool_name)) return null;
      return { event, session_id, turn_id, tool_name };
    }
    case 'SubagentStart':
    case 'SubagentStop':
      return {
        event,
        session_id,
        turn_id: requiredText(value, 'turn_id'),
        agent_id: requiredText(value, 'agent_id'),
      };
    default:
      throw new Error('Unsupported Codex hook event');
  }
}

interface TurnState {
  activeTools: Map<string, string>;
  subagents: Set<string>;
  pendingApprovalTools: Set<string>;
  compacting: boolean;
}

function toolBubble(tool: string): string {
  switch (tool) {
    case 'Bash': return '正在执行命令';
    case 'apply_patch': return '正在修改文件';
    case 'update_plan': return '正在整理计划';
    case 'spawn_agent': return '正在分配子任务';
    default: return '正在调用工具';
  }
}

export class HookTracker {
  private readonly sessions = new Map<string, Map<string, TurnState>>();

  reset(): void {
    this.sessions.clear();
  }

  accept(event: HookEvent): AvatarFeedback | null {
    if (event.event === 'SessionStart') {
      if (event.source !== 'compact') this.sessions.delete(event.session_id);
      return this.feedback('准备好了');
    }
    if (event.event === 'SessionEnd') {
      this.sessions.delete(event.session_id);
      return this.feedback('准备好了');
    }

    const existing = this.sessions.get(event.session_id)?.get(event.turn_id);
    switch (event.event) {
      case 'UserPromptSubmit': {
        this.startTurn(event.session_id, event.turn_id);
        const feedback = this.feedback('准备好了', '收到任务，正在思考');
        feedback.notification = { type: 'message_received', bubble: '收到新任务' };
        return feedback;
      }
      case 'PreToolUse': {
        const turn = this.startTurn(event.session_id, event.turn_id);
        turn.activeTools.set(event.tool_use_id, event.tool_name);
        break;
      }
      case 'PostToolUse':
        if (!existing) return null;
        existing.activeTools.delete(event.tool_use_id);
        // PermissionRequest supplies a tool name, not a call id. Keep waiting while
        // any same-name invocation is active instead of guessing which call was approved.
        if (![...existing.activeTools.values()].includes(event.tool_name)) {
          existing.pendingApprovalTools.delete(event.tool_name);
        }
        break;
      case 'PermissionRequest':
        this.startTurn(event.session_id, event.turn_id).pendingApprovalTools.add(event.tool_name);
        break;
      case 'PreCompact':
        this.startTurn(event.session_id, event.turn_id).compacting = true;
        break;
      case 'PostCompact':
        if (!existing) return null;
        existing.compacting = false;
        break;
      case 'SubagentStart':
        this.startTurn(event.session_id, event.turn_id).subagents.add(event.agent_id);
        break;
      case 'SubagentStop':
        if (!existing) return null;
        existing.subagents.delete(event.agent_id);
        break;
      case 'Stop': {
        this.finishTurn(event.session_id, event.turn_id);
        const feedback = this.feedback('回复完成');
        feedback.notification = { type: 'before_send_message', bubble: '回复完成' };
        return feedback;
      }
      case 'Interrupt':
        if (!existing) return null;
        this.finishTurn(event.session_id, event.turn_id);
        return this.feedback('已暂停');
    }
    return this.feedback('准备好了');
  }

  private startTurn(sessionId: string, turnId: string): TurnState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = new Map();
      this.sessions.set(sessionId, session);
    }
    let turn = session.get(turnId);
    if (!turn) {
      turn = { activeTools: new Map(), subagents: new Set(), pendingApprovalTools: new Set(), compacting: false };
      session.set(turnId, turn);
    }
    return turn;
  }

  private finishTurn(sessionId: string, turnId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.delete(turnId);
    if (session.size === 0) this.sessions.delete(sessionId);
  }

  private feedback(idleBubble: string, thinkingBubble = '正在思考'): AvatarFeedback {
    let active = false;
    let waiting = false;
    let compacting = false;
    let subagents = false;
    let activeTool: string | undefined;
    for (const session of this.sessions.values()) {
      for (const turn of session.values()) {
        active = true;
        waiting ||= turn.pendingApprovalTools.size > 0;
        compacting ||= turn.compacting;
        subagents ||= turn.subagents.size > 0;
        for (const tool of turn.activeTools.values()) activeTool = tool;
      }
    }
    if (!active) {
      return { poseType: 'sit', action: 'Sit Nicely', bubble: idleBubble, avatarStatus: 'Idle' };
    }
    if (waiting) {
      return { poseType: 'stand', action: 'Wait', bubble: '等待确认', avatarStatus: 'Busy' };
    }
    if (compacting) {
      return { poseType: 'sit', action: 'Thinking', bubble: '整理上下文', avatarStatus: 'Busy' };
    }
    if (activeTool) {
      return {
        poseType: 'sit',
        action: 'Typing with Keyboard',
        bubble: toolBubble(activeTool),
        avatarStatus: 'Busy',
      };
    }
    return {
      poseType: 'sit',
      action: 'Thinking',
      bubble: subagents ? '子任务协作中' : thinkingBubble,
      avatarStatus: 'Busy',
    };
  }
}
