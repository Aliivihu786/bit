import { BaseTool } from './baseTool.js';

const WORKSPACE_ROOT = '/home/user/workspace';
const DEV_LOG_DIR = `${WORKSPACE_ROOT}/.bit-agent/dev-logs`;
const FOREGROUND_TIMEOUT_MS = 60000;
const BACKGROUND_STARTUP_WAIT_MS = 2000;

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function isLikelyLongRunningCommand(code) {
  const text = String(code || '').trim();
  if (!text) return false;

  // If user already backgrounds it, do not rewrite behavior.
  if (/(^|[\s;])nohup\s+/i.test(text)) return false;
  if (/(^|[\s;])disown(\s|;|$)/i.test(text)) return false;
  if (/[&]\s*$/.test(text)) return false;

  return [
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|watch)\b/i,
    /\b(?:vite|next|nuxt|nuxi)\s+(?:dev|start|preview)\b/i,
    /\b(?:nodemon|ts-node-dev)\b/i,
    /\bpython\s+manage\.py\s+runserver\b/i,
    /\buvicorn\b.*(?:--reload|--host|--port)/i,
    /\bflask\s+run\b/i,
    /\bwebpack\b.*--watch\b/i,
  ].some((pattern) => pattern.test(text));
}

async function readRecentLog(sandbox, logPath) {
  try {
    const tail = await sandbox.commands.run(`tail -n 40 ${shellQuote(logPath)} || true`, {
      cwd: WORKSPACE_ROOT,
      timeoutMs: 10000,
    });
    return (tail.stdout || '').slice(0, 4000);
  } catch {
    return '';
  }
}

export class CodeExecutorTool extends BaseTool {
  constructor(sandboxGetter) {
    super();
    this._getSandbox = sandboxGetter;
  }

  get name() { return 'code_executor'; }

  get description() {
    return 'Execute code in a secure cloud sandbox (E2B). Supports bash, Python, and JavaScript. Use bash for shell commands (ls, pip install, npm install, git, etc). The code runs in a fully isolated environment with network access, file system, and package installation. Code can access files in /home/user/workspace. Long-running dev/server commands are automatically started in background and verified via dev logs.';
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code or command to execute' },
        language: {
          type: 'string',
          enum: ['bash', 'python', 'javascript'],
          description: 'Language: bash for shell commands, python, or javascript (default: bash)',
        },
      },
      required: ['code'],
    };
  }

  async execute({ code, language = 'bash' }) {
    try {
      const sandbox = await this._getSandbox();

      // Handle bash/shell commands
      if (language === 'bash' || language === 'shell' || language === 'sh') {
        if (isLikelyLongRunningCommand(code)) {
          await sandbox.files.makeDir(DEV_LOG_DIR).catch(() => {});

          const logPath = `${DEV_LOG_DIR}/codeexec-${Date.now()}.log`;
          const startCmd = `nohup bash -lc ${shellQuote(code)} > ${shellQuote(logPath)} 2>&1 & echo $!`;
          const start = await sandbox.commands.run(startCmd, {
            cwd: WORKSPACE_ROOT,
            timeoutMs: 20000,
          });
          const pidLine = (start.stdout || '').trim().split('\n').pop();
          const pid = pidLine ? Number(pidLine.trim()) : null;

          if (!Number.isFinite(pid)) {
            return JSON.stringify({
              success: false,
              error: 'Failed to start long-running command in background.',
              stdout: (start.stdout || '').slice(0, 2000),
              stderr: (start.stderr || '').slice(0, 2000),
            });
          }

          await new Promise(resolve => setTimeout(resolve, BACKGROUND_STARTUP_WAIT_MS));
          const procCheck = await sandbox.commands.run(`ps -p ${pid} -o pid=,comm= || true`, {
            cwd: WORKSPACE_ROOT,
            timeoutMs: 10000,
          });
          const running = Boolean((procCheck.stdout || '').trim());
          const recentLog = await readRecentLog(sandbox, logPath);

          return JSON.stringify({
            success: running,
            background: true,
            running,
            pid,
            logPath,
            stdout: recentLog,
            stderr: (start.stderr || '').slice(0, 2000),
            output: running
              ? `Started in background (pid ${pid}). Log: ${logPath}`
              : `Failed to keep process running. Check log: ${logPath}`,
            error: running ? undefined : `Process ${pid} is not running after startup.`,
          });
        }

        const proc = await sandbox.commands.run(code, {
          cwd: WORKSPACE_ROOT,
          timeoutMs: FOREGROUND_TIMEOUT_MS,
        });

        const result = {
          success: proc.exitCode === 0,
          stdout: (proc.stdout || '').slice(0, 4000),
          stderr: (proc.stderr || '').slice(0, 2000),
          exitCode: proc.exitCode,
        };

        if (proc.exitCode !== 0) {
          result.error = `Command exited with code ${proc.exitCode}`;
        }

        // Combine stdout for output field
        result.output = result.stdout || result.stderr || '';

        return JSON.stringify(result);
      }

      // Handle Python and JavaScript
      const execution = await sandbox.runCode(code, {
        language: language === 'javascript' ? 'js' : 'python',
      });

      const result = {
        success: !execution.error,
        stdout: execution.logs.stdout.join('\n').slice(0, 4000),
        stderr: execution.logs.stderr.join('\n').slice(0, 2000),
      };

      if (execution.error) {
        result.error = execution.error.name + ': ' + execution.error.value;
        result.traceback = execution.error.traceback?.slice(0, 2000);
      }

      if (execution.results && execution.results.length > 0) {
        result.output = execution.results.map(r => r.text || r.html || '').filter(Boolean).join('\n').slice(0, 4000);
      }

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  }
}
