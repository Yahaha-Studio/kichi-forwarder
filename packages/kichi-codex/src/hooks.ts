import { getSystemBubbles, type BubbleMessages } from './bubbles.js';

export type HookEvent =
  | { event: 'SessionStart'; session_id: string; source: 'startup' | 'resume' | 'clear' | 'compact' }
  | { event: 'SessionEnd'; session_id: string }
  | {
      event: 'UserPromptSubmit';
      session_id: string;
      turn_id: string;
      prompt: string;
    }
  | {
      event: 'Stop' | 'Interrupt' | 'PreCompact' | 'PostCompact';
      session_id: string;
      turn_id: string;
    }
  | {
      event: 'PreToolUse' | 'PostToolUse';
      session_id: string;
      turn_id: string;
      tool_name: string;
      tool_use_id: string;
      tool_input?: { title: string };
    }
  | {
      event: 'PermissionRequest';
      session_id: string;
      turn_id: string;
      tool_name: string;
      tool_input?: { title: string };
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
  return name === 'mcp__kichi__kichi_join' || name === 'mcp__kichi__kichi' || name === 'mcp__kichi__kichi_describe';
}

function toolTitleInput(input: unknown): { title: string } | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const title = (input as Record<string, unknown>).title;
  if (typeof title !== 'string') return undefined;
  const preview = bubbleTextPreview(title);
  return preview ? { title: preview } : undefined;
}

/** Retain lifecycle identifiers, user text, and tool titles; omit other tool payloads and transcripts. */
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
      if (typeof value.prompt !== 'string') {
        throw new Error('Invalid Codex hook field: prompt');
      }
      return { event, session_id, turn_id: requiredText(value, 'turn_id'), prompt: value.prompt };
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
      const tool_input = toolTitleInput(value.tool_input);
      return { event, session_id, turn_id, tool_name, tool_use_id, ...(tool_input ? { tool_input } : {}) };
    }
    case 'PermissionRequest': {
      const turn_id = requiredText(value, 'turn_id');
      const tool_name = requiredText(value, 'tool_name');
      if (isKichiTool(tool_name)) return null;
      const tool_input = toolTitleInput(value.tool_input);
      return { event, session_id, turn_id, tool_name, ...(tool_input ? { tool_input } : {}) };
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

function bubbleTextPreview(value: string): string {
  const text = value.trim();
  const maxWidth = 20;
  const ellipsis = '...';
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
    ({ segment }) => ({
      text: segment,
      width: /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6]|\p{Extended_Pictographic}/u.test(segment) ? 2 : 1,
    }),
  );
  if (segments.reduce((width, segment) => width + segment.width, 0) <= maxWidth) return text;

  let preview = '';
  let width = 0;
  for (const segment of segments) {
    if (width + segment.width > maxWidth - ellipsis.length) break;
    preview += segment.text;
    width += segment.width;
  }
  return preview.trimEnd() + ellipsis;
}

type AvatarMotion = Pick<AvatarFeedback, 'poseType' | 'action'>;

const motionChoices = {
  thinking: [
    { poseType: 'sit', action: 'Thinking' },
    { poseType: 'sit', action: 'Contemplate' },
    { poseType: 'sit', action: 'Chin Rest' },
    { poseType: 'stand', action: 'Arms Crossed' },
    { poseType: 'stand', action: 'Reading' },
  ],
  working: [
    { poseType: 'sit', action: 'Typing with Keyboard' },
    { poseType: 'stand', action: 'Stand Typing with Keyboard' },
    { poseType: 'sit', action: 'Writing' },
    { poseType: 'stand', action: 'Stand Writing' },
  ],
  waiting: [
    { poseType: 'stand', action: 'Wait' },
    { poseType: 'stand', action: 'Arms Crossed' },
    { poseType: 'sit', action: 'Sit Nicely' },
    { poseType: 'sit', action: 'Chin Rest' },
  ],
  compacting: [
    { poseType: 'sit', action: 'Reading' },
    { poseType: 'stand', action: 'Reading' },
    { poseType: 'sit', action: 'Writing' },
    { poseType: 'stand', action: 'Stand Writing' },
  ],
  idle: [
    { poseType: 'sit', action: 'Sit Nicely' },
    { poseType: 'stand', action: 'Idle Backup Hands' },
    { poseType: 'sit', action: 'Situp with Cross Legs' },
    { poseType: 'stand', action: 'Arms Crossed' },
  ],
} satisfies Record<string, AvatarMotion[]>;

function randomMotion(kind: keyof typeof motionChoices, poseType: AvatarFeedback['poseType']): AvatarMotion {
  const choices = motionChoices[kind].filter((motion) => motion.poseType === poseType);
  return choices[Math.floor(Math.random() * choices.length)]!;
}

interface ToolActivity {
  name: string;
  title: string | undefined;
}

interface TurnState {
  activeTools: Map<string, ToolActivity>;
  subagents: Set<string>;
  pendingApprovalTools: Map<string, ToolActivity>;
  compacting: boolean;
}

function withToolTitle(bubble: string, title: string | undefined): string {
  return title ? `${bubble} · ${title}` : bubble;
}

function toolBubble(tool: ToolActivity, bubbles: BubbleMessages): string {
  let bubble: string;
  switch (tool.name) {
    case 'Bash': bubble = bubbles.command; break;
    case 'apply_patch': bubble = bubbles.editing; break;
    case 'update_plan': bubble = bubbles.planning; break;
    case 'spawn_agent': bubble = bubbles.delegating; break;
    default: bubble = bubbles.tool;
  }
  return withToolTitle(bubble, tool.title);
}

export class HookTracker {
  private readonly bubbles = getSystemBubbles();
  private poseType: AvatarFeedback['poseType'] = 'sit';
  private readonly sessions = new Map<string, Map<string, TurnState>>();

  reset(): void {
    this.sessions.clear();
  }

  accept(event: HookEvent): AvatarFeedback | null {
    if (event.event === 'SessionStart') {
      if (event.source !== 'compact') this.sessions.delete(event.session_id);
      return this.feedback(this.bubbles.ready);
    }
    if (event.event === 'SessionEnd') {
      this.sessions.delete(event.session_id);
      return this.feedback(this.bubbles.ready);
    }

    const existing = this.sessions.get(event.session_id)?.get(event.turn_id);
    switch (event.event) {
      case 'UserPromptSubmit': {
        // Overlapping turns share a pose until all of them finish.
        if (this.sessions.size === 0) this.poseType = Math.random() < 0.5 ? 'sit' : 'stand';
        this.startTurn(event.session_id, event.turn_id);
        const feedback = this.feedback(this.bubbles.ready, this.bubbles.taskReceivedThinking);
        const preview = bubbleTextPreview(event.prompt);
        if (preview) feedback.notification = { type: 'message_received', bubble: `"${preview}"` };
        return feedback;
      }
      case 'PreToolUse': {
        const turn = this.startTurn(event.session_id, event.turn_id);
        turn.activeTools.set(event.tool_use_id, { name: event.tool_name, title: event.tool_input?.title });
        break;
      }
      case 'PostToolUse':
        if (!existing) return null;
        existing.activeTools.delete(event.tool_use_id);
        // PermissionRequest supplies a tool name, not a call id. Keep waiting while
        // any same-name invocation is active instead of guessing which call was approved.
        if (![...existing.activeTools.values()].some((tool) => tool.name === event.tool_name)) {
          existing.pendingApprovalTools.delete(event.tool_name);
        }
        break;
      case 'PermissionRequest':
        this.startTurn(event.session_id, event.turn_id).pendingApprovalTools.set(event.tool_name, {
          name: event.tool_name,
          title: event.tool_input?.title,
        });
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
        const feedback = this.feedback(this.bubbles.taskCompleted);
        // Other active sessions may keep the avatar busy, but must not hide this completion.
        feedback.bubble = this.bubbles.taskCompleted;
        feedback.notification = { type: 'before_send_message', bubble: feedback.bubble };
        return feedback;
      }
      case 'Interrupt':
        if (!existing) return null;
        this.finishTurn(event.session_id, event.turn_id);
        return this.feedback(this.bubbles.paused);
    }
    return this.feedback(this.bubbles.ready);
  }

  private startTurn(sessionId: string, turnId: string): TurnState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = new Map();
      this.sessions.set(sessionId, session);
    }
    let turn = session.get(turnId);
    if (!turn) {
      turn = { activeTools: new Map(), subagents: new Set(), pendingApprovalTools: new Map(), compacting: false };
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

  private feedback(idleBubble: string, thinkingBubble = this.bubbles.thinking): AvatarFeedback {
    let active = false;
    let approvalTool: ToolActivity | undefined;
    let compacting = false;
    let subagents = false;
    let activeTool: ToolActivity | undefined;
    for (const session of this.sessions.values()) {
      for (const turn of session.values()) {
        active = true;
        for (const tool of turn.pendingApprovalTools.values()) approvalTool = tool;
        compacting ||= turn.compacting;
        subagents ||= turn.subagents.size > 0;
        for (const tool of turn.activeTools.values()) activeTool = tool;
      }
    }
    if (!active) {
      return { ...randomMotion('idle', this.poseType), bubble: idleBubble, avatarStatus: 'Idle' };
    }
    if (approvalTool) {
      return { ...randomMotion('waiting', this.poseType), bubble: withToolTitle(this.bubbles.approval, approvalTool.title), avatarStatus: 'Busy' };
    }
    if (compacting) {
      return { ...randomMotion('compacting', this.poseType), bubble: this.bubbles.compacting, avatarStatus: 'Busy' };
    }
    if (activeTool) {
      return {
        ...randomMotion('working', this.poseType),
        bubble: toolBubble(activeTool, this.bubbles),
        avatarStatus: 'Busy',
      };
    }
    return {
      ...randomMotion('thinking', this.poseType),
      bubble: subagents ? this.bubbles.subagents : thinkingBubble,
      avatarStatus: 'Busy',
    };
  }
}
