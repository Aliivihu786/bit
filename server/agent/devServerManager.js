const WORKSPACE_ROOT = '/home/user/workspace';
const LOG_DIR = `${WORKSPACE_ROOT}/.bit-agent/dev-logs`;

function logPathFor(taskId, port) {
  return `${LOG_DIR}/${taskId}-${port}.log`;
}

export class DevServerManager {
  constructor() {
    this.servers = new Map(); // key: taskId:port -> info
  }

  _key(taskId, port) {
    return `${taskId}:${port}`;
  }

  get(taskId, port) {
    return this.servers.get(this._key(taskId, port)) || null;
  }

  async start({ taskId, sandbox, cwd, command, port, restart = true }) {
    const key = this._key(taskId, port);
    const existing = this.servers.get(key);
    if (existing && !restart) {
      return existing;
    }

    if (existing && restart) {
      await this.stop({ taskId, sandbox, port });
    }

    await sandbox.files.makeDir(LOG_DIR).catch(() => {});
    const logPath = logPathFor(taskId, port);

    // Start process in the background
    const startCmd = `nohup ${command} > ${logPath} 2>&1 & echo $!`;
    const proc = await sandbox.commands.run(startCmd, {
      cwd,
      timeoutMs: 60000,
    });

    const pidLine = (proc.stdout || '').trim().split('\n').pop();
    const pid = pidLine ? Number(pidLine.trim()) : null;

    const info = {
      taskId,
      port,
      pid: Number.isFinite(pid) ? pid : null,
      command,
      cwd,
      logPath,
      startedAt: Date.now(),
    };

    this.servers.set(key, info);
    return info;
  }

  async stop({ taskId, sandbox, port }) {
    const key = this._key(taskId, port);
    const info = this.servers.get(key);
    if (!info) return false;

    if (info.pid) {
      await sandbox.commands.run(`kill ${info.pid} || true`, {
        cwd: WORKSPACE_ROOT,
        timeoutMs: 10000,
      });
    }

    this.servers.delete(key);
    return true;
  }

  async killAllForTask(taskId, sandbox) {
    const keys = [...this.servers.keys()].filter(k => k.startsWith(`${taskId}:`));
    for (const key of keys) {
      const [, portStr] = key.split(':');
      const port = Number(portStr);
      if (Number.isFinite(port)) {
        await this.stop({ taskId, sandbox, port });
      } else {
        this.servers.delete(key);
      }
    }
  }
}

export const devServerManager = new DevServerManager();
