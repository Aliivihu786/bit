import { BaseTool } from './baseTool.js';

const WORKSPACE_ROOT = '/home/user/workspace';

export class FileManagerTool extends BaseTool {
  constructor(sandboxGetter) {
    super();
    this._getSandbox = sandboxGetter;
  }

  get name() { return 'file_manager'; }

  get description() {
    return 'Manage files in the sandbox workspace. Can create, read, edit, delete, and list files. All paths are relative to the workspace root. Files persist across tool calls within the same task.';
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write', 'list', 'delete', 'mkdir'],
          description: 'The file operation to perform',
        },
        path: { type: 'string', description: 'Relative file/directory path within workspace' },
        content: { type: 'string', description: 'File content (for write action)' },
      },
      required: ['action', 'path'],
    };
  }

  _fullPath(relPath) {
    // Prevent path traversal
    const cleaned = relPath.replace(/\.\.\//g, '').replace(/\.\./g, '');
    return `${WORKSPACE_ROOT}/${cleaned}`.replace(/\/+/g, '/');
  }

  async execute({ action, path: relPath, content }) {
    const sandbox = await this._getSandbox();
    const fullPath = this._fullPath(relPath);

    switch (action) {
      case 'read': {
        const data = await sandbox.files.read(fullPath);
        return JSON.stringify({ path: relPath, content: data.slice(0, 10000) });
      }
      case 'write': {
        // Ensure parent directory exists
        const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (parentDir && parentDir !== WORKSPACE_ROOT) {
          await sandbox.files.makeDir(parentDir).catch(() => {});
        }
        await sandbox.files.write(fullPath, content || '');
        return JSON.stringify({ path: relPath, written: true, bytes: (content || '').length });
      }
      case 'list': {
        const entries = await sandbox.files.list(fullPath);
        const items = entries
          .filter(e => !e.name.startsWith('.'))
          .map(e => ({ name: e.name, type: e.type === 'dir' ? 'directory' : 'file' }));
        return JSON.stringify({ path: relPath, entries: items });
      }
      case 'delete': {
        await sandbox.files.remove(fullPath);
        return JSON.stringify({ path: relPath, deleted: true });
      }
      case 'mkdir': {
        await sandbox.files.makeDir(fullPath);
        return JSON.stringify({ path: relPath, created: true });
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
}
