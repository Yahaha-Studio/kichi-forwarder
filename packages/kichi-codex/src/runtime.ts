import { KichiForwarderService, loadEnvironmentsConfig } from '@yahaha-studio/kichi-core';
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { HookTracker, parseHook } from './hooks.js';
import { errorMessage, type BridgeConfig } from './ipc.js';
import { executeKichiOperation } from './tools.js';

export async function serve(config: BridgeConfig): Promise<{ close(): Promise<void> }> {
  await mkdir(config.runtimeDir, { recursive: true, mode: 0o700 });
  const environments = loadEnvironmentsConfig();
  const logger = {
    debug: (_message: string) => {},
    info: (message: string) => process.stderr.write(`[kichi] ${message}\n`),
    warn: (message: string) => process.stderr.write(`[kichi] ${message}\n`),
    error: (message: string) => process.stderr.write(`[kichi] ${message}\n`),
  };
  const service = new KichiForwarderService(logger, {
    agentId: `codex:${config.profile}`,
    runtimeDir: config.runtimeDir,
    resolveEnvironmentHost: (environment) => environments[environment],
  });
  const tracker = new HookTracker();
  let lastMotion: string | undefined;
  let token: string | undefined;
  let closing = false;

  const server = createServer(async (req, res) => {
    const respond = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (!token || closing) return respond(503, { error: 'Kichi bridge is not ready.' });
    if (req.headers.authorization !== `Bearer ${token}`) return respond(403, { error: 'Unauthorized.' });
    if (req.method !== 'POST') return respond(405, { error: 'Use POST.' });
    try {
      let raw = '';
      req.setEncoding('utf8');
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected an object.');
      switch (req.url) {
        case '/ping':
          return respond(200, { result: { pid: process.pid, profile: config.profile } });
        case '/hook': {
          const event = parseHook({ ...data, hook_event_name: data.event });
          if (!event) return respond(200, { result: null });
          const feedback = tracker.accept(event);
          const status = service.getConnectionStatus();
          // No join credentials (including after Leave) means avatar feedback is inactive.
          if (!status.hasAuthKey) {
            lastMotion = undefined;
            return respond(200, { result: null });
          }
          if (!status.connected) {
            lastMotion = undefined;
            throw new Error('Kichi is disconnected; avatar feedback was not sent.');
          }
          if (feedback) {
            const { notification, ...motion } = feedback;
            if (notification) service.sendHookNotify(notification.type, notification.bubble);
            const signature = JSON.stringify(motion);
            if (signature !== lastMotion) {
              service.sendStatus(motion.poseType, motion.action, motion.bubble, '', { mode: 'loop' }, motion.avatarStatus);
              lastMotion = signature;
            }
          }
          // Local acceptance only: these Core notifications do not have delivery ACKs.
          return respond(200, { result: null });
        }
        case '/tool': {
          if (typeof data.action !== 'string') throw new Error('action must be a string.');
          if (['join', 'switch_host', 'rejoin', 'leave'].includes(data.action)) lastMotion = undefined;
          const result = await executeKichiOperation(service, data.action, data.parameters);
          if (data.action === 'action' || data.action === 'idle_plan' ||
              (data.action === 'bot_message' && data.parameters?.poseType !== undefined)) {
            lastMotion = undefined;
          }
          if (data.action === 'leave') tracker.reset();
          return respond(200, { result });
        }
        case '/stop':
          closing = true;
          await service.stop();
          respond(200, { result: { stopped: true } });
          server.close((error) => { if (error) logger.error(error.message); });
          await unlink(config.tokenPath);
          return;
        default:
          return respond(404, { error: 'Unknown bridge endpoint.' });
      }
    } catch (error) {
      logger.error(errorMessage(error));
      if (!res.headersSent) respond(500, { error: errorMessage(error) });
    }
  });

  // Claim the endpoint before starting Core or writing credentials: only one process owns this profile.
  await new Promise<void>((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(config.socketPath, () => {
      server.removeListener('error', reject);
      resolveReady();
    });
  });
  try {
    const newToken = randomBytes(32).toString('hex');
    await writeFile(config.tokenPath, newToken, { mode: 0o600 });
    await service.start();
    token = newToken;
  } catch (error) {
    await service.stop();
    server.close();
    throw error;
  }
  return {
    async close() {
      if (closing) return;
      closing = true;
      await service.stop();
      await new Promise<void>((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()));
      await unlink(config.tokenPath);
    },
  };
}
