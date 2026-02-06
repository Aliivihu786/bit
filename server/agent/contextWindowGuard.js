/**
 * Context Window Guard - Prevents agent from running out of context mid-execution
 *
 * Inspired by OpenClaw's context-window-guard.ts
 *
 * Features:
 * - Tracks token usage from API responses
 * - Warns when approaching context limit
 * - Forces early completion if context is critical
 * - Compacts conversation by summarizing old messages
 */

// DeepSeek models context limits (in tokens)
const MODEL_CONTEXT_LIMITS = {
  'deepseek-chat': 64000,
  'deepseek-coder': 64000,
  'deepseek-reasoner': 64000,
  default: 64000,
};

// Reserve tokens for system prompt + completion + safety buffer
const RESERVED_TOKENS = 8000;

// Thresholds for warnings and actions
const THRESHOLDS = {
  WARNING: 0.70,      // 70% - emit warning event
  COMPACT: 0.80,      // 80% - trigger conversation compaction
  CRITICAL: 0.90,     // 90% - force early completion
};

// Rough estimate: ~4 characters per token (for when we don't have actual counts)
const CHARS_PER_TOKEN = 4;

export class ContextWindowGuard {
  constructor(options = {}) {
    this.model = options.model || 'deepseek-chat';
    this.maxTokens = MODEL_CONTEXT_LIMITS[this.model] || MODEL_CONTEXT_LIMITS.default;
    this.effectiveLimit = this.maxTokens - RESERVED_TOKENS;

    // Track actual usage from API responses
    this.lastPromptTokens = 0;
    this.lastCompletionTokens = 0;
    this.lastTotalTokens = 0;

    // Running estimates when API doesn't provide counts
    this.estimatedTokens = 0;

    // State
    this.warningEmitted = false;
    this.compactionTriggered = false;
  }

  /**
   * Update token counts from API response
   */
  updateFromResponse(response) {
    if (response?.usage) {
      this.lastPromptTokens = response.usage.prompt_tokens || 0;
      this.lastCompletionTokens = response.usage.completion_tokens || 0;
      this.lastTotalTokens = response.usage.total_tokens || 0;
      this.estimatedTokens = this.lastPromptTokens; // Use actual for next estimate
    }
  }

  /**
   * Estimate tokens from message content
   */
  estimateTokensFromMessages(messages) {
    let chars = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        chars += msg.content.length;
      }
      if (msg.tool_calls) {
        chars += JSON.stringify(msg.tool_calls).length;
      }
    }
    return Math.ceil(chars / CHARS_PER_TOKEN);
  }

  /**
   * Get current usage percentage
   */
  getUsagePercentage() {
    const currentTokens = this.lastPromptTokens || this.estimatedTokens;
    return currentTokens / this.effectiveLimit;
  }

  /**
   * Check context status and return actions needed
   */
  check(messages, onEvent) {
    // Use actual tokens if available, otherwise estimate
    const currentTokens = this.lastPromptTokens || this.estimateTokensFromMessages(messages);
    const usagePercent = currentTokens / this.effectiveLimit;
    const remainingTokens = this.effectiveLimit - currentTokens;

    const status = {
      currentTokens,
      maxTokens: this.effectiveLimit,
      usagePercent: Math.round(usagePercent * 100),
      remainingTokens,
      action: 'continue',
      shouldCompact: false,
      shouldForceComplete: false,
    };

    // Critical - force immediate completion
    if (usagePercent >= THRESHOLDS.CRITICAL) {
      status.action = 'force_complete';
      status.shouldForceComplete = true;
      onEvent?.({
        type: 'context_warning',
        level: 'critical',
        message: `Context window critical (${status.usagePercent}% used). Forcing early completion.`,
        usagePercent: status.usagePercent,
        remainingTokens,
      });
      return status;
    }

    // Compact threshold - summarize old messages
    if (usagePercent >= THRESHOLDS.COMPACT && !this.compactionTriggered) {
      status.action = 'compact';
      status.shouldCompact = true;
      this.compactionTriggered = true;
      onEvent?.({
        type: 'context_warning',
        level: 'high',
        message: `Context window high (${status.usagePercent}% used). Compacting conversation.`,
        usagePercent: status.usagePercent,
        remainingTokens,
      });
      return status;
    }

    // Warning threshold - just notify
    if (usagePercent >= THRESHOLDS.WARNING && !this.warningEmitted) {
      this.warningEmitted = true;
      onEvent?.({
        type: 'context_warning',
        level: 'warning',
        message: `Context window at ${status.usagePercent}%. Consider wrapping up.`,
        usagePercent: status.usagePercent,
        remainingTokens,
      });
    }

    return status;
  }

  /**
   * Compact messages by summarizing old content
   */
  compactMessages(messages) {
    if (messages.length <= 4) return messages;

    const firstUserMessage = messages[0];
    const recentMessages = messages.slice(-6); // Keep last 6 messages
    const middleMessages = messages.slice(1, -6);

    if (middleMessages.length === 0) return messages;

    // Create a summary of what happened in the middle
    const toolCalls = [];
    const assistantSummaries = [];

    for (const msg of middleMessages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          toolCalls.push(tc.function.name);
        }
      }
      if (msg.role === 'assistant' && msg.content && !msg.tool_calls) {
        // Keep first 200 chars of assistant reasoning
        assistantSummaries.push(msg.content.slice(0, 200));
      }
    }

    const summaryContent = [
      '[CONVERSATION COMPACTED - Previous context summarized]',
      '',
      `Tools used: ${[...new Set(toolCalls)].join(', ') || 'none'}`,
      `Total tool calls: ${toolCalls.length}`,
    ];

    if (assistantSummaries.length > 0) {
      summaryContent.push('', 'Previous reasoning highlights:');
      for (const summary of assistantSummaries.slice(-3)) {
        summaryContent.push(`- ${summary}...`);
      }
    }

    const compactedMessages = [
      firstUserMessage,
      {
        role: 'assistant',
        content: summaryContent.join('\n'),
      },
      ...recentMessages,
    ];

    return compactedMessages;
  }

  /**
   * Get context status for display/logging
   */
  getStatus() {
    const currentTokens = this.lastPromptTokens || this.estimatedTokens;
    const usagePercent = Math.round((currentTokens / this.effectiveLimit) * 100);

    return {
      model: this.model,
      currentTokens,
      maxTokens: this.maxTokens,
      effectiveLimit: this.effectiveLimit,
      usagePercent,
      remainingTokens: this.effectiveLimit - currentTokens,
      warningEmitted: this.warningEmitted,
      compactionTriggered: this.compactionTriggered,
    };
  }

  /**
   * Reset state for new conversation
   */
  reset() {
    this.lastPromptTokens = 0;
    this.lastCompletionTokens = 0;
    this.lastTotalTokens = 0;
    this.estimatedTokens = 0;
    this.warningEmitted = false;
    this.compactionTriggered = false;
  }
}

/**
 * Create the force-completion prompt when context is critical
 */
export function createForceCompletionPrompt() {
  return `IMPORTANT: You are running low on context space. You MUST provide your final answer NOW.

Summarize what you have accomplished so far and provide any partial results. Do NOT call any more tools.

If you were in the middle of a task:
1. State what was completed
2. State what remains to be done
3. Provide any data/results gathered so far

Be concise but complete.`;
}

/**
 * Create the compaction notice for the model
 */
export function createCompactionNotice() {
  return `[System: Previous conversation context has been compacted to save space. Key information is preserved above. Continue with the task.]`;
}
