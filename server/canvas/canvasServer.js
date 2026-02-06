/**
 * Canvas Server - Live Interactive UI with WebSocket hot-reload
 *
 * Inspired by OpenClaw's canvas-host system
 *
 * Features:
 * - Serve HTML/JS/CSS files for interactive UIs
 * - WebSocket for live hot-reload on file changes
 * - A2UI bridge for agent-UI communication
 * - File watching with chokidar
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';

const CANVAS_DIR = path.join(process.cwd(), 'server', 'canvas', 'files');
const DEFAULT_PORT = 3002;

// Injected script for hot-reload and A2UI bridge
const INJECTED_SCRIPT = `
<script>
(function() {
  // Hot-reload WebSocket connection
  const ws = new WebSocket('ws://' + location.host + '/__canvas_ws__');
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

  // A2UI Bridge - Agent to UI communication
  window.canvasState = {};

  window.canvasSetState = function(key, value) {
    window.canvasState[key] = value;
    window.dispatchEvent(new CustomEvent('canvas:state-change', {
      detail: { key, value, state: window.canvasState }
    }));
  };

  window.canvasGetState = function(key) {
    return key ? window.canvasState[key] : window.canvasState;
  };

  window.canvasSendAction = function(action) {
    console.log('[Canvas] Action:', action);
    window.dispatchEvent(new CustomEvent('canvas:action', { detail: action }));
    // Store in sessionStorage for agent retrieval
    const actions = JSON.parse(sessionStorage.getItem('canvas_actions') || '[]');
    actions.push({ ...action, timestamp: Date.now() });
    sessionStorage.setItem('canvas_actions', JSON.stringify(actions.slice(-50)));
  };

  console.log('[Canvas] A2UI Bridge initialized');
})();
</script>
`;

export class CanvasServer {
  constructor(options = {}) {
    this.port = options.port || DEFAULT_PORT;
    this.canvasDir = options.canvasDir || CANVAS_DIR;
    this.app = express();
    this.server = null;
    this.wss = null;
    this.watcher = null;
    this.clients = new Set();
    this.running = false;
  }

  async start() {
    if (this.running) return;

    // Ensure canvas directory exists
    await fs.mkdir(this.canvasDir, { recursive: true });

    // Setup Express routes
    this.setupRoutes();

    // Create HTTP server
    this.server = http.createServer(this.app);

    // Setup WebSocket server for hot-reload
    this.wss = new WebSocketServer({ noServer: true });
    this.setupWebSocket();

    // Setup file watcher
    this.setupFileWatcher();

    // Start server
    await new Promise((resolve, reject) => {
      this.server.listen(this.port, (err) => {
        if (err) reject(err);
        else {
          console.log(`[CanvasServer] Running on http://localhost:${this.port}`);
          this.running = true;
          resolve();
        }
      });
    });
  }

  setupRoutes() {
    // Serve static files from canvas directory
    this.app.use(express.static(this.canvasDir));

    // List all canvases
    this.app.get('/__canvas_api__/list', async (req, res) => {
      try {
        const files = await fs.readdir(this.canvasDir);
        const canvases = files.filter(f => f.endsWith('.html'));
        res.json({ canvases });
      } catch (err) {
        res.json({ canvases: [], error: err.message });
      }
    });

    // Get canvas content
    this.app.get('/__canvas_api__/get/:name', async (req, res) => {
      try {
        const filePath = path.join(this.canvasDir, req.params.name);
        const content = await fs.readFile(filePath, 'utf-8');
        res.json({ content });
      } catch (err) {
        res.status(404).json({ error: 'Canvas not found' });
      }
    });

    // Create/update canvas
    this.app.post('/__canvas_api__/save/:name', express.json(), async (req, res) => {
      try {
        const { content } = req.body;
        const filePath = path.join(this.canvasDir, req.params.name);
        await fs.writeFile(filePath, content);
        res.json({ success: true, url: `http://localhost:${this.port}/${req.params.name}` });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Delete canvas
    this.app.delete('/__canvas_api__/delete/:name', async (req, res) => {
      try {
        const filePath = path.join(this.canvasDir, req.params.name);
        await fs.unlink(filePath);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Serve HTML files with injected hot-reload script
    this.app.get('*.html', async (req, res, next) => {
      const filePath = path.join(this.canvasDir, req.path);
      try {
        let content = await fs.readFile(filePath, 'utf-8');
        // Inject hot-reload script before </body>
        if (content.includes('</body>')) {
          content = content.replace('</body>', INJECTED_SCRIPT + '</body>');
        } else {
          content += INJECTED_SCRIPT;
        }
        res.type('html').send(content);
      } catch (err) {
        next();
      }
    });
  }

  setupWebSocket() {
    this.server.on('upgrade', (request, socket, head) => {
      if (request.url === '/__canvas_ws__') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`[CanvasServer] Client connected (${this.clients.size} total)`);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[CanvasServer] Client disconnected (${this.clients.size} total)`);
      });

      ws.on('error', (err) => {
        console.error('[CanvasServer] WebSocket error:', err.message);
        this.clients.delete(ws);
      });
    });
  }

  setupFileWatcher() {
    this.watcher = chokidar.watch(this.canvasDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      ignored: /(^|[\/\\])\../,
    });

    this.watcher.on('change', (filePath) => {
      console.log(`[CanvasServer] File changed: ${path.basename(filePath)}`);
      this.broadcastReload();
    });

    this.watcher.on('add', (filePath) => {
      console.log(`[CanvasServer] File added: ${path.basename(filePath)}`);
      this.broadcastReload();
    });
  }

  broadcastReload() {
    for (const client of this.clients) {
      try {
        client.send('reload');
      } catch (err) {
        // Client disconnected
        this.clients.delete(client);
      }
    }
  }

  async stop() {
    if (!this.running) return;

    if (this.watcher) {
      await this.watcher.close();
    }

    if (this.wss) {
      this.wss.close();
    }

    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
    }

    this.running = false;
    console.log('[CanvasServer] Stopped');
  }

  getStatus() {
    return {
      running: this.running,
      port: this.port,
      canvasDir: this.canvasDir,
      connectedClients: this.clients.size,
    };
  }
}

// Singleton instance
let serverInstance = null;

export async function getCanvasServer() {
  if (!serverInstance) {
    serverInstance = new CanvasServer();
  }
  return serverInstance;
}

export async function startCanvasServer() {
  const server = await getCanvasServer();
  await server.start();
  return server;
}
