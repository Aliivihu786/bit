import { Router } from 'express';
import { AgentOrchestrator } from '../agent/orchestrator.js';
import { createToolRegistry } from '../agent/toolRegistry.js';
import { taskStore } from '../agent/taskStore.js';
import { sandboxManager } from '../agent/sandboxManager.js';
import { browserSessionManager } from '../agent/browserSessionManager.js';

export const agentRoutes = Router();

// POST /api/agent/run — start a new agent task (returns SSE stream)
agentRoutes.post('/run', async (req, res) => {
  const { message, taskId: existingTaskId } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  let task;
  if (existingTaskId) {
    try {
      task = taskStore.get(existingTaskId);
    } catch {
      return res.status(404).json({ error: 'Task not found' });
    }
  } else {
    task = taskStore.create();
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  res.write(`data: ${JSON.stringify({ type: 'task_created', taskId: task.id })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'status', message: 'Creating sandbox environment...' })}\n\n`);

  try {
    // Create or reuse E2B sandbox for this task
    const sandbox = await sandboxManager.getOrCreate(task.id);

    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Sandbox ready. Starting agent...' })}\n\n`);

    // Create getter functions that tools will use
    const sandboxGetter = () => Promise.resolve(sandbox);
    const browserSessionGetter = () => browserSessionManager.getOrCreate(task.id);

    const registry = createToolRegistry(sandboxGetter, browserSessionGetter);
    const orchestrator = new AgentOrchestrator(registry, taskStore);

    await orchestrator.run(task.id, message, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message, recoverable: false })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ type: 'stream_end' })}\n\n`);
  res.end();
});

// GET /api/agent/tasks — list all tasks
agentRoutes.get('/tasks', (req, res) => {
  res.json(taskStore.list());
});

// GET /api/agent/task/:id — get task details
agentRoutes.get('/task/:id', (req, res) => {
  try {
    const task = taskStore.get(req.params.id);
    res.json({
      id: task.id,
      status: task.status,
      currentStep: task.currentStep,
      result: task.result,
      error: task.error,
      messageCount: task.messages.length,
      hasSandbox: !!sandboxManager.get(task.id),
    });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// DELETE /api/agent/task/:id — kill sandbox and clean up task
agentRoutes.delete('/task/:id', async (req, res) => {
  try {
    await sandboxManager.kill(req.params.id);
    await browserSessionManager.kill(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});
