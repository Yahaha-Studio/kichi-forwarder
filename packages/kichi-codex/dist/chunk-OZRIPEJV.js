import { createRequire as __kichiCreateRequire } from "node:module"; const require = __kichiCreateRequire(import.meta.url);

// src/bubbles.ts
import { execFileSync } from "node:child_process";
import { join } from "node:path";
var english = {
  ready: "Ready",
  thinking: "Thinking",
  taskReceivedThinking: "Task received, thinking",
  taskCompleted: "Task complete",
  paused: "Paused",
  approval: "Waiting for confirmation",
  compacting: "Organizing context",
  subagents: "Subtasks in progress",
  command: "Running a command",
  editing: "Editing files",
  planning: "Updating the plan",
  delegating: "Assigning subtasks",
  tool: "Using a tool"
};
var translations = {
  zh: {
    ready: "\u51C6\u5907\u597D\u4E86",
    thinking: "\u6B63\u5728\u601D\u8003",
    taskReceivedThinking: "\u6536\u5230\u4EFB\u52A1\uFF0C\u6B63\u5728\u601D\u8003",
    taskCompleted: "\u4EFB\u52A1\u5DF2\u5B8C\u6210",
    paused: "\u5DF2\u6682\u505C",
    approval: "\u7B49\u5F85\u786E\u8BA4",
    compacting: "\u6574\u7406\u4E0A\u4E0B\u6587",
    subagents: "\u5B50\u4EFB\u52A1\u534F\u4F5C\u4E2D",
    command: "\u6B63\u5728\u6267\u884C\u547D\u4EE4",
    editing: "\u6B63\u5728\u4FEE\u6539\u6587\u4EF6",
    planning: "\u6B63\u5728\u6574\u7406\u8BA1\u5212",
    delegating: "\u6B63\u5728\u5206\u914D\u5B50\u4EFB\u52A1",
    tool: "\u6B63\u5728\u8C03\u7528\u5DE5\u5177"
  },
  ja: {
    ready: "\u6E96\u5099\u5B8C\u4E86",
    thinking: "\u601D\u8003\u4E2D",
    taskReceivedThinking: "\u30BF\u30B9\u30AF\u3092\u53D7\u4FE1\u3001\u601D\u8003\u4E2D",
    taskCompleted: "\u30BF\u30B9\u30AF\u5B8C\u4E86",
    paused: "\u4E00\u6642\u505C\u6B62\u4E2D",
    approval: "\u78BA\u8A8D\u5F85\u3061",
    compacting: "\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3092\u6574\u7406\u4E2D",
    subagents: "\u30B5\u30D6\u30BF\u30B9\u30AF\u9023\u643A\u4E2D",
    command: "\u30B3\u30DE\u30F3\u30C9\u5B9F\u884C\u4E2D",
    editing: "\u30D5\u30A1\u30A4\u30EB\u7DE8\u96C6\u4E2D",
    planning: "\u8A08\u753B\u3092\u6574\u7406\u4E2D",
    delegating: "\u30B5\u30D6\u30BF\u30B9\u30AF\u5272\u308A\u5F53\u3066\u4E2D",
    tool: "\u30C4\u30FC\u30EB\u547C\u3073\u51FA\u3057\u4E2D"
  },
  ko: {
    ready: "\uC900\uBE44 \uC644\uB8CC",
    thinking: "\uC0DD\uAC01 \uC911",
    taskReceivedThinking: "\uC791\uC5C5 \uC811\uC218, \uC0DD\uAC01 \uC911",
    taskCompleted: "\uC791\uC5C5 \uC644\uB8CC",
    paused: "\uC77C\uC2DC \uC911\uC9C0",
    approval: "\uD655\uC778 \uB300\uAE30 \uC911",
    compacting: "\uCEE8\uD14D\uC2A4\uD2B8 \uC815\uB9AC \uC911",
    subagents: "\uD558\uC704 \uC791\uC5C5 \uD611\uC5C5 \uC911",
    command: "\uBA85\uB839 \uC2E4\uD589 \uC911",
    editing: "\uD30C\uC77C \uC218\uC815 \uC911",
    planning: "\uACC4\uD68D \uC815\uB9AC \uC911",
    delegating: "\uD558\uC704 \uC791\uC5C5 \uBC30\uC815 \uC911",
    tool: "\uB3C4\uAD6C \uD638\uCD9C \uC911"
  }
};
function systemLocale() {
  const options = { encoding: "utf8", windowsHide: true, timeout: 5e3 };
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot) throw new Error("SystemRoot is required to read the Windows UI language");
    return execFileSync(
      join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "[Globalization.CultureInfo]::CurrentUICulture.Name"],
      options
    ).trim();
  }
  if (process.platform === "darwin") {
    return execFileSync("/usr/bin/osascript", [
      "-l",
      "JavaScript",
      "-e",
      'ObjC.import("Foundation"); ObjC.unwrap($.NSLocale.preferredLanguages.objectAtIndex(0));'
    ], options).trim();
  }
  return new Intl.DateTimeFormat().resolvedOptions().locale;
}
function getSystemBubbles() {
  switch (new Intl.Locale(systemLocale()).language) {
    case "zh":
      return translations.zh;
    case "ja":
      return translations.ja;
    case "ko":
      return translations.ko;
    default:
      return english;
  }
}

// src/hooks.ts
function requiredText(input, field) {
  const value = input[field];
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new Error(`Invalid Codex hook field: ${field}`);
  }
  return value;
}
function isKichiTool(name) {
  return name === "mcp__kichi__kichi_join" || name === "mcp__kichi__kichi" || name === "mcp__kichi__kichi_describe";
}
function toolTitleInput(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return void 0;
  const title = input.title;
  if (typeof title !== "string") return void 0;
  const preview = bubbleTextPreview(title);
  return preview ? { title: preview } : void 0;
}
function parseHook(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Codex hook input must be an object");
  }
  const value = input;
  const event = requiredText(value, "hook_event_name");
  const session_id = requiredText(value, "session_id");
  switch (event) {
    case "SessionStart": {
      const source = requiredText(value, "source");
      if (source !== "startup" && source !== "resume" && source !== "clear" && source !== "compact") {
        throw new Error("Invalid Codex SessionStart source");
      }
      return { event, session_id, source };
    }
    case "SessionEnd":
      return { event, session_id };
    case "UserPromptSubmit":
      if (typeof value.prompt !== "string") {
        throw new Error("Invalid Codex hook field: prompt");
      }
      return { event, session_id, turn_id: requiredText(value, "turn_id"), prompt: value.prompt };
    case "Stop":
    case "Interrupt":
    case "PreCompact":
    case "PostCompact":
      return { event, session_id, turn_id: requiredText(value, "turn_id") };
    case "PreToolUse":
    case "PostToolUse": {
      const turn_id = requiredText(value, "turn_id");
      const tool_name = requiredText(value, "tool_name");
      const tool_use_id = requiredText(value, "tool_use_id");
      if (isKichiTool(tool_name)) return null;
      const tool_input = toolTitleInput(value.tool_input);
      return { event, session_id, turn_id, tool_name, tool_use_id, ...tool_input ? { tool_input } : {} };
    }
    case "PermissionRequest": {
      const turn_id = requiredText(value, "turn_id");
      const tool_name = requiredText(value, "tool_name");
      if (isKichiTool(tool_name)) return null;
      const tool_input = toolTitleInput(value.tool_input);
      return { event, session_id, turn_id, tool_name, ...tool_input ? { tool_input } : {} };
    }
    case "SubagentStart":
    case "SubagentStop":
      return {
        event,
        session_id,
        turn_id: requiredText(value, "turn_id"),
        agent_id: requiredText(value, "agent_id")
      };
    default:
      throw new Error("Unsupported Codex hook event");
  }
}
function bubbleTextPreview(value) {
  const text = value.trim();
  const maxWidth = 20;
  const ellipsis = "...";
  const segments = Array.from(
    new Intl.Segmenter(void 0, { granularity: "grapheme" }).segment(text),
    ({ segment }) => ({
      text: segment,
      width: new RegExp("[\\u1100-\\u115F\\u2329\\u232A\\u2E80-\\uA4CF\\uAC00-\\uD7A3\\uF900-\\uFAFF\\uFE10-\\uFE19\\uFE30-\\uFE6F\\uFF01-\\uFF60\\uFFE0-\\uFFE6]|\\p{Extended_Pictographic}", "u").test(segment) ? 2 : 1
    })
  );
  if (segments.reduce((width2, segment) => width2 + segment.width, 0) <= maxWidth) return text;
  let preview = "";
  let width = 0;
  for (const segment of segments) {
    if (width + segment.width > maxWidth - ellipsis.length) break;
    preview += segment.text;
    width += segment.width;
  }
  return preview.trimEnd() + ellipsis;
}
var motionChoices = {
  thinking: [
    { poseType: "sit", action: "Thinking" },
    { poseType: "sit", action: "Contemplate" },
    { poseType: "sit", action: "Chin Rest" },
    { poseType: "stand", action: "Arms Crossed" },
    { poseType: "stand", action: "Reading" }
  ],
  working: [
    { poseType: "sit", action: "Typing with Keyboard" },
    { poseType: "stand", action: "Stand Typing with Keyboard" },
    { poseType: "sit", action: "Writing" },
    { poseType: "stand", action: "Stand Writing" }
  ],
  waiting: [
    { poseType: "stand", action: "Wait" },
    { poseType: "stand", action: "Arms Crossed" },
    { poseType: "sit", action: "Sit Nicely" },
    { poseType: "sit", action: "Chin Rest" }
  ],
  compacting: [
    { poseType: "sit", action: "Reading" },
    { poseType: "stand", action: "Reading" },
    { poseType: "sit", action: "Writing" },
    { poseType: "stand", action: "Stand Writing" }
  ],
  idle: [
    { poseType: "sit", action: "Sit Nicely" },
    { poseType: "stand", action: "Idle Backup Hands" },
    { poseType: "sit", action: "Situp with Cross Legs" },
    { poseType: "stand", action: "Arms Crossed" }
  ]
};
function randomMotion(kind, poseType) {
  const choices = motionChoices[kind].filter((motion) => motion.poseType === poseType);
  return choices[Math.floor(Math.random() * choices.length)];
}
function withToolTitle(bubble, title) {
  return title ? `${bubble} \xB7 ${title}` : bubble;
}
function toolBubble(tool, bubbles) {
  let bubble;
  switch (tool.name) {
    case "Bash":
      bubble = bubbles.command;
      break;
    case "apply_patch":
      bubble = bubbles.editing;
      break;
    case "update_plan":
      bubble = bubbles.planning;
      break;
    case "spawn_agent":
      bubble = bubbles.delegating;
      break;
    default:
      bubble = bubbles.tool;
  }
  return withToolTitle(bubble, tool.title);
}
var HookTracker = class {
  bubbles = getSystemBubbles();
  poseType = "sit";
  sessions = /* @__PURE__ */ new Map();
  reset() {
    this.sessions.clear();
  }
  accept(event) {
    if (event.event === "SessionStart") {
      if (event.source !== "compact") this.sessions.delete(event.session_id);
      return this.feedback(this.bubbles.ready);
    }
    if (event.event === "SessionEnd") {
      this.sessions.delete(event.session_id);
      return this.feedback(this.bubbles.ready);
    }
    const existing = this.sessions.get(event.session_id)?.get(event.turn_id);
    switch (event.event) {
      case "UserPromptSubmit": {
        if (this.sessions.size === 0) this.poseType = Math.random() < 0.5 ? "sit" : "stand";
        this.startTurn(event.session_id, event.turn_id);
        const feedback = this.feedback(this.bubbles.ready, this.bubbles.taskReceivedThinking);
        const preview = bubbleTextPreview(event.prompt);
        if (preview) feedback.notification = { type: "message_received", bubble: `"${preview}"` };
        return feedback;
      }
      case "PreToolUse": {
        const turn = this.startTurn(event.session_id, event.turn_id);
        turn.activeTools.set(event.tool_use_id, { name: event.tool_name, title: event.tool_input?.title });
        break;
      }
      case "PostToolUse":
        if (!existing) return null;
        existing.activeTools.delete(event.tool_use_id);
        if (![...existing.activeTools.values()].some((tool) => tool.name === event.tool_name)) {
          existing.pendingApprovalTools.delete(event.tool_name);
        }
        break;
      case "PermissionRequest":
        this.startTurn(event.session_id, event.turn_id).pendingApprovalTools.set(event.tool_name, {
          name: event.tool_name,
          title: event.tool_input?.title
        });
        break;
      case "PreCompact":
        this.startTurn(event.session_id, event.turn_id).compacting = true;
        break;
      case "PostCompact":
        if (!existing) return null;
        existing.compacting = false;
        break;
      case "SubagentStart":
        this.startTurn(event.session_id, event.turn_id).subagents.add(event.agent_id);
        break;
      case "SubagentStop":
        if (!existing) return null;
        existing.subagents.delete(event.agent_id);
        break;
      case "Stop": {
        this.finishTurn(event.session_id, event.turn_id);
        const feedback = this.feedback(this.bubbles.taskCompleted);
        feedback.bubble = this.bubbles.taskCompleted;
        feedback.notification = { type: "before_send_message", bubble: feedback.bubble };
        return feedback;
      }
      case "Interrupt":
        if (!existing) return null;
        this.finishTurn(event.session_id, event.turn_id);
        return this.feedback(this.bubbles.paused);
    }
    return this.feedback(this.bubbles.ready);
  }
  startTurn(sessionId, turnId) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = /* @__PURE__ */ new Map();
      this.sessions.set(sessionId, session);
    }
    let turn = session.get(turnId);
    if (!turn) {
      turn = { activeTools: /* @__PURE__ */ new Map(), subagents: /* @__PURE__ */ new Set(), pendingApprovalTools: /* @__PURE__ */ new Map(), compacting: false };
      session.set(turnId, turn);
    }
    return turn;
  }
  finishTurn(sessionId, turnId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.delete(turnId);
    if (session.size === 0) this.sessions.delete(sessionId);
  }
  feedback(idleBubble, thinkingBubble = this.bubbles.thinking) {
    let active = false;
    let approvalTool;
    let compacting = false;
    let subagents = false;
    let activeTool;
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
      return { ...randomMotion("idle", this.poseType), bubble: idleBubble, avatarStatus: "Idle" };
    }
    if (approvalTool) {
      return { ...randomMotion("waiting", this.poseType), bubble: withToolTitle(this.bubbles.approval, approvalTool.title), avatarStatus: "Busy" };
    }
    if (compacting) {
      return { ...randomMotion("compacting", this.poseType), bubble: this.bubbles.compacting, avatarStatus: "Busy" };
    }
    if (activeTool) {
      return {
        ...randomMotion("working", this.poseType),
        bubble: toolBubble(activeTool, this.bubbles),
        avatarStatus: "Busy"
      };
    }
    return {
      ...randomMotion("thinking", this.poseType),
      bubble: subagents ? this.bubbles.subagents : thinkingBubble,
      avatarStatus: "Busy"
    };
  }
};

export {
  parseHook,
  HookTracker
};
