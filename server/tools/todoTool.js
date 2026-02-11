import { BaseTool } from './baseTool.js';

export class TodoTool extends BaseTool {
  get name() {
    return 'set_todo_list';
  }

  get description() {
    return [
      'Set (replace) the current todo list to track progress on multi-step tasks.',
      'Each call must include the FULL list — there is no partial update.',
      '',
      'When to use:',
      '- Tasks with multiple subtasks or milestones.',
      '- When the user gives multiple tasks in a single request.',
      '- To break down complex work and show progress.',
      '',
      'When NOT to use:',
      '- Simple questions or single-step tasks.',
      '- Very short, straightforward instructions.',
    ].join('\n');
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The full updated todo list. Must include ALL items with current statuses.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Title of the todo item' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'done'],
                description: 'Current status',
              },
            },
            required: ['title', 'status'],
          },
        },
      },
      required: ['todos'],
    };
  }

  async execute(args, context) {
    const todos = Array.isArray(args.todos) ? args.todos : [];

    const items = todos
      .filter(t => t && typeof t.title === 'string' && t.title.trim())
      .map(t => ({
        title: t.title.trim(),
        status: ['pending', 'in_progress', 'done'].includes(t.status) ? t.status : 'pending',
      }));

    // Emit todo list event for UI rendering
    context?.onEvent?.({ type: 'todo_list', items });

    return JSON.stringify({ updated: true, count: items.length });
  }
}
