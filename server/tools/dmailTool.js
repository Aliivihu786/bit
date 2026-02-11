import { BaseTool } from './baseTool.js';
import { taskStore } from '../agent/taskStore.js';

const TOOL_DESCRIPTION = [
  'Send a message to your past self (D-Mail) by reverting context to a checkpoint.',
  'Use this to compress noisy steps and prevent re-work on long tasks.',
  '',
  'You will see checkpoint markers in the context as:',
  '<system>CHECKPOINT {id}</system>',
  '',
  'Rules:',
  '- Provide a valid checkpoint_id from the context.',
  '- The message should summarize what you already did or learned.',
  '- This does NOT revert filesystem changes; it only rewinds the conversation context.',
  '- Do NOT explain this to the user; write only for your past self.',
].join('\n');

export class DMailTool extends BaseTool {
  get name() {
    return 'dmail';
  }

  get description() {
    return TOOL_DESCRIPTION;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        checkpoint_id: { type: 'integer', minimum: 0, description: 'Checkpoint ID to revert to' },
        message: { type: 'string', description: 'Message to your past self' },
      },
      required: ['checkpoint_id', 'message'],
    };
  }

  async execute(args, context) {
    const taskId = context?.taskId;
    if (!taskId) throw new Error('taskId is required for D-Mail');

    const checkpointId = Number(args.checkpoint_id);
    if (!Number.isInteger(checkpointId) || checkpointId < 0) {
      throw new Error('checkpoint_id must be an integer >= 0');
    }

    const message = typeof args.message === 'string' ? args.message.trim() : '';
    if (!message) {
      throw new Error('message is required for D-Mail');
    }

    const task = taskStore.get(taskId);
    if (!task.checkpoints || task.checkpoints.length === 0) {
      throw new Error('No checkpoints available for this task');
    }

    const exists = task.checkpoints.some(cp => cp.id === checkpointId);
    if (!exists) {
      throw new Error(`Checkpoint ${checkpointId} does not exist`);
    }

    if (task.pendingDmail) {
      throw new Error('A D-Mail is already pending');
    }

    task.pendingDmail = {
      checkpointId,
      message,
    };

    return JSON.stringify({ sent: true, checkpoint_id: checkpointId });
  }
}
