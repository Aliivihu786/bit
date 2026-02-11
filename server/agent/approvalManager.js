/**
 * Approval Manager - Controls user approval for dangerous operations
 *
 * Modes:
 * - ask: Request approval for each dangerous operation (default)
 * - auto: Auto-approve after first approval in session
 * - yolo: Skip all approvals (dangerous!)
 */

class ApprovalManager {
  constructor() {
    // Map of taskId -> approval state
    this.taskApprovals = new Map();
  }

  /**
   * Initialize approval state for a task
   */
  initTask(taskId, mode = 'ask') {
    this.taskApprovals.set(taskId, {
      mode, // 'ask', 'auto', 'yolo'
      hasApprovedOnce: false,
      pendingApprovals: new Map(), // callId -> { resolve, reject, timeout }
    });
  }

  /**
   * Get task approval state
   */
  getTaskState(taskId) {
    return this.taskApprovals.get(taskId);
  }

  /**
   * Set approval mode for a task
   */
  setMode(taskId, mode) {
    const state = this.taskApprovals.get(taskId);
    if (!state) {
      this.initTask(taskId, mode);
    } else {
      state.mode = mode;
    }
  }

  /**
   * Check if a tool call requires approval
   */
  requiresApproval(toolName, args) {
    // Dangerous operations that need approval
    const dangerousTools = {
      code_executor: (args) => {
        // Bash commands are dangerous
        const lang = args.language || 'bash';
        if (lang === 'bash' || lang === 'shell' || lang === 'sh') {
          const code = args.code || '';
          // Check for dangerous patterns
          const dangerous = [
            /rm\s+-rf/,
            /rm\s+--recursive\s+--force/,
            /dd\s+if=/,
            /mkfs\./,
            /:\(\)\s*\{/,  // fork bomb
            />\s*\/dev\/sd/,
            /chmod\s+777/,
            /curl.*\|\s*bash/,
            /wget.*\|\s*bash/,
          ];
          return dangerous.some(pattern => pattern.test(code));
        }
        return false;
      },
      file_manager: (args) => {
        // Write and delete operations need approval
        const action = args.action;
        return action === 'write' || action === 'delete';
      },
      project_scaffold: () => true, // Always requires approval (creates many files)
    };

    const checker = dangerousTools[toolName];
    return checker ? checker(args) : false;
  }

  /**
   * Request approval for a tool call
   * Returns a promise that resolves when approved, rejects when denied
   */
  async requestApproval(taskId, toolCallId, toolName, args) {
    const state = this.taskApprovals.get(taskId);
    if (!state) {
      // No approval state, initialize with 'ask' mode
      this.initTask(taskId, 'ask');
      return this.requestApproval(taskId, toolCallId, toolName, args);
    }

    // YOLO mode - always approve
    if (state.mode === 'yolo') {
      console.log(`[APPROVAL] YOLO mode - auto-approving ${toolName}`);
      return { approved: true, mode: 'yolo' };
    }

    // Auto mode - approve after first approval
    if (state.mode === 'auto' && state.hasApprovedOnce) {
      console.log(`[APPROVAL] Auto mode - auto-approving ${toolName}`);
      return { approved: true, mode: 'auto' };
    }

    // Ask mode - need user approval
    console.log(`[APPROVAL] Requesting user approval for ${toolName}`);

    return new Promise((resolve, reject) => {
      // Store pending approval
      const timeout = setTimeout(() => {
        state.pendingApprovals.delete(toolCallId);
        reject(new Error('Approval timeout (5 minutes)'));
      }, 5 * 60 * 1000); // 5 minute timeout

      state.pendingApprovals.set(toolCallId, {
        resolve,
        reject,
        timeout,
        toolName,
        args,
      });
    });
  }

  /**
   * User approves a pending tool call
   */
  approve(taskId, toolCallId) {
    const state = this.taskApprovals.get(taskId);
    if (!state) {
      throw new Error('No approval state for task');
    }

    const pending = state.pendingApprovals.get(toolCallId);
    if (!pending) {
      throw new Error('No pending approval for this tool call');
    }

    clearTimeout(pending.timeout);
    state.pendingApprovals.delete(toolCallId);
    state.hasApprovedOnce = true;

    console.log(`[APPROVAL] User approved ${pending.toolName}`);
    pending.resolve({ approved: true, mode: state.mode });
  }

  /**
   * User denies a pending tool call
   */
  deny(taskId, toolCallId) {
    const state = this.taskApprovals.get(taskId);
    if (!state) {
      throw new Error('No approval state for task');
    }

    const pending = state.pendingApprovals.get(toolCallId);
    if (!pending) {
      throw new Error('No pending approval for this tool call');
    }

    clearTimeout(pending.timeout);
    state.pendingApprovals.delete(toolCallId);

    console.log(`[APPROVAL] User denied ${pending.toolName}`);
    pending.reject(new Error('User denied approval'));
  }

  /**
   * Get pending approvals for a task
   */
  getPendingApprovals(taskId) {
    const state = this.taskApprovals.get(taskId);
    if (!state) return [];

    return Array.from(state.pendingApprovals.entries()).map(([callId, data]) => ({
      callId,
      toolName: data.toolName,
      args: data.args,
    }));
  }

  /**
   * Clean up approval state for a task
   */
  cleanup(taskId) {
    const state = this.taskApprovals.get(taskId);
    if (state) {
      // Reject all pending approvals
      for (const [callId, pending] of state.pendingApprovals.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Task ended'));
      }
    }
    this.taskApprovals.delete(taskId);
  }
}

export const approvalManager = new ApprovalManager();
