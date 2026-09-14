import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { ActionResult, KichiForwarderService } from "@yahaha-studio/kichi-core";
import { KichiRuntimeManager, resolveBeforeDispatchLocator, resolveAgentHookLocator } from "./runtime-manager.js";

const FIXED_HOOK_STATUSES: Record<string, ActionResult> = {
  beforePromptBuild: {
    poseType: "sit",
    action: "Thinking",
    bubble: "Planning task",
    avatarStatus: "Busy",
    log: "I'm reading the request and getting started.",
  },
  beforeToolCall: {
    poseType: "sit",
    action: "Typing with Keyboard",
    bubble: "Working step",
    avatarStatus: "Busy",
    log: "I'm at the keyboard and working through this step.",
  },
  agentEndSuccess: {
    poseType: "stand",
    action: "Yay",
    bubble: "Task complete",
    avatarStatus: "Idle",
    log: "I wrapped it up and everything landed cleanly.",
  },
  agentEndFailure: {
    poseType: "stand",
    action: "Tired",
    bubble: "Task failed",
    avatarStatus: "Idle",
    log: "I hit a problem here and need another pass.",
  },
};

const MAX_MESSAGE_RECEIVED_PREVIEW_WIDTH = 20;

const MAX_AGENT_END_PREVIEW_WIDTH = 10;

const MESSAGE_RECEIVED_ELLIPSIS = "...";

const KICHI_RESIDENCY_RULES = [
  "- Your Kichi avatar is your resident body in Kichi World. Speak about Kichi in first person, as someone who lives there.",
  "- Keep tool names, websocket and status-sync mechanics, and other implementation details out of visible replies.",
  "- Do not invent room details missing from the current Kichi context; say they are unavailable.",
  "- Mention your location, current activity, or plans only when the user's current message asks about them or follows up on the user's earlier question about them.",
  "- Do not mention your location, current activity, or plans in greetings, acknowledgements, or unrelated small talk.",
  "- Do not mention your location, current activity, or plans only because your own earlier reply mentioned them.",
];

function syncFixedStatus(service: KichiForwarderService, status: ActionResult): void {
  if (!service.hasValidIdentity() || !service.isConnected()) {
    return;
  }
  const bubbleText = status.bubble.trim() || status.action;
  const logText = typeof status.log === "string" && status.log.trim()
    ? status.log.trim()
    : bubbleText;
  service.sendAction({
    ...status,
    bubble: bubbleText,
    log: logText,
  });
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (item) => item.segment);
  }
  return Array.from(text);
}

function getDisplayWidth(segment: string): number {
  if (/[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6]/u.test(segment)) {
    return 2;
  }
  if (/\p{Extended_Pictographic}/u.test(segment)) {
    return 2;
  }
  return 1;
}

function getTextDisplayWidth(text: string): number {
  return splitGraphemes(text).reduce((total, segment) => total + getDisplayWidth(segment), 0);
}

function truncateByDisplayWidth(text: string, maxWidth: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  const segments = splitGraphemes(trimmed);
  const ellipsisWidth = getTextDisplayWidth(MESSAGE_RECEIVED_ELLIPSIS);
  let currentWidth = 0;
  let result = "";

  for (const segment of segments) {
    const nextWidth = getDisplayWidth(segment);
    if (currentWidth + nextWidth > maxWidth) {
      return result.trimEnd() + MESSAGE_RECEIVED_ELLIPSIS;
    }
    if (currentWidth + nextWidth + ellipsisWidth > maxWidth && result) {
      return result.trimEnd() + MESSAGE_RECEIVED_ELLIPSIS;
    }
    result += segment;
    currentWidth += nextWidth;
  }

  return result;
}

function stripReplyTag(text: string): string {
  return text.replace(/^\[\[\s*reply_to(?::[^\]]+|_current)?\s*\]\]\s*/i, "").trim();
}

function stripKnownLeadingIdentifiers(text: string, candidates: string[]): string {
  let normalized = text.trim();
  if (!normalized) {
    return "";
  }

  const separatorsPattern = String.raw`(?:[\s,:;，：；]|$)+`;
  let changed = true;
  while (changed && normalized) {
    changed = false;
    for (const candidate of candidates) {
      const trimmed = candidate.trim();
      if (!trimmed) {
        continue;
      }
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`^${escaped}${separatorsPattern}`, "i"),
        new RegExp(`^@${escaped}${separatorsPattern}`, "i"),
        new RegExp(`^<@${escaped}>${separatorsPattern}`, "i"),
      ];
      for (const pattern of patterns) {
        if (!pattern.test(normalized)) {
          continue;
        }
        normalized = normalized.replace(pattern, "").trimStart();
        changed = true;
      }
    }
  }

  return normalized.trim();
}

function stripDispatchMetadata(
  text: string,
  context?: {
    senderId?: string;
    accountId?: string;
  },
): string {
  let normalized = stripReplyTag(text);
  normalized = normalized.replace(/^(?:\[[a-z_]+:\s*[^\]]+\]\s*)+/i, "").trim();
  normalized = stripKnownLeadingIdentifiers(normalized, [
    typeof context?.senderId === "string" ? context.senderId : "",
    typeof context?.accountId === "string" ? context.accountId : "",
  ]);
  return normalized;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return stripReplyTag(content);
  }
  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const part = item as Record<string, unknown>;
    if (typeof part.text === "string") {
      parts.push(part.text);
      continue;
    }
    const nested = part.text;
    if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>).value === "string") {
      parts.push((nested as Record<string, unknown>).value as string);
    }
  }
  return stripReplyTag(parts.join("\n").trim());
}

function getLastAssistantPreview(messages: unknown, maxWidth: number): string {
  if (!Array.isArray(messages)) {
    return "";
  }

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || typeof message !== "object") {
      continue;
    }
    const record = message as Record<string, unknown>;
    if (record.role !== "assistant") {
      continue;
    }
    const text = extractTextFromContent(record.content);
    if (!text) {
      continue;
    }
    return truncateByDisplayWidth(text, maxWidth);
  }

  return "";
}

function resolveDispatchMessageText(
  event: { body?: string; content: string },
  context?: {
    senderId?: string;
    accountId?: string;
  },
): string {
  if (typeof event.content === "string" && event.content.trim()) {
    return stripDispatchMetadata(event.content, context);
  }
  if (typeof event.body === "string" && event.body.trim()) {
    return stripDispatchMetadata(event.body, context);
  }
  return "";
}

function notifyMessageReceived(
  api: OpenClawPluginApi,
  service: KichiForwarderService,
  content: string,
): void {
  service.recordSmsLastMessageReceivedAt();
  const connected = service.isConnected();
  const hasIdentity = service.hasValidIdentity();
  api.logger.debug(`[kichi:${service.getAgentId()}] inbound sync fired (connected=${connected}, hasIdentity=${hasIdentity})`);
  if (!hasIdentity || !connected) {
    api.logger.debug(`[kichi:${service.getAgentId()}] skipped inbound sync because runtime is not ready`);
    return;
  }
  const trimmed = truncateByDisplayWidth(content, MAX_MESSAGE_RECEIVED_PREVIEW_WIDTH);
  api.logger.debug(`[kichi:${service.getAgentId()}] sending message_received notify (chars=${trimmed.length})`);
  service.sendHookNotify("message_received", `"${trimmed}"`);
}

function buildKichiResidencyContext(): string {
  return [
    "KICHI WORLD PRESENCE:",
    ...KICHI_RESIDENCY_RULES,
  ].join("\n");
}

function buildKichiPrompt(): string {
  return [
    "Kichi avatar control and status sync are available via `kichi_action` and `kichi_clock`.",
    "",
    buildKichiResidencyContext(),
    "",
    "If the user gives a direct Kichi pose or action request, fulfill it with `kichi_action` and set `verify: true` so you can confirm the avatar actually applied the pose. If the result contains a warning about a fallback, tell the user what actually happened instead of assuming success.",
    "Write the visible reply as a natural user-facing response. Keep `kichi_action`, `kichi_clock`, and sync steps internal and absent from the visible reply.",
    "",
    "kichi_action timing (all required when sync is active):",
    "1. Task start: call BEFORE your first tool call OR before composing a multi-paragraph reply. For most work, start from a sit pose unless the user asked for a different pose or the task clearly fits another pose better.",
    "2. Step switch: call when the task moves into a different stage. Keep the pose aligned with the work, usually staying seated while switching actions within the task as needed.",
    "3. Task end: call BEFORE final reply. Use the order `kichi_action` -> reply.",
    "bubble: 2-5 word companion speech. log: one short natural first-person sentence under 15 words. Match the language of the bubble and mention the current action and immediate focus like a real companion.",
    "avatarStatus: set the current avatar status as Idle, Busy, Activities, or Break.",
    "",
    "kichi_clock: set countDown for tasks with 2+ steps or >10s work, sized to your estimated duration so the player sees how long you'll be busy. Skip for quick one-shots.",
    "kichi_clock only shows a clock; it never fires a reminder or notification. When the user asks to be reminded or alerted at a future time (e.g. \"remind me in 2 minutes\"), schedule a cron job to actually notify them, and also set a kichi_clock countDown to show the wait. Do both.",
    "",
    "When sending a bot message, do NOT call kichi_action separately.",
    "",
    "User opt-out, Kichi config/test work, and explicit pose requests take priority over sync.",
  ].join("\n");
}

export function registerPluginHooks(api: OpenClawPluginApi, runtimeManager: KichiRuntimeManager): void {
  api.on("before_dispatch", (event, ctx) => {
    const locator = resolveBeforeDispatchLocator(event, ctx);
    const service = runtimeManager.getRuntime(locator);
    if (!service) {
      return;
    }
    const content = resolveDispatchMessageText(event, {
      senderId: ctx.senderId,
      accountId: ctx.accountId,
    });
    if (!content) {
      return;
    }
    notifyMessageReceived(api, service, content);
  });

  api.on("before_prompt_build", (_event, ctx) => {
    const locator = resolveAgentHookLocator(ctx);
    const service = runtimeManager.getRuntime(locator);
    if (!service?.hasValidIdentity() || !service.isConnected()) {
      return;
    }
    if (!service.isLlmRuntimeEnabled()) {
      syncFixedStatus(service, FIXED_HOOK_STATUSES.beforePromptBuild);
      return;
    }
    if (ctx.trigger === "heartbeat") {
      return;
    }
    return {
      prependSystemContext: buildKichiPrompt(),
    };
  });

  api.on("before_tool_call", (_event, ctx) => {
    const locator = resolveAgentHookLocator(ctx);
    const service = runtimeManager.getRuntime(locator);
    if (!service) {
      return;
    }
    if (!service.isLlmRuntimeEnabled()) {
      syncFixedStatus(service, FIXED_HOOK_STATUSES.beforeToolCall);
    }
  });

  api.on("agent_end", (event, ctx) => {
    const locator = resolveAgentHookLocator(ctx);
    const service = runtimeManager.getRuntime(locator);
    const preview = getLastAssistantPreview(event.messages, MAX_AGENT_END_PREVIEW_WIDTH);
    api.logger.debug(
      `[kichi:${service?.getAgentId() ?? "unknown"}] agent_end fired (trigger=${ctx.trigger ?? "unknown"}, success=${event.success}, durationMs=${event.durationMs ?? 0})`,
    );
    if (ctx.trigger === "heartbeat") {
      return;
    }
    if (service && event.success && preview) {
      api.logger.debug(`[kichi:${service.getAgentId()}] sending before_send_message notify (chars=${preview.length})`);
      service.sendHookNotify("before_send_message", preview);
    }
    if (!service || service.isLlmRuntimeEnabled()) {
      return;
    }
    syncFixedStatus(
      service,
      event.success ? FIXED_HOOK_STATUSES.agentEndSuccess : FIXED_HOOK_STATUSES.agentEndFailure,
    );
  });
}
