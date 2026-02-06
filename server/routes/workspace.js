import { Router } from 'express';
import { taskStore } from '../agent/taskStore.js';
import { sandboxManager } from '../agent/sandboxManager.js';
import { getCanvasServer } from '../canvas/canvasServer.js';

export const workspaceRoutes = Router();

const WORKSPACE_ROOT = '/home/user/workspace';

// Hot-reload script for canvas preview
const CANVAS_HOTRELOAD_SCRIPT = `
<script>
(function() {
  // Hot-reload WebSocket connection to canvas server
  const ws = new WebSocket('ws://localhost:3002/__canvas_ws__');
  ws.onmessage = function(e) {
    if (e.data === 'reload') {
      console.log('[Canvas] Hot-reloading...');
      location.reload();
    }
  };
  ws.onopen = function() {
    console.log('[Canvas] Connected to hot-reload server');
  };
  ws.onerror = function(err) {
    console.error('[Canvas] WebSocket error:', err);
  };
  console.log('[Canvas] Hot-reload initialized');
})();
</script>
`;

async function getFilesRecursive(sandbox, dir) {
  const files = [];
  try {
    const entries = await sandbox.files.list(dir);

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = `${dir}/${entry.name}`.replace(/\/+/g, '/');
      const relPath = entryPath.replace(WORKSPACE_ROOT + '/', '');

      if (entry.type === 'dir') {
        files.push({ name: entry.name, path: relPath, type: 'directory' });
        const children = await getFilesRecursive(sandbox, entryPath);
        files.push(...children);
      } else {
        files.push({
          name: entry.name,
          path: relPath,
          type: 'file',
        });
      }
    }
  } catch {
    // directory may not exist yet
  }
  return files;
}

// GET /api/workspace/:taskId/files — list workspace files from sandbox
workspaceRoutes.get('/:taskId/files', async (req, res) => {
  try {
    const task = taskStore.get(req.params.taskId);
    const sandbox = sandboxManager.get(task.id);

    if (!sandbox) {
      return res.json({ files: [] });
    }

    const files = await getFilesRecursive(sandbox, WORKSPACE_ROOT);
    res.json({ files });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// GET /api/workspace/:taskId/file?path=... — read a file from sandbox
workspaceRoutes.get('/:taskId/file', async (req, res) => {
  try {
    const task = taskStore.get(req.params.taskId);
    const sandbox = sandboxManager.get(task.id);

    if (!sandbox) {
      return res.status(404).json({ error: 'Sandbox not active' });
    }

    const relPath = req.query.path;
    if (!relPath) return res.status(400).json({ error: 'path query required' });

    // Prevent path traversal
    if (relPath.includes('..')) {
      return res.status(403).json({ error: 'Path traversal blocked' });
    }

    const fullPath = `${WORKSPACE_ROOT}/${relPath}`.replace(/\/+/g, '/');
    const content = await sandbox.files.read(fullPath);
    res.json({ path: relPath, content });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// PUT /api/workspace/:taskId/file — save/update a file in sandbox
workspaceRoutes.put('/:taskId/file', async (req, res) => {
  try {
    const task = taskStore.get(req.params.taskId);
    const sandbox = sandboxManager.get(task.id);

    if (!sandbox) {
      return res.status(404).json({ error: 'Sandbox not active' });
    }

    const { path: relPath, content } = req.body;
    if (!relPath) return res.status(400).json({ error: 'path required' });
    if (content === undefined) return res.status(400).json({ error: 'content required' });

    // Prevent path traversal
    if (relPath.includes('..')) {
      return res.status(403).json({ error: 'Path traversal blocked' });
    }

    const fullPath = `${WORKSPACE_ROOT}/${relPath}`.replace(/\/+/g, '/');
    await sandbox.files.write(fullPath, content);

    // Trigger hot-reload for HTML files
    if (relPath.endsWith('.html')) {
      const canvasServer = await getCanvasServer();
      canvasServer.broadcastReload();
    }

    res.json({ success: true, path: relPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/:taskId/preview/:filename — serve HTML from workspace with hot-reload
workspaceRoutes.get('/:taskId/preview/:filename', async (req, res) => {
  try {
    const task = taskStore.get(req.params.taskId);
    const sandbox = sandboxManager.get(task.id);

    if (!sandbox) {
      return res.status(404).send('Sandbox not active');
    }

    const filename = req.params.filename;
    if (!filename.endsWith('.html')) {
      return res.status(400).send('Only HTML files can be previewed');
    }

    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(403).send('Invalid filename');
    }

    const fullPath = `${WORKSPACE_ROOT}/${filename}`;
    let content = await sandbox.files.read(fullPath);

    // Inject hot-reload script before </body> or at the end
    if (content.includes('</body>')) {
      content = content.replace('</body>', CANVAS_HOTRELOAD_SCRIPT + '</body>');
    } else if (content.includes('</html>')) {
      content = content.replace('</html>', CANVAS_HOTRELOAD_SCRIPT + '</html>');
    } else {
      content += CANVAS_HOTRELOAD_SCRIPT;
    }

    res.type('html').send(content);
  } catch (err) {
    res.status(404).send(`File not found: ${err.message}`);
  }
});
