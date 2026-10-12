import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readConnectionConfig } from './connection.js';
import { HookTracker, parseHook } from './hooks.js';
import { errorMessage, type BridgeConfig } from './ipc.js';
import { KichiMcpClient, requireToolSuccess } from './remote.js';

export async function serve(config: BridgeConfig): Promise<{ close(): Promise<void> }> {
  const connection = await readConnectionConfig(config);
  await mkdir(config.runtimeDir, { recursive: true, mode: 0o700 });
  const remote = new KichiMcpClient(connection);
  const tracker = new HookTracker();
  const logError = (error: unknown) => process.stderr.write(`[kichi] ${errorMessage(error)}\n`);
  let lastMotion: string | undefined;
  let token: string | undefined;
  let closing = false;
  let pending = Promise.resolve();

  // Keep profile selection and Hook updates ordered across concurrent Codex chats.
  async function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = pending;
    let release!: () => void;
    pending = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

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
      if (req.url === '/ping') {
        return respond(200, { result: { pid: process.pid, profile: config.profile, transport: 'streamable-http', serverUrl: connection.serverUrl } });
      }
      await serialized(async () => {
        if (closing) throw new Error('Kichi bridge is closing.');
        switch (req.url) {
          case '/tools/list':
            return respond(200, { result: await remote.listTools(data) });
          case '/status':
            return respond(200, { result: await remote.status() });
          case '/hook': {
            const event = parseHook({ ...data, hook_event_name: data.event });
            if (!event) return respond(200, { result: null });
            const feedback = tracker.accept(event);
            const avatarId = remote.selectedAvatarId;
            if (!avatarId) {
              lastMotion = undefined;
              return respond(200, { result: null });
            }
            if (feedback) {
              const { notification, ...motion } = feedback;
              if (notification) {
                const name = `kichi_${notification.type}`;
                requireToolSuccess(name, await remote.callTool({ name, arguments: { request: { avatarId, bubble: notification.bubble } } }, 5_000));
              }
              const signature = JSON.stringify(motion);
              if (signature !== lastMotion) {
                requireToolSuccess('kichi_action', await remote.callTool({
                  name: 'kichi_action',
                  arguments: { request: { avatarId, ...motion, log: '', verify: false } },
                }, 5_000));
                lastMotion = signature;
              }
            }
            return respond(200, { result: null });
          }
          case '/tool': {
            if (typeof data.name !== 'string') throw new Error('Tool name is required.');
            const result = await remote.callTool(data);
            if (!result.isError) {
              if (['kichi_join', 'kichi_rejoin', 'kichi_leave', 'kichi_action', 'kichi_idle_plan', 'kichi_bot_message'].includes(data.name)) {
                lastMotion = undefined;
              }
              if (data.name === 'kichi_leave' && !remote.selectedAvatarId) tracker.reset();
            }
            return respond(200, { result });
          }
          case '/stop':
            closing = true;
            try {
              await remote.close();
              respond(200, { result: { stopped: true } });
            } finally {
              server.close((error) => { if (error) logError(error); });
              await unlink(config.tokenPath);
            }
            return;
          default:
            return respond(404, { error: 'Unknown bridge endpoint.' });
        }
      });
    } catch (error) {
      logError(error);
      if (!res.headersSent) respond(500, { error: errorMessage(error) });
    }
  });

  // Claim the profile endpoint before opening its shared remote MCP client.
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
    await remote.connect();
    token = newToken;
  } catch (error) {
    await remote.close();
    server.close();
    await unlink(config.tokenPath);
    throw error;
  }
  return {
    async close() {
      if (closing) return;
      closing = true;
      try { await serialized(() => remote.close()); }
      finally {
        await new Promise<void>((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()));
        await unlink(config.tokenPath);
      }
    },
  };
}
