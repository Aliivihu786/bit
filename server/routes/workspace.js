import { Router } from 'express';
import path from 'path';
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
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(protocol + '://' + location.hostname + ':3002/__canvas_ws__');
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

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

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

async function proxySandboxService(req, res) {
  try {
    const task = taskStore.get(req.params.taskId);
    const sandbox = sandboxManager.get(task.id);

    if (!sandbox) {
      return res.status(404).send('Sandbox not active');
    }

    const port = Number(req.params.port);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return res.status(400).send('Invalid port');
    }

    const relPath = req.params[0] || '';
    if (relPath.includes('..')) {
      return res.status(403).send('Path traversal blocked');
    }

    const host = sandbox.getHost(port);
    const baseUrl = host.startsWith('http://') || host.startsWith('https://')
      ? host
      : `https://${host}`;
    const targetUrl = new URL(`/${relPath}`, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

    const rawQuery = req.originalUrl.split('?')[1];
    if (rawQuery) {
      targetUrl.search = rawQuery;
    }

    const headers = {};
    if (typeof req.headers.accept === 'string') headers.accept = req.headers.accept;
    if (typeof req.headers['user-agent'] === 'string') {
      headers['user-agent'] = req.headers['user-agent'];
    }
    if (sandbox.trafficAccessToken) {
      headers['e2b-traffic-access-token'] = sandbox.trafficAccessToken;
    }

    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers,
      redirect: 'follow',
    });

    res.status(response.status);
    const passthroughHeaders = ['content-type', 'cache-control', 'etag', 'last-modified'];
    for (const name of passthroughHeaders) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    res.status(502).send(`Preview proxy failed: ${err.message}`);
  }
}

// GET /api/workspace/:taskId/preview-service/:port(/path) — proxy sandbox service with traffic token when needed
workspaceRoutes.get('/:taskId/preview-service/:port', proxySandboxService);
workspaceRoutes.get('/:taskId/preview-service/:port/*', proxySandboxService);

// GET /api/workspace/:taskId/preview-app/* — serve static files from workspace
workspaceRoutes.get('/:taskId/preview-app/*', async (req, res) => {
  try {
    const task = taskStore.get(req.params.taskId);
    const sandbox = sandboxManager.get(task.id);

    if (!sandbox) {
      return res.status(404).send('Sandbox not active');
    }

    const relPath = req.params[0];
    if (!relPath) {
      return res.status(400).send('Path required');
    }

    if (relPath.includes('..')) {
      return res.status(403).send('Path traversal blocked');
    }

    const resolvePath = (p) => `${WORKSPACE_ROOT}/${p}`.replace(/\/+/g, '/');

    let fullPath = resolvePath(relPath);
    let content;
    try {
      content = await sandbox.files.read(fullPath);
    } catch {
      // If a directory is requested, try index.html
      if (!path.extname(fullPath)) {
        fullPath = resolvePath(relPath.replace(/\/$/, '') + '/index.html');
        content = await sandbox.files.read(fullPath);
      } else {
        return res.status(404).send('File not found');
      }
    }

    const ext = path.extname(fullPath).toLowerCase();
    res.setHeader('Content-Type', STATIC_MIME[ext] || 'application/octet-stream');
    res.send(content);
  } catch (err) {
    res.status(404).send(`File not found: ${err.message}`);
  }
});
