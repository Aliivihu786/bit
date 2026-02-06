import { BaseTool } from './baseTool.js';

export class CodeExecutorTool extends BaseTool {
  constructor(sandboxGetter) {
    super();
    this._getSandbox = sandboxGetter;
  }

  get name() { return 'code_executor'; }

  get description() {
    return 'Execute code in a secure cloud sandbox (E2B). Supports bash, Python, and JavaScript. Use bash for shell commands (ls, pip install, npm install, git, etc). The code runs in a fully isolated environment with network access, file system, and package installation. Code can access files in /home/user/workspace.';
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
        const proc = await sandbox.commands.run(code, {
          cwd: '/home/user/workspace',
          timeoutMs: 60000,
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
