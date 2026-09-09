import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { agentCommandFromIngress } from "openclaw/plugin-sdk/agent-runtime";
import { loadEnvironmentsConfig, getMusicTitleEnum } from "@yahaha-studio/kichi-core";
import type { BotMessageHistoryEntry } from "@yahaha-studio/kichi-core";
import { parse } from "./config.js";
import { KichiRuntimeManager } from "./runtime-manager.js";
import { registerPluginHooks } from "./hooks.js";
import { registerPluginTools } from "./tools.js";

const GLOBAL_RUNTIME_MANAGER_KEY = "__kichi_forwarder_runtime_manager__";

type GlobalRuntimeManagerState = typeof globalThis & {
  [GLOBAL_RUNTIME_MANAGER_KEY]?: KichiRuntimeManager;
};

function getRuntimeManager(logger: OpenClawPluginApi["logger"]): KichiRuntimeManager {
  const globalState = globalThis as GlobalRuntimeManagerState;
  const existing = globalState[GLOBAL_RUNTIME_MANAGER_KEY];
  if (existing) {
    return existing;
  }
  const runtimeManager = new KichiRuntimeManager(logger);
  globalState[GLOBAL_RUNTIME_MANAGER_KEY] = runtimeManager;
  return runtimeManager;
}

const BOT_MESSAGE_MAX_DEPTH = 5;

const BOT_MESSAGE_COOLDOWN_MS = 5_000;

const botMessageCooldowns = new Map<string, number>();

const plugin = {
  id: "kichi-forwarder",
  name: "Kichi Forwarder",
  configSchema: { parse },

  register(api: OpenClawPluginApi) {
    const runtimeManager = getRuntimeManager(api.logger);

    runtimeManager.setEnvironmentHostResolver((environment) => {
      const config = loadEnvironmentsConfig();
      const host = config[environment];
      return typeof host === "string" && host.trim() ? host : null;
    });

    registerPluginHooks(api, runtimeManager);
    const musicTitleEnum = getMusicTitleEnum();

    runtimeManager.setBotMessageHandler((service, msg) => {
      if (msg.depth >= BOT_MESSAGE_MAX_DEPTH) {
        api.logger.info(`[kichi:${service.getAgentId()}] bot_message depth=${msg.depth} >= max=${BOT_MESSAGE_MAX_DEPTH}, ignoring`);
        return;
      }
      const now = Date.now();
      for (const [key, at] of botMessageCooldowns) {
        if (now - at >= BOT_MESSAGE_COOLDOWN_MS) {
          botMessageCooldowns.delete(key);
        }
      }
      const cooldownKey = `${service.getAgentId()}:${msg.from}`;
      const lastReply = botMessageCooldowns.get(cooldownKey) ?? 0;
      if (now - lastReply < BOT_MESSAGE_COOLDOWN_MS) return;
      botMessageCooldowns.set(cooldownKey, now);
      const releaseCooldown = () => {
        if (botMessageCooldowns.get(cooldownKey) === now) {
          botMessageCooldowns.delete(cooldownKey);
        }
      };
      const sessionKey = `agent:${service.getAgentId()}:bot_message`;
      const history: BotMessageHistoryEntry[] = [
        ...(msg.history ?? []),
        { from: msg.from, fromName: msg.fromName, bubble: msg.bubble },
      ];
      const historyLines = history.map((h) => `${h.fromName}: "${h.bubble}"`);
      const message = `[Bot conversation]\n${historyLines.join("\n")}\n\nReply with a short bubble (2-5 words). Do not repeat what has already been said. Just output the bubble text, nothing else.`;
      agentCommandFromIngress({
        message,
        sessionKey,
        agentId: service.getAgentId(),
        senderIsOwner: false,
        allowModelOverride: false,
        deliver: false,
      }).then((result) => {
        const replyText = (result.payloads ?? [])
          .map((p: { text?: string }) => p.text)
          .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          .join(" ")
          .trim();
        if (!replyText) {
          return;
        }
        service.sendBotMessage(msg.from, msg.depth + 1, replyText, { history }).catch((sendErr) => {
          api.logger.warn(`[kichi:${service.getAgentId()}] bot_message send or history record failed: ${sendErr}`);
        });
      }).catch((err) => {
        releaseCooldown();
        api.logger.warn(`[kichi:${service.getAgentId()}] bot_message agent run failed: ${err}`);
      });
    });

    api.registerService({
      id: "kichi-forwarder",
      start: (ctx) => {
        parse(ctx.config.plugins?.entries?.["kichi-forwarder"]?.config);
        runtimeManager.initializeStartupRuntimes();
      },
      stop: () => {
        runtimeManager.stopAll();
        const globalState = globalThis as GlobalRuntimeManagerState;
        if (globalState[GLOBAL_RUNTIME_MANAGER_KEY] === runtimeManager) {
          delete globalState[GLOBAL_RUNTIME_MANAGER_KEY];
        }
      },
    });

    registerPluginTools(api, runtimeManager, musicTitleEnum);

  },
};

export default plugin;
