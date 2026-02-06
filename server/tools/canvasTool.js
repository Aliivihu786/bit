import { BaseTool } from './baseTool.js';
import fs from 'fs/promises';
import path from 'path';

const CANVAS_DIR = path.join(process.cwd(), 'server', 'canvas', 'files');
const CANVAS_PORT = 3002;

// Ensure canvas directory exists
async function ensureCanvasDir() {
  await fs.mkdir(CANVAS_DIR, { recursive: true });
}

export class CanvasTool extends BaseTool {
  constructor(sandboxGetter) {
    super();
    this._getSandbox = sandboxGetter;
  }

  get name() { return 'canvas'; }

  get description() {
    return `Create and manage interactive HTML pages with live preview and hot-reload.

SIMPLE USAGE - Just provide name and content:
name: "login.html"
content: "<!DOCTYPE html><html><head><title>Login</title></head><body><h1>Welcome!</h1></body></html>"

The tool will automatically:
- Create the file if it doesn't exist
- Update the file if it already exists
- Show preview with hot-reload
- Save to workspace for editing

EXPLICIT ACTIONS (optional):
- create: Make new HTML file (needs: name, content)
- update: Modify existing HTML (needs: name, content)
- list: Show all HTML files (no parameters needed)
- read: Get HTML content (needs: name)
- delete: Remove HTML file (needs: name)`;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'list', 'read', 'delete'],
          description: 'The canvas operation (optional - will be inferred if not provided). Options: create, update, list, read, delete',
          examples: ['create', 'update', 'list'],
        },
        name: {
          type: 'string',
          description: 'Canvas filename (MUST end with .html). Example: "dashboard.html" or "login.html"',
          examples: ['dashboard.html', 'login.html', 'index.html'],
        },
        content: {
          type: 'string',
          description: 'Complete HTML content for create/update. Must be full valid HTML starting with <!DOCTYPE html>',
          examples: ['<!DOCTYPE html><html><head><title>My Page</title></head><body><h1>Hello</h1></body></html>'],
        },
      },
      required: [],
      additionalProperties: false,
    };
  }

  async execute(args, context) {
    await ensureCanvasDir();

    // Log received arguments for debugging
    console.log('[CanvasTool] Received args:', JSON.stringify(args));

    // Extract taskId from context
    const taskId = context?.taskId;

    // If no args at all, return list of canvases
    if (!args || Object.keys(args).length === 0) {
      console.log('[CanvasTool] No arguments provided, returning list of canvases');
      return this._list(taskId);
    }

    let { action, name, content } = args;

    // Smart action inference if action is missing
    if (!action) {
      console.log('[CanvasTool] Action not provided, inferring from parameters...');

      if (name && content) {
        // Has both name and content -> try to update, create if doesn't exist
        try {
          const sandbox = await this._getSandbox();
          const workspacePath = `/home/user/workspace/${name.endsWith('.html') ? name : name + '.html'}`;
          await sandbox.files.read(workspacePath);
          action = 'update'; // File exists, update it
          console.log('[CanvasTool] Inferred action: update (file exists)');
        } catch {
          action = 'create'; // File doesn't exist, create it
          console.log('[CanvasTool] Inferred action: create (file not found)');
        }
      } else if (name && !content) {
        // Has only name -> read the file
        action = 'read';
        console.log('[CanvasTool] Inferred action: read');
      } else {
        // No name or content -> list all canvases
        action = 'list';
        console.log('[CanvasTool] Inferred action: list');
      }
    }

    switch (action) {
      case 'create':
        return this._create(name, content, taskId);
      case 'update':
        return this._update(name, content, taskId);
      case 'list':
        return this._list(taskId);
      case 'read':
        return this._read(name, taskId);
      case 'delete':
        return this._delete(name, taskId);
      default:
        throw new Error(`Unknown action: ${action}. Valid actions: create, update, list, read, delete`);
    }
  }

  async _create(name, content, taskId) {
    if (!name) throw new Error('Canvas name is required');
    if (!content) throw new Error('Content is required');
    if (!taskId) throw new Error('Task ID is required');

    // Ensure .html extension
    if (!name.endsWith('.html')) {
      name += '.html';
    }

    // Write to workspace (single source of truth)
    const sandbox = await this._getSandbox();
    const workspacePath = `/home/user/workspace/${name}`;

    // Check if exists in workspace
    try {
      await sandbox.files.read(workspacePath);
      throw new Error(`Canvas "${name}" already exists. Use update action to modify it.`);
    } catch (err) {
      if (!err.message.includes('not found') && !err.message.includes('does not exist')) {
        throw err;
      }
      // File doesn't exist, proceed with creation
    }

    // Write file to workspace
    await sandbox.files.write(workspacePath, content);

    // URL points to workspace preview endpoint
    const previewUrl = `http://localhost:3001/api/workspace/${taskId}/preview/${name}`;

    return JSON.stringify({
      created: true,
      name,
      path: name, // Workspace path for file explorer
      url: previewUrl,
      message: `Canvas created! View it at ${previewUrl}`,
    });
  }

  async _update(name, content, taskId) {
    if (!name) throw new Error('Canvas name is required');
    if (!content) throw new Error('Content is required');
    if (!taskId) throw new Error('Task ID is required');

    // Ensure .html extension
    if (!name.endsWith('.html')) {
      name += '.html';
    }

    // Write to workspace (single source of truth)
    const sandbox = await this._getSandbox();
    const workspacePath = `/home/user/workspace/${name}`;

    // Check if exists in workspace
    try {
      await sandbox.files.read(workspacePath);
    } catch (err) {
      throw new Error(`Canvas "${name}" not found. Use create action first.`);
    }

    // Update file in workspace
    await sandbox.files.write(workspacePath, content);

    // URL points to workspace preview endpoint
    const previewUrl = `http://localhost:3001/api/workspace/${taskId}/preview/${name}`;

    return JSON.stringify({
      updated: true,
      name,
      path: name, // Workspace path for file explorer
      url: previewUrl,
      message: `Canvas updated! Hot-reload will refresh any open viewers.`,
    });
  }

  async _list(taskId) {
    try {
      const sandbox = await this._getSandbox();
      const entries = await sandbox.files.list('/home/user/workspace');
      const canvases = entries
        .filter(e => e.type === 'file' && e.name.endsWith('.html'))
        .map(e => ({
          name: e.name,
          url: taskId ? `http://localhost:3001/api/workspace/${taskId}/preview/${e.name}` : e.name,
        }));

      return JSON.stringify({
        canvases,
        count: canvases.length,
        message: canvases.length > 0
          ? `Found ${canvases.length} canvas(es)`
          : 'No canvases found. Use create action to make one.',
      });
    } catch (err) {
      return JSON.stringify({ canvases: [], count: 0, message: 'No canvases found.' });
    }
  }

  async _read(name, taskId) {
    if (!name) throw new Error('Canvas name is required');

    // Ensure .html extension
    if (!name.endsWith('.html')) {
      name += '.html';
    }

    try {
      const sandbox = await this._getSandbox();
      const workspacePath = `/home/user/workspace/${name}`;
      const content = await sandbox.files.read(workspacePath);

      return JSON.stringify({
        name,
        content,
        url: taskId ? `http://localhost:3001/api/workspace/${taskId}/preview/${name}` : name,
      });
    } catch (err) {
      throw new Error(`Canvas "${name}" not found.`);
    }
  }

  async _delete(name, taskId) {
    if (!name) throw new Error('Canvas name is required');

    // Ensure .html extension
    if (!name.endsWith('.html')) {
      name += '.html';
    }

    try {
      const sandbox = await this._getSandbox();
      const workspacePath = `/home/user/workspace/${name}`;
      await sandbox.files.remove(workspacePath);

      return JSON.stringify({
        deleted: true,
        name,
        message: `Canvas "${name}" deleted.`,
      });
    } catch (err) {
      throw new Error(`Canvas "${name}" not found.`);
    }
  }
}
