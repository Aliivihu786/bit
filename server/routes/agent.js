import { Router } from 'express';
import { AgentOrchestrator } from '../agent/orchestrator.js';
import { createToolRegistry } from '../agent/toolRegistry.js';
import { taskStore } from '../agent/taskStore.js';
import { sandboxManager } from '../agent/sandboxManager.js';
import { devServerManager } from '../agent/devServerManager.js';
import { agentManager } from '../agent/agentManager.js';
import { getSystemPrompt } from '../agent/prompts.js';

export const agentRoutes = Router();

// Helper: create a safe SSE write function that silently ignores closed connections
function createSafeSSE(res) {
  let closed = false;
  res.on('close', () => { closed = true; });
  return {
    get closed() { return closed; },
    write(event) {
      if (closed) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        closed = true;
      }
    },
    end() {
      if (closed) return;
      try {
        res.write(`data: ${JSON.stringify({ type: 'stream_end' })}\n\n`);
        res.end();
      } catch {
        closed = true;
      }
    },
  };
}

// POST /api/agent/run — start a new agent task (returns SSE stream)
agentRoutes.post('/run', async (req, res) => {
  const { message, taskId: existingTaskId, agentName } = req.body;
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
    // Store selected agent on task for reference
    task.agentName = agentName || 'default';
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sse = createSafeSSE(res);
  sse.write({ type: 'task_created', taskId: task.id });
  sse.write({ type: 'status', message: 'Creating sandbox environment...' });

  try {
    // Create or reuse E2B sandbox for this task
    const sandbox = await sandboxManager.getOrCreate(task.id);

    // Get selected agent profile
    const selectedAgentName = task.agentName || agentName || 'default';
    const selectedAgent = agentManager.get(selectedAgentName);

    sse.write({
      type: 'agent_selected',
      agent: {
        name: selectedAgent.name,
        displayName: selectedAgent.displayName,
        description: selectedAgent.description,
        color: selectedAgent.color,
      }
    });

    sse.write({ type: 'status', message: `Sandbox ready. Starting ${selectedAgent.displayName}...` });

    // Create getter function that tools will use
    const sandboxGetter = () => Promise.resolve(sandbox);

    // Build system prompt with selected agent profile
    const systemPrompt = await getSystemPrompt({ agentName: selectedAgentName });

    // Filter tools based on agent profile
    const registry = createToolRegistry(sandboxGetter);
    const orchestrator = new AgentOrchestrator(registry, taskStore);

    await orchestrator.run(task.id, message, (event) => {
      sse.write(event);
    }, {
      systemPromptOverride: systemPrompt,
      allowedTools: selectedAgent.tools.length > 0 ? selectedAgent.tools : undefined,
      excludedTools: selectedAgent.excludeTools.length > 0 ? selectedAgent.excludeTools : undefined,
    });
  } catch (err) {
    sse.write({ type: 'error', message: err.message, recoverable: false });
  }

  sse.end();
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

// GET /api/agent/agents — list available agent profiles
agentRoutes.get('/agents', (req, res) => {
  const agents = agentManager.list().map(agent => ({
    name: agent.name,
    displayName: agent.displayName,
    description: agent.description,
    color: agent.color,
    tools: agent.tools,
    excludeTools: agent.excludeTools,
  }));
  res.json({ agents });
});

// GET /api/agent/tools — list available tool names
agentRoutes.get('/tools', (req, res) => {
  try {
    const registry = createToolRegistry(() => Promise.resolve(null));
    const tools = registry.getToolDefinitions().map(t => t.function.name);
    const recommended = new Set([
      'file_manager',
      'code_executor',
      'canvas',
      'web_search',
      'web_browser',
      'think',
    ]);
    const filtered = tools.filter(name => recommended.has(name));
    res.json({ tools: filtered, allTools: tools });
  } catch (err) {
    console.error('[GET /tools] Error:', err.message);
    res.json({ tools: [], allTools: [] });
  }
});

// DELETE /api/agent/task/:id — kill sandbox and clean up task
agentRoutes.delete('/task/:id', async (req, res) => {
  try {
    const sandbox = sandboxManager.get(req.params.id);
    if (sandbox) {
      await devServerManager.killAllForTask(req.params.id, sandbox);
    }
    await sandboxManager.kill(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});
