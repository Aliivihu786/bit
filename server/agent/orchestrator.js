import { chatCompletion } from './llm.js';
import { getSystemPrompt, SYSTEM_PROMPT } from './prompts.js';
import { config } from '../config.js';
import {
  ContextWindowGuard,
  createForceCompletionPrompt,
  createCompactionNotice,
} from './contextWindowGuard.js';

// Rough token estimate: ~4 chars per token
const MAX_CONTEXT_CHARS = 100000 * 4; // ~100k tokens worth of chars, leaves room for system prompt + completion

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

export class AgentOrchestrator {
  constructor(toolRegistry, taskStore) {
    this.toolRegistry = toolRegistry;
    this.taskStore = taskStore;
  }

  async run(taskId, userMessage, onEvent) {
    const task = this.taskStore.get(taskId);
    task.status = 'running';
    task.messages.push({ role: 'user', content: userMessage });

    const tools = this.toolRegistry.getToolDefinitions();
    let iterations = 0;

    // Load system prompt with skills (async)
    const systemPrompt = await getSystemPrompt();

    // Initialize context window guard for this task
    const contextGuard = new ContextWindowGuard({ model: 'deepseek-chat' });
    task.contextGuard = contextGuard;

    while (iterations < config.maxIterations) {
      iterations++;
      task.currentStep = iterations;
      onEvent({ type: 'thinking', iteration: iterations });

      try {
        // Check context window status before making API call
        let workingMessages = task.messages;
        const contextStatus = contextGuard.check(workingMessages, onEvent);

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
          });
          const forceMessage = forceResponse.choices[0].message;
          task.messages.push(forceMessage);
          task.status = 'completed';
          task.result = forceMessage.content;
          onEvent({ type: 'complete', content: forceMessage.content });
          return task;
        }

        // Compact messages if approaching limit
        if (contextStatus.shouldCompact) {
          workingMessages = contextGuard.compactMessages(workingMessages);
          // Add notice about compaction
          workingMessages.push({
            role: 'user',
            content: createCompactionNotice(),
          });
          onEvent({
            type: 'status',
            message: 'Compacted conversation to preserve context space',
          });
        }

        // Trim messages to stay within context window
        const contextMessages = trimMessages(workingMessages);

        const response = await chatCompletion({
          messages: [
            { role: 'system', content: systemPrompt },
            ...contextMessages,
          ],
          tools,
        });

        // Update context guard with actual token usage from response
        contextGuard.updateFromResponse(response);

        // Emit context usage info periodically
        if (iterations % 3 === 0) {
          const status = contextGuard.getStatus();
          onEvent({
            type: 'context_status',
            usagePercent: status.usagePercent,
            remainingTokens: status.remainingTokens,
          });
        }

        const choice = response.choices[0];
        const message = choice.message;

        task.messages.push(message);

        // Model wants to call tools
        if (message.tool_calls && message.tool_calls.length > 0) {
          // Send agent's reasoning text if present
          if (message.content) {
            onEvent({ type: 'reasoning', content: message.content, iteration: iterations });
          }

          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs;
            try {
              toolArgs = JSON.parse(toolCall.function.arguments);
            } catch {
              toolArgs = {};
            }

            onEvent({
              type: 'tool_call',
              tool: toolName,
              args: toolArgs,
              iteration: iterations,
            });

            let result;
            let llmResult; // stripped version for LLM (no bulky HTML)
            try {
              result = await this.toolRegistry.executeTool(toolName, toolArgs, { taskId });

              // For web tools: emit browser event for real-time preview
              if (toolName === 'web_browser' || toolName === 'web_search' || toolName === 'browser_automation') {
                try {
                  const parsed = JSON.parse(result);

                  if (toolName === 'browser_automation') {
                    // Strip screenshot base64 from LLM context (too large)
                    const screenshotBase64 = parsed._screenshotBase64;
                    delete parsed._screenshotBase64;
                    llmResult = JSON.stringify(parsed);

                    onEvent({
                      type: 'browser_event',
                      tool: 'browser_automation',
                      action: parsed.action || toolArgs.action,
                      url: parsed.url || '',
                      title: parsed.title || '',
                      screenshot: screenshotBase64 || null,
                      message: parsed.message || '',
                    });
                  } else {
                    llmResult = result;

                    onEvent({
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
                  }
                } catch {
                  llmResult = result;
                }
              } else {
                llmResult = result;
              }

              onEvent({ type: 'tool_result', tool: toolName, result: llmResult, success: true });
            } catch (err) {
              llmResult = JSON.stringify({ error: err.message });
              onEvent({ type: 'tool_result', tool: toolName, result: llmResult, success: false });
            }

            task.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: llmResult,
            });
          }
          // Small delay between iterations to avoid rate limits
          await sleep(1000);
          continue;
        }

        // Model returns final text — task complete
        if (choice.finish_reason === 'stop') {
          task.status = 'completed';
          task.result = message.content;
          onEvent({ type: 'complete', content: message.content });
          return task;
        }
      } catch (err) {
        if (iterations < config.maxIterations && isTransientError(err)) {
          onEvent({ type: 'error', message: `Retrying: ${err.message}`, recoverable: true });
          await sleep(2000);
          continue;
        }
        task.status = 'failed';
        task.error = err.message;
        onEvent({ type: 'error', message: err.message, recoverable: false });
        return task;
      }
    }

    // Force the LLM to give a final answer instead of stopping abruptly
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
      });

      const finalMessage = finalResponse.choices[0].message;
      task.messages.push(finalMessage);
      task.status = 'completed';
      task.result = finalMessage.content;
      onEvent({ type: 'complete', content: finalMessage.content });
    } catch {
      task.status = 'completed';
      onEvent({ type: 'complete', content: 'Task completed. The agent used all available steps to work on your request.' });
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
