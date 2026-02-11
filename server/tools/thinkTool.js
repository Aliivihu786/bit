import { BaseTool } from './baseTool.js';

export class ThinkTool extends BaseTool {
  get name() {
    return 'think';
  }

  get description() {
    return 'Log an internal thought without responding to the user. Use this to reason silently.';
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        thought: { type: 'string', description: 'Internal reasoning or notes' },
      },
      required: ['thought'],
    };
  }

  async execute(args, context) {
    const thought = typeof args.thought === 'string' ? args.thought.trim() : '';
    if (!thought) {
      throw new Error('thought is required');
    }
    context?.onEvent?.({ type: 'think', content: thought });
    return JSON.stringify({ logged: true });
  }
}
