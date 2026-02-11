import { Router } from 'express';
import { AgentOrchestrator } from '../agent/orchestrator.js';
import { createToolRegistry } from '../agent/toolRegistry.js';
import { taskStore } from '../agent/taskStore.js';
import { sandboxManager } from '../agent/sandboxManager.js';
import { devServerManager } from '../agent/devServerManager.js';
import { subagentManager } from '../agent/subagentManager.js';
import { chatCompletion } from '../agent/llm.js';
import { config } from '../config.js';

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

  const sse = createSafeSSE(res);
  sse.write({ type: 'task_created', taskId: task.id });
  sse.write({ type: 'status', message: 'Creating sandbox environment...' });

  try {
    // Create or reuse E2B sandbox for this task
    const sandbox = await sandboxManager.getOrCreate(task.id);

    sse.write({ type: 'status', message: 'Sandbox ready. Starting agent...' });

    // Create getter function that tools will use
    const sandboxGetter = () => Promise.resolve(sandbox);

    const registry = createToolRegistry(sandboxGetter);
    const orchestrator = new AgentOrchestrator(registry, taskStore);

    await orchestrator.run(task.id, message, (event) => {
      sse.write(event);
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

// GET /api/agent/subagents — list subagents (fixed + dynamic)
agentRoutes.get('/subagents', (req, res) => {
  const subagents = subagentManager.list().map(spec => ({
    name: spec.name,
    description: spec.description,
    tools: spec.tools,
    excludeTools: spec.excludeTools,
    kind: spec.kind,
  }));
  res.json({ subagents });
});

// GET /api/agent/tools — list available tool names
agentRoutes.get('/tools', (req, res) => {
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
});

function extractJsonBlock(text) {
  if (!text) return null;
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const candidate = text.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// POST /api/agent/subagents/generate — generate description/system prompt from idea
agentRoutes.post('/subagents/generate', async (req, res) => {
  const { idea, name } = req.body || {};
  const seed = (idea || name || '').trim();
  if (!seed) {
    return res.status(400).json({ error: 'idea or name required' });
  }

  const messages = [
    {
      role: 'system',
      content: [
        'You generate subagent configuration text.',
        'Return ONLY valid JSON with keys: "description" and "system_prompt".',
        'The description must start with: "Use this agent when..." and clearly explain when to invoke it.',
        'Make the description 2-5 sentences. It should read like user-facing guidance.',
        'The system_prompt must start with: "You are..." and sound like a role definition.',
        'Make the system_prompt 4-8 sentences with concrete responsibilities and expected output.',
        'Do not use markdown headings or bullet points; use plain sentences.',
        'The system_prompt should mention correctness, minimal changes, and concise summaries.',
        'The system_prompt should include the expected output format (short summary + actionable next steps).',
        'Ensure wording is specific to the given idea.',
        'Tone: professional and concise.',
        'Do not include the literal strings "Description" or "System prompt" in the content.',
        'Do not include markdown or extra keys.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Subagent idea: ${seed}\nName (if provided): ${name || ''}`,
    },
  ];

  try {
    const completion = await chatCompletion({
      messages,
      modelOverride: config.mainModel,
    });
    const content = completion?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonBlock(content);
    if (!parsed || !parsed.description || !parsed.system_prompt) {
      return res.status(500).json({ error: 'Failed to generate subagent spec.' });
    }
    res.json({
      description: String(parsed.description).trim(),
      system_prompt: String(parsed.system_prompt).trim(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agent/subagents — create dynamic subagent
agentRoutes.post('/subagents', (req, res) => {
  const { name, description, system_prompt, tools, exclude_tools } = req.body || {};
  try {
    const created = subagentManager.addDynamic({
      name,
      description,
      systemPrompt: system_prompt,
      tools,
      excludeTools: exclude_tools,
    });
    res.json({
      created: true,
      subagent: {
        name: created.name,
        description: created.description,
        tools: created.tools,
        excludeTools: created.excludeTools,
        kind: created.kind,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/agent/subagents/run — dispatch a subagent task (SSE)
agentRoutes.post('/subagents/run', async (req, res) => {
  const { taskId, subagent_name, prompt } = req.body || {};

  if (!taskId) {
    return res.status(400).json({ error: 'taskId required' });
  }
  if (!subagent_name || !prompt) {
    return res.status(400).json({ error: 'subagent_name and prompt required' });
  }

  const subagent = subagentManager.get(subagent_name);
  if (!subagent) {
    return res.status(404).json({ error: `Subagent not found: ${subagent_name}` });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sse = createSafeSSE(res);

  try {
    const sandbox = await sandboxManager.getOrCreate(taskId);
    const sandboxGetter = () => Promise.resolve(sandbox);
    const registry = createToolRegistry(sandboxGetter);
    const orchestrator = new AgentOrchestrator(registry, taskStore);

    const output = await orchestrator.runSubagent({
      subagent,
      prompt,
      parentTaskId: taskId,
      onEvent: (event) => {
        sse.write(event);
      },
    });

    sse.write({ type: 'subagent_complete', subagent: subagent_name, output });
  } catch (err) {
    sse.write({ type: 'subagent_error', subagent: subagent_name, message: err.message });
  }

  sse.end();
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
