const WORKSPACE_ROOT = '/home/user/workspace';
const LOG_DIR = `${WORKSPACE_ROOT}/.bit-agent/dev-logs`;
const DEFAULT_STARTUP_TIMEOUT_MS = 90_000;
const DEFAULT_PROBE_INTERVAL_MS = 1_500;

function logPathFor(taskId, port) {
  return `${LOG_DIR}/${taskId}-${port}.log`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  async _waitForPort({ sandbox, cwd, port, timeoutMs, intervalMs }) {
    const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const probe = await sandbox.commands.run(
          `ss -ltn | grep -E '[\\.:]${port}[[:space:]]' || true`,
          { cwd, timeoutMs: 10_000 },
        );
        if ((probe.stdout || '').trim()) {
          return { ready: true, attempts: attempt };
        }
      } catch {
        // keep polling
      }
      await sleep(intervalMs);
    }
    return { ready: false, attempts };
  }

  async _waitForUrl({ sandbox, cwd, url, expectedStatuses, headers, timeoutMs, intervalMs }) {
    const headerArgs = Object.entries(headers || {})
      .map(([k, v]) => `-H ${shellQuote(`${k}: ${v}`)}`)
      .join(' ');
    const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const cmd = [
          'curl -sS -o /dev/null -w "%{http_code}"',
          headerArgs,
          shellQuote(url),
          '|| true',
        ].filter(Boolean).join(' ');

        const probe = await sandbox.commands.run(cmd, { cwd, timeoutMs: 15_000 });
        const status = Number((probe.stdout || '').trim().slice(-3));
        if (expectedStatuses.has(status)) {
          return { ready: true, attempts: attempt, status };
        }
      } catch {
        // keep polling
      }
      await sleep(intervalMs);
    }

    return { ready: false, attempts, status: null };
  }

  async _waitForStartup({ sandbox, cwd, port, waitFor }) {
    if (!waitFor || waitFor.enabled === false) {
      return { ready: true, mode: 'none', attempts: 0 };
    }

    const timeoutMs = waitFor.timeoutMs || DEFAULT_STARTUP_TIMEOUT_MS;
    const intervalMs = waitFor.intervalMs || DEFAULT_PROBE_INTERVAL_MS;

    if (waitFor.url) {
      const statuses = new Set(
        Array.isArray(waitFor.expectedStatus)
          ? waitFor.expectedStatus
          : [waitFor.expectedStatus || 200],
      );
      const urlResult = await this._waitForUrl({
        sandbox,
        cwd,
        url: waitFor.url,
        expectedStatuses: statuses,
        headers: waitFor.headers,
        timeoutMs,
        intervalMs,
      });
      if (urlResult.ready) {
        return { ready: true, mode: 'url', attempts: urlResult.attempts, status: urlResult.status };
      }
    }

    const portResult = await this._waitForPort({
      sandbox,
      cwd,
      port,
      timeoutMs,
      intervalMs,
    });
    if (portResult.ready) {
      return { ready: true, mode: 'port', attempts: portResult.attempts };
    }

    return { ready: false, mode: waitFor.url ? 'url+port' : 'port', attempts: portResult.attempts };
  }

  async start({ taskId, sandbox, cwd, command, port, restart = true, waitFor = null }) {
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
    const safePid = Number.isFinite(pid) ? pid : null;

    const waitResult = await this._waitForStartup({
      sandbox,
      cwd,
      port,
      waitFor,
    });
    if (!waitResult.ready) {
      if (safePid) {
        await sandbox.commands.run(`kill ${safePid} || true`, {
          cwd: WORKSPACE_ROOT,
          timeoutMs: 10_000,
        }).catch(() => {});
      }
      throw new Error(`Service on port ${port} did not become ready in time.`);
    }

    const info = {
      taskId,
      port,
      pid: safePid,
      command,
      cwd,
      logPath,
      startedAt: Date.now(),
      readyMode: waitResult.mode,
      readyAttempts: waitResult.attempts,
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
