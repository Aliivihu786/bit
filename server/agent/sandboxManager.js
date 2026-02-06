let SandboxClass = null;

// 1 hour max for hobby plan; set high so long tasks don't expire
const SANDBOX_TIMEOUT_MS = 3_600_000;
// Extend the sandbox timeout every 3 minutes during active use
const KEEPALIVE_INTERVAL_MS = 3 * 60 * 1000;

async function getSandboxClass() {
  if (!SandboxClass) {
    const mod = await import('@e2b/code-interpreter');
    SandboxClass = mod.Sandbox;
  }
  return SandboxClass;
}

export class SandboxManager {
  constructor() {
    this.sandboxes = new Map();    // taskId -> sandbox instance
    this.keepAlives = new Map();   // taskId -> interval id
  }

  async create(taskId) {
    const Sandbox = await getSandboxClass();
    const sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY,
      timeoutMs: SANDBOX_TIMEOUT_MS,
    });

    // Create a workspace directory inside the sandbox
    await sandbox.files.makeDir('/home/user/workspace');

    this.sandboxes.set(taskId, sandbox);
    this._startKeepAlive(taskId, sandbox);
    return sandbox;
  }

  get(taskId) {
    return this.sandboxes.get(taskId) || null;
  }

  async getOrCreate(taskId) {
    let sandbox = this.sandboxes.get(taskId);
    if (sandbox) {
      // Check if sandbox is still alive
      try {
        await sandbox.files.list('/home/user/workspace');
        return sandbox;
      } catch {
        // Sandbox timed out or died — clean up and recreate
        console.log(`[Sandbox] Sandbox for task ${taskId} expired, recreating...`);
        this._stopKeepAlive(taskId);
        this.sandboxes.delete(taskId);
      }
    }
    sandbox = await this.create(taskId);
    return sandbox;
  }

  _startKeepAlive(taskId, sandbox) {
    this._stopKeepAlive(taskId);
    const interval = setInterval(async () => {
      try {
        const Sandbox = await getSandboxClass();
        await Sandbox.setTimeout(sandbox.sandboxId, SANDBOX_TIMEOUT_MS, {
          apiKey: process.env.E2B_API_KEY,
        });
      } catch {
        // Sandbox may already be dead, stop trying
        this._stopKeepAlive(taskId);
      }
    }, KEEPALIVE_INTERVAL_MS);
    this.keepAlives.set(taskId, interval);
  }

  _stopKeepAlive(taskId) {
    const interval = this.keepAlives.get(taskId);
    if (interval) {
      clearInterval(interval);
      this.keepAlives.delete(taskId);
    }
  }

  async kill(taskId) {
    this._stopKeepAlive(taskId);
    const sandbox = this.sandboxes.get(taskId);
    if (sandbox) {
      await sandbox.kill().catch(() => {});
      this.sandboxes.delete(taskId);
    }
  }

  async killAll() {
    for (const [taskId] of this.sandboxes) {
      await this.kill(taskId);
    }
  }
}

export const sandboxManager = new SandboxManager();
