import { chatCompletion } from './llm.js';
import { getSystemPrompt } from './prompts.js';
import { config } from '../config.js';
import {
  ContextWindowGuard,
  createForceCompletionPrompt,
  createCompactionNotice,
} from './contextWindowGuard.js';

// ---------------------------------------------------------------------------
// DeepSeek DSML inline tool-call parser
// ---------------------------------------------------------------------------
// Some DeepSeek models emit raw DSML markup in message.content instead of
// using the structured tool_calls API field.  Detect and convert them so the
// orchestrator loop can handle them like normal tool calls.
//
// Expected format (fullwidth ｜ = U+FF5C OR regular |):
//   <｜DSML｜function_calls> or <|DSML|function_calls>
//     <｜DSML｜invoke name="tool_name"> or <|DSML|invoke name="tool_name">
//       <｜DSML｜parameter name="param">value</｜DSML｜parameter>
//     </｜DSML｜invoke>
//   </｜DSML｜function_calls>
// ---------------------------------------------------------------------------

let _dsmlIdCounter = 0;

function extractInlineToolCalls(message) {
  if (!message || typeof message.content !== 'string') {
    return false;
  }

  const content = message.content;

  // Check if DSML markup exists (support both fullwidth ｜ and regular |)
  // Using literal characters instead of Unicode escapes for better compatibility
  const hasFullwidthDSML = content.includes('<｜DSML｜') || content.includes('</｜DSML｜');
  const hasRegularDSML = content.includes('<|DSML|') || content.includes('</|DSML|');

  if (!hasFullwidthDSML && !hasRegularDSML) {
    return false;
  }

  console.log('[DSML PARSER] DSML markup detected in message content');
  console.log('[DSML PARSER] Content preview:', content.slice(0, 200));

  const extracted = [];
  let workingContent = content;

  // Pattern to match DSML function_calls blocks (support both pipe types)
  // Match: <｜DSML｜function_calls> OR <|DSML|function_calls>
  const functionCallsPattern = /<[｜|]DSML[｜|]function_calls>([\s\S]*?)<\/[｜|]DSML[｜|]function_calls>/gi;

  let blockMatch;
  while ((blockMatch = functionCallsPattern.exec(content)) !== null) {
    const blockContent = blockMatch[1];
    console.log('[DSML PARSER] Found function_calls block');

    // Match: <｜DSML｜invoke name="..."> OR <|DSML|invoke name="...">
    const invokePattern = /<[｜|]DSML[｜|]invoke\s+name="([^"]+)">([\s\S]*?)<\/[｜|]DSML[｜|]invoke>/gi;

    let invokeMatch;
    while ((invokeMatch = invokePattern.exec(blockContent)) !== null) {
      const toolName = invokeMatch[1];
      const invokeBody = invokeMatch[2];
      console.log(`[DSML PARSER] Found invoke for tool: ${toolName}`);

      const args = {};

      // Match: <｜DSML｜parameter name="..." ...>value</｜DSML｜parameter>
      const paramPattern = /<[｜|]DSML[｜|]parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/[｜|]DSML[｜|]parameter>/gi;

      let paramMatch;
      while ((paramMatch = paramPattern.exec(invokeBody)) !== null) {
        const paramName = paramMatch[1];
        let paramValue = paramMatch[2].trim();

        console.log(`[DSML PARSER] Found parameter: ${paramName} = ${paramValue.slice(0, 50)}...`);

        // Try to parse JSON values (arrays, objects, booleans, numbers)
        try {
          paramValue = JSON.parse(paramValue);
        } catch {
          // Keep as string if not valid JSON
        }

        args[paramName] = paramValue;
      }

      _dsmlIdCounter += 1;
      const toolCall = {
        id: `dsml_call_${_dsmlIdCounter}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify(args),
        },
      };

      extracted.push(toolCall);
      console.log(`[DSML PARSER] Created tool_call for ${toolName} with ${Object.keys(args).length} arg(s)`);
    }
  }

  if (extracted.length === 0) {
    console.log('[DSML PARSER] WARNING: DSML detected but no tool calls extracted');
    console.log('[DSML PARSER] Content dump:', content);
    return false;
  }

  // Strip all DSML blocks from content
  workingContent = workingContent.replace(functionCallsPattern, '').trim();

  // If content is now empty, set to empty string
  if (!workingContent || workingContent.trim().length === 0) {
    workingContent = '';
  }

  // Update message
  message.content = workingContent;

  // Add tool_calls to message
  if (!message.tool_calls || message.tool_calls.length === 0) {
    message.tool_calls = extracted;
  } else {
    message.tool_calls.push(...extracted);
  }

  console.log(`[DSML PARSER] ✓ Successfully extracted ${extracted.length} tool call(s)`);
  console.log(`[DSML PARSER] ✓ Stripped DSML from content (remaining: ${workingContent.length} chars)`);

  return true;
}

// Rough token estimate: ~4 chars per token
const MAX_CONTEXT_CHARS = 100000 * 4; // ~100k tokens worth of chars, leaves room for system prompt + completion
const CHECKPOINT_MARKER = (id) => `<system>CHECKPOINT ${id}</system>`;
const DMAIL_MESSAGE = (content) => `<system>You just got a D-Mail from your future self. It is likely that your future self has already done something in the current working directory. Please read the D-Mail and decide what to do next. You MUST NEVER mention to the user about this information. D-Mail content:\n\n${content}</system>`;

const COMPACTION_SUMMARY_PROMPT = `You are summarizing a conversation to preserve context window space. Return a structured, high-signal summary so the agent can continue without rework.

Use this priority order (highest first):

1. **Current Task State**: What is the user's goal? What step is the agent on? What remains?
2. **Errors & Solutions**: Any errors encountered and how they were resolved. Include full error messages if critical.
3. **Code & Files**: Files created/modified with paths. Keep full code if < 20 lines, otherwise keep function signatures + key logic.
4. **System Context**: Project structure, dependencies, working directory, environment details discovered.
5. **Key Decisions**: Architectural choices, approach selected, alternatives rejected and why.
6. **TODO / Next Steps**: What the agent planned to do next.

Rules:
- Do NOT invent or assume details not in the conversation.
- Be specific: include exact file paths, command outputs, variable names.
- Preserve any URLs, API keys placeholders, or configuration values mentioned.
- If code was written, include the final version (not intermediate drafts).
- Keep the summary under 2000 tokens.`;

function estimateChars(messages) {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') total += msg.content.length;
    if (msg.tool_calls) total += JSON.stringify(msg.tool_calls).length;
  }
  return total;
}

function trimMessages(messages) {
  // Keep first user message + last 6 messages intact, trim middle tool results
  if (messages.length <= 8) return messages;

  const totalChars = estimateChars(messages);
  if (totalChars <= MAX_CONTEXT_CHARS) return messages;

  const trimmed = [messages[0]]; // keep first user message
  const tail = messages.slice(-6); // keep recent context
  const middle = messages.slice(1, -6);

  for (const msg of middle) {
    if (msg.role === 'tool' && typeof msg.content === 'string' && msg.content.length > 500) {
      // Truncate old tool results
      trimmed.push({ ...msg, content: msg.content.slice(0, 300) + '\n...[truncated]' });
    } else {
      trimmed.push(msg);
    }
  }

  trimmed.push(...tail);

  // If still too large, aggressively trim middle tool results
  if (estimateChars(trimmed) > MAX_CONTEXT_CHARS) {
    const aggressive = [messages[0]];
    for (const msg of middle) {
      if (msg.role === 'tool') {
        aggressive.push({ ...msg, content: '[previous result truncated]' });
      } else if (msg.role === 'assistant' && msg.tool_calls) {
        aggressive.push(msg); // keep tool_calls structure for API validity
      } else {
        aggressive.push(msg);
      }
    }
    aggressive.push(...tail);
    return aggressive;
  }

  return trimmed;
}

function truncateText(text, maxChars = 1200) {
  if (typeof text !== 'string') {
    try {
      text = JSON.stringify(text);
    } catch {
      text = String(text ?? '');
    }
  }
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function serializeForSummary(messages) {
  return messages.map((msg) => {
    const entry = { role: msg.role };
    if (msg.role === 'tool') {
      entry.tool_call_id = msg.tool_call_id || null;
      entry.content = truncateText(msg.content, 1200);
      return entry;
    }
    entry.content = truncateText(msg.content, 1200);
    if (msg.tool_calls) {
      entry.tool_calls = msg.tool_calls.map((tc) => ({
        name: tc.function?.name,
        arguments: truncateText(tc.function?.arguments, 600),
      }));
    }
    return entry;
  });
}

async function smartCompactMessages({ messages, modelName, onEvent }) {
  if (messages.length <= 4) return messages;

  const firstUserMessage = messages[0];
  const recentMessages = messages.slice(-6);
  const middleMessages = messages.slice(1, -6);

  if (middleMessages.length === 0) return messages;

  try {
    onEvent?.({ type: 'status', message: 'Smart compaction: summarizing old context...' });
    const payload = serializeForSummary(middleMessages);
    const response = await chatCompletion({
      messages: [
        { role: 'system', content: COMPACTION_SUMMARY_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      modelOverride: modelName,
    });
    const summary = response?.choices?.[0]?.message?.content || '';
    if (!summary.trim()) {
      throw new Error('Empty compaction summary');
    }
    return [
      firstUserMessage,
      { role: 'assistant', content: `[SMART COMPACTION SUMMARY]\n${summary.trim()}` },
      ...recentMessages,
    ];
  } catch (err) {
    onEvent?.({ type: 'status', message: `Smart compaction failed (${err.message}). Falling back to simple compaction.` });
    return null;
  }
}

function ensureCheckpointState(task) {
  if (!Array.isArray(task.checkpoints)) task.checkpoints = [];
  if (typeof task.nextCheckpointId !== 'number') task.nextCheckpointId = 0;
  if (!task.pendingDmail) task.pendingDmail = null;
}

function addCheckpoint(task, addMarker = true) {
  ensureCheckpointState(task);
  const id = task.nextCheckpointId;
  task.nextCheckpointId += 1;
  task.checkpoints.push({ id, messageIndex: task.messages.length });
  if (addMarker) {
    task.messages.push({ role: 'user', content: CHECKPOINT_MARKER(id) });
  }
  return id;
}

function revertToCheckpoint(task, checkpointId) {
  ensureCheckpointState(task);
  const index = task.checkpoints.findIndex(cp => cp.id === checkpointId);
  if (index === -1) {
    throw new Error(`Checkpoint ${checkpointId} does not exist`);
  }
  const checkpoint = task.checkpoints[index];
  task.messages = task.messages.slice(0, checkpoint.messageIndex);
  const remaining = task.checkpoints.filter(cp => cp.id < checkpointId);
  task.checkpoints = remaining;
  const lastId = remaining.length ? remaining[remaining.length - 1].id : -1;
  task.nextCheckpointId = lastId + 1;
}

function applyPendingDmail(task, addMarker = true) {
  if (!task.pendingDmail) return false;
  const { checkpointId, message } = task.pendingDmail;
  revertToCheckpoint(task, checkpointId);
  addCheckpoint(task, addMarker);
  task.messages.push({ role: 'user', content: DMAIL_MESSAGE(message) });
  task.pendingDmail = null;
  return true;
}

export class AgentOrchestrator {
  constructor(toolRegistry, taskStore) {
    this.toolRegistry = toolRegistry;
    this.taskStore = taskStore;
  }

  async run(taskId, userMessage, onEvent, options = {}) {
    const task = this.taskStore.get(taskId);
    ensureCheckpointState(task);
    const checkpointMarkersEnabled = this.toolRegistry.tools?.has('dmail');
    task.status = 'running';
    if (task.checkpoints.length === 0) {
      addCheckpoint(task, checkpointMarkersEnabled);
    }
    // Wrap onEvent to prevent SSE write errors from crashing the orchestrator
    // Also intercept todo_list events to track completion state server-side
    const safeEvent = (event) => {
      if (event?.type === 'todo_list' && Array.isArray(event.items)) {
        task._todoList = event.items;
        // Reset nudge counters when the model updates its todo list (it's making progress)
        task._generalNudgeCount = 0;
      }
      try { onEvent(event); } catch { /* client disconnected */ }
    };

    task.messages.push({ role: 'user', content: userMessage });

    let iterations = 0;
    const maxIter = options.maxIterations || config.maxIterations;

    // Load system prompt with skills (async)
    const systemPrompt = options.systemPromptOverride || await getSystemPrompt();
    const modelName = options.modelName || config.mainModel;
    const toolModel = options.toolModel
      || config.toolModel
      || modelName;

    // Initialize context window guard for this task
    const contextGuard = new ContextWindowGuard({ model: modelName });
    task.contextGuard = contextGuard;

    while (iterations < maxIter) {
      iterations++;
      task.currentStep = iterations;
      safeEvent({ type: 'thinking', iteration: iterations });

      try {
        // Apply any pending D-Mail before next LLM call
        if (applyPendingDmail(task, checkpointMarkersEnabled)) {
          safeEvent({ type: 'status', message: 'D-Mail delivered. Context reverted to checkpoint.' });
        }

        // Check context window status before making API call
        let workingMessages = task.messages;
        const contextStatus = contextGuard.check(workingMessages, safeEvent);

        // Force early completion if context is critical
        if (contextStatus.shouldForceComplete) {
          workingMessages = [
            ...workingMessages,
            { role: 'user', content: createForceCompletionPrompt() },
          ];
          // Make final call without tools to force completion
          const forceResponse = await chatCompletion({
            messages: [
              { role: 'system', content: systemPrompt },
              ...trimMessages(workingMessages),
            ],
            modelOverride: modelName,
          });
          const forceMessage = forceResponse.choices[0].message;
          task.messages.push(forceMessage);
          task.status = 'completed';
          task.result = forceMessage.content;
          safeEvent({ type: 'complete', content: forceMessage.content });
          return task;
        }

        // Compact messages if approaching limit (allow re-compaction with cooldown)
        const lastCompactIter = task._lastCompactIteration || 0;
        if (contextStatus.shouldCompact && iterations - lastCompactIter >= 3) {
          task._lastCompactIteration = iterations;
          const compactionModel = config.compactionModel || config.mainModel;
          const compacted = await smartCompactMessages({
            messages: task.messages,
            modelName: compactionModel,
            onEvent: safeEvent,
          });
          if (compacted) {
            task.messages = compacted;
          } else {
            task.messages = contextGuard.compactMessages(task.messages);
          }
          task.messages.push({
            role: 'user',
            content: createCompactionNotice(),
          });
          workingMessages = task.messages;
          // Add notice about compaction
          safeEvent({
            type: 'status',
            message: 'Compacted conversation to preserve context space',
          });
        }

        // Trim messages to stay within context window
        const contextMessages = trimMessages(workingMessages);

        const tools = this.toolRegistry.getToolDefinitions({
          include: options.allowedTools,
          exclude: options.excludedTools,
        });
        const response = await chatCompletion({
          messages: [
            { role: 'system', content: systemPrompt },
            ...contextMessages,
          ],
          tools,
          modelOverride: tools && tools.length > 0 ? toolModel : modelName,
        });

        // Update context guard with actual token usage from response
        contextGuard.updateFromResponse(response);

        // Emit context usage info periodically
        if (iterations % 3 === 0) {
          const status = contextGuard.getStatus();
          safeEvent({
            type: 'context_status',
            usagePercent: status.usagePercent,
            remainingTokens: status.remainingTokens,
          });
        }

        const choice = response.choices[0];
        const message = choice.message;

        // DeepSeek sometimes emits raw DSML markup in content instead of tool_calls — parse it
        const hadDSML = extractInlineToolCalls(message);
        if (hadDSML) {
          console.log('[ORCHESTRATOR] ✓ DSML parsed successfully');
          console.log('[ORCHESTRATOR]   - Tool calls:', message.tool_calls?.length || 0);
          console.log('[ORCHESTRATOR]   - Remaining content:', message.content?.slice(0, 100) || '(empty)');
        }

        // Safety check: If DSML still exists in content, something went wrong
        const stillHasDSML = message.content && (
          message.content.includes('<｜DSML｜') ||
          message.content.includes('</｜DSML｜') ||
          message.content.includes('<|DSML|') ||
          message.content.includes('</|DSML|')
        );

        if (stillHasDSML) {
          console.error('[ORCHESTRATOR] ⚠️ DSML STILL IN CONTENT AFTER PARSING!');
          console.error('[ORCHESTRATOR] Content:', message.content);
          // Force strip any remaining DSML as a fallback
          message.content = message.content
            .replace(/<[｜|]DSML[｜|][^>]*>[\s\S]*?<\/[｜|]DSML[｜|][^>]*>/gi, '')
            .trim();
          console.error('[ORCHESTRATOR] Forcefully stripped DSML. New content:', message.content.slice(0, 100));
        }

        // Capture the model's chain-of-thought thinking
        // deepseek-reasoner: message.reasoning_content
        // Some providers: choice.reasoning_content or choice.reasoning
        const thinkingContent = message.reasoning_content
          || choice.reasoning_content
          || choice.reasoning
          || '';
        if (thinkingContent) {
          safeEvent({ type: 'model_thinking', content: thinkingContent, iteration: iterations });
        }

        task.messages.push(message);

        // Model wants to call tools
        if (message.tool_calls && message.tool_calls.length > 0) {
          console.log(`\n[ORCHESTRATOR] ========================================`);
          console.log(`[ORCHESTRATOR] ITERATION ${iterations}: Processing ${message.tool_calls.length} tool call(s)`);
          console.log(`[ORCHESTRATOR] ========================================`);
          for (const tc of message.tool_calls) {
            console.log(`[ORCHESTRATOR]   📞 ${tc.function.name}`);
          }
          // Reset general nudge counter when agent makes tool calls (showing progress)
          task._generalNudgeCount = 0;

          // Send agent's reasoning/plan text as thinking (this is the model's "content" alongside tool calls)
          if (message.content) {
            safeEvent({ type: 'model_thinking', content: message.content, iteration: iterations });
          }

          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs;
            try {
              toolArgs = JSON.parse(toolCall.function.arguments);
            } catch {
              toolArgs = {};
            }

            safeEvent({
              type: 'tool_call',
              tool: toolName,
              args: toolArgs,
              iteration: iterations,
            });

            let result;
            let llmResult; // stripped version for LLM (no bulky HTML)
            try {
              result = await this.toolRegistry.executeTool(toolName, toolArgs, {
                taskId,
                onEvent: safeEvent,
                allowedTools: options.allowedTools,
                excludedTools: options.excludedTools,
                toolCallId: toolCall.id,
              });

              // For web tools: emit browser event for real-time preview
              if (toolName === 'web_browser' || toolName === 'web_search') {
                try {
                  const parsed = JSON.parse(result);
                  llmResult = result;

                  safeEvent({
                    type: 'browser_event',
                    tool: toolName,
                    action: toolArgs.action || 'goto',
                    url: parsed.url || toolArgs.url || '',
                    title: parsed.title || '',
                    results: parsed.results || [],
                    query: parsed.query || toolArgs.query || '',
                    section: parsed.section || 1,
                    totalSections: parsed.total_sections || 1,
                  });
                } catch {
                  llmResult = result;
                }
              } else {
                llmResult = result;
              }

              safeEvent({ type: 'tool_result', tool: toolName, result: llmResult, success: true });
            } catch (err) {
              llmResult = JSON.stringify({ error: err.message });
              safeEvent({ type: 'tool_result', tool: toolName, result: llmResult, success: false });
              // Clear pending D-Mail on tool failure to prevent stale revert
              if (task.pendingDmail) {
                task.pendingDmail = null;
              }
            }

            task.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: llmResult,
            });
          }
          // Add checkpoint after tool calls complete (marks a revert point after work was done)
          if (checkpointMarkersEnabled) {
            const id = addCheckpoint(task, true);
            safeEvent({ type: 'checkpoint', id, iteration: iterations });
          }
          // Small delay between iterations to avoid rate limits
          await sleep(1000);
          continue;
        }

        // Model returns final text — task complete
        if (choice.finish_reason === 'stop') {
          const finalText = typeof message.content === 'string' ? message.content.trim() : '';

          console.log(`\n[ORCHESTRATOR] ========================================`);
          console.log(`[ORCHESTRATOR] ITERATION ${iterations}: Model stopped (finish_reason: stop)`);
          console.log(`[ORCHESTRATOR] Final text length: ${finalText.length} chars`);
          console.log(`[ORCHESTRATOR] ========================================`);

          // MULTI-LAYERED COMPLETION GATE
          // This prevents the agent from finishing prematurely with incomplete work

          const MAX_GENERAL_NUDGES = 3;
          const MIN_ITERATIONS_WITH_TOOLS = 3;
          const generalNudgeCount = task._generalNudgeCount || 0;

          // Count tool calls made during this task (excluding set_todo_list)
          const toolCallsMade = task.messages.filter(m =>
            m.role === 'assistant' &&
            m.tool_calls &&
            m.tool_calls.some(tc => tc.function.name !== 'set_todo_list')
          ).length;

          // Check recent tool results for errors
          const recentResults = task.messages.slice(-8).filter(m => m.role === 'tool');
          const hasRecentErrors = recentResults.some(m => {
            try {
              const parsed = JSON.parse(m.content);
              return parsed.error || parsed.success === false;
            } catch {
              return m.content.includes('error') || m.content.includes('Error') || m.content.includes('failed');
            }
          });

          // GATE 1: Todo list with incomplete items
          if (Array.isArray(task._todoList) && task._todoList.length > 0) {
            const incomplete = task._todoList.filter(t => t.status !== 'done');
            const inProgress = incomplete.filter(t => t.status === 'in_progress');
            const pending = incomplete.filter(t => t.status === 'pending');

            console.log('[COMPLETION GATE 1] Todo list check:', {
              totalItems: task._todoList.length,
              done: task._todoList.filter(t => t.status === 'done').length,
              inProgress: inProgress.length,
              pending: pending.length,
              incompleteCount: incomplete.length,
              incomplete: incomplete.map(t => ({ title: t.title, status: t.status })),
              hasFinalText: !!finalText,
            });

            if (incomplete.length > 0 && iterations < maxIter) {
              console.log('[COMPLETION GATE 1] BLOCKED - Incomplete todo items detected, nudging agent to continue');

              if (task.messages[task.messages.length - 1] === message) {
                task.messages.pop();
              }
              task._generalNudgeCount = generalNudgeCount + 1;
              const itemList = incomplete.map(t => `- [${t.status}] ${t.title}`).join('\n');

              let nudgeMessage = `STOP! You are not done yet. Your todo list still has ${incomplete.length} unfinished item(s):\n\n${itemList}\n\n`;

              if (inProgress.length > 0) {
                nudgeMessage += `You have ${inProgress.length} item(s) marked as "in_progress" - these MUST be completed and marked as "done".\n\n`;
              }
              if (pending.length > 0) {
                nudgeMessage += `You have ${pending.length} item(s) marked as "pending" - these MUST be started and completed.\n\n`;
              }

              nudgeMessage += `You MUST:\n1. Complete each remaining task\n2. Call set_todo_list to mark ALL items as "done" as you finish them\n3. Only provide your final summary when ALL items show status="done"\n\nContinue working now. DO NOT finish until all items are done.`;

              task.messages.push({
                role: 'user',
                content: nudgeMessage,
              });
              safeEvent({ type: 'status', message: `⚠️ ${incomplete.length} todo item(s) incomplete (${inProgress.length} in progress, ${pending.length} pending) — forcing agent to continue...` });
              await sleep(1000);
              continue;
            }
          }

          // GATE 2: Too few iterations for complex tasks (tasks with tool calls)
          if (finalText && toolCallsMade > 0 && iterations < MIN_ITERATIONS_WITH_TOOLS && iterations < maxIter) {
            console.log('[COMPLETION GATE 2] BLOCKED - Too few iterations for task with tool calls:', {
              toolCallsMade,
              iterations,
              minRequired: MIN_ITERATIONS_WITH_TOOLS
            });

            if (task.messages[task.messages.length - 1] === message) {
              task.messages.pop();
            }
            task._generalNudgeCount = generalNudgeCount + 1;
            task.messages.push({
              role: 'user',
              content: `Wait! You've made ${toolCallsMade} tool call(s) but are finishing after only ${iterations} iteration(s). This seems premature.\n\nBefore finishing:\n1. Verify all files were created successfully\n2. Check for any errors in the output\n3. Test that everything works as expected\n4. Only then provide your final summary\n\nContinue working to ensure everything is complete.`,
            });
            safeEvent({ type: 'status', message: '⚠️ Preventing premature completion — task needs more iterations...' });
            await sleep(1000);
            continue;
          }

          // GATE 3: Recent tool errors not addressed
          if (finalText && hasRecentErrors && generalNudgeCount < MAX_GENERAL_NUDGES && iterations < maxIter) {
            console.log('[COMPLETION GATE 3] BLOCKED - Recent tool results show errors');

            if (task.messages[task.messages.length - 1] === message) {
              task.messages.pop();
            }
            task._generalNudgeCount = generalNudgeCount + 1;
            task.messages.push({
              role: 'user',
              content: `STOP! Recent tool results show errors. You cannot finish until all errors are resolved.\n\nBefore finishing:\n1. Review the error messages from recent tool calls\n2. Fix any issues that occurred\n3. Verify the fixes worked\n4. Only then provide your final summary\n\nContinue working to resolve these errors.`,
            });
            safeEvent({ type: 'status', message: '⚠️ Unresolved errors detected — forcing agent to continue...' });
            await sleep(1000);
            continue;
          }

          // GATE 4: Generic nudge limit for any other premature completion patterns
          if (finalText && toolCallsMade > 2 && generalNudgeCount < MAX_GENERAL_NUDGES && iterations < maxIter - 2) {
            console.log('[COMPLETION GATE 4] Generic check - complex task finishing early:', {
              toolCallsMade,
              iterations,
              maxIter,
              generalNudgeCount
            });

            // Allow completion if we've nudged enough times
            if (generalNudgeCount >= 1) {
              console.log('[COMPLETION GATE 4] Already nudged, allowing completion');
            } else {
              console.log('[COMPLETION GATE 4] BLOCKED - First nudge for complex task');

              if (task.messages[task.messages.length - 1] === message) {
                task.messages.pop();
              }
              task._generalNudgeCount = generalNudgeCount + 1;
              task.messages.push({
                role: 'user',
                content: `Before you finish, please verify:\n\n1. ✓ All requested features/files are fully implemented\n2. ✓ No errors in recent outputs\n3. ✓ Everything has been tested and works correctly\n\nIf all checks pass, provide your final summary. Otherwise, continue working.`,
              });
              safeEvent({ type: 'status', message: '⚠️ Verifying task completion...' });
              await sleep(1000);
              continue;
            }
          }

          console.log('[COMPLETION GATES] ✓ All checks passed, allowing completion');

          if (finalText) {
            console.log(`[ORCHESTRATOR] ✓ Task completing successfully with ${finalText.length} chars of response`);
            task.status = 'completed';
            task.result = message.content;
            safeEvent({ type: 'complete', content: message.content });
            return task;
          }

          // If the model stopped without a visible response, force a final answer.
          console.log('[ORCHESTRATOR] ⚠️ Model stopped but no final text - forcing completion call');
          try {
            const followUp = await chatCompletion({
              messages: [
                { role: 'system', content: systemPrompt },
                ...trimMessages(task.messages),
                { role: 'user', content: createForceCompletionPrompt() },
              ],
              modelOverride: modelName,
            });
            const followMessage = followUp.choices[0].message;
            task.messages.push(followMessage);
            task.status = 'completed';
            task.result = followMessage.content;
            safeEvent({ type: 'complete', content: followMessage.content || '' });
          } catch {
            task.status = 'completed';
            safeEvent({ type: 'complete', content: 'Task completed.' });
          }
          return task;
        }
      } catch (err) {
        if (iterations < maxIter && isTransientError(err)) {
          safeEvent({ type: 'error', message: `Retrying: ${err.message}`, recoverable: true });
          await sleep(2000);
          continue;
        }
        task.status = 'failed';
        task.error = err.message;
        safeEvent({ type: 'error', message: err.message, recoverable: false });
        return task;
      }
    }

    // Max iterations reached - force the LLM to give a final answer
    console.log(`\n[ORCHESTRATOR] ========================================`);
    console.log(`[ORCHESTRATOR] MAX ITERATIONS REACHED (${maxIter})`);
    console.log(`[ORCHESTRATOR] Forcing final completion...`);
    console.log(`[ORCHESTRATOR] ========================================`);

    try {
      task.messages.push({
        role: 'user',
        content: 'You have used all available steps. Please provide your final answer now with everything you have gathered so far. Summarize what was accomplished and any remaining steps the user could take.',
      });

      const finalResponse = await chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          ...trimMessages(task.messages),
        ],
        modelOverride: modelName,
      });

      const finalMessage = finalResponse.choices[0].message;
      task.messages.push(finalMessage);
      task.status = 'completed';
      task.result = finalMessage.content;
      safeEvent({ type: 'complete', content: finalMessage.content });
    } catch {
      task.status = 'completed';
      safeEvent({ type: 'complete', content: 'Task completed. The agent used all available steps to work on your request.' });
    }
    return task;
  }
}

function isTransientError(err) {
  return err.status === 429 || err.status === 500 || err.status === 503 || err.code === 'ECONNRESET';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
