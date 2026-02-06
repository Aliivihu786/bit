import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { agentRoutes } from './routes/agent.js';
import { workspaceRoutes } from './routes/workspace.js';
import { browserRoutes } from './routes/browser.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { startCanvasServer } from './canvas/canvasServer.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Browser proxy has no rate limit (it just proxies pages for the iframe)
app.use('/api/browser', browserRoutes);

// Rate limit agent and workspace API routes
app.use('/api/agent', rateLimiter, agentRoutes);
app.use('/api/workspace', rateLimiter, workspaceRoutes);

app.use(errorHandler);

// Start main server
app.listen(config.port, async () => {
  console.log(`Bit Agent server running on port ${config.port}`);

  // Start canvas server for interactive UIs
  try {
    await startCanvasServer();
  } catch (err) {
    console.error('Failed to start canvas server:', err.message);
  }
});
