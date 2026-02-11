import { BaseTool } from './baseTool.js';

function formatSubagentList(list) {
  if (!list.length) return 'No subagents configured.';
  return list.map(s => `- ${s.name}: ${s.description}`).join('\n');
}

export class SubagentTaskTool extends BaseTool {
  constructor(subagentManager) {
    super();
    this.subagentManager = subagentManager;
  }

  get name() {
    return 'task';
  }

  get description() {
    const subagents = this.subagentManager.list();
    return [
      'Dispatch a subagent to execute a focused task.',
      'Subagents run in isolated context and cannot see the main agent history.',
      'Provide all necessary background in the prompt.',
      '',
      'Available subagents:',
      formatSubagentList(subagents),
    ].join('\n');
  }

  get parameters() {
    const subagents = this.subagentManager.list();
    const names = subagents.map(s => s.name);
    const subagentNameParam = names.length > 0
      ? { type: 'string', description: 'Subagent name to run', enum: names }
      : { type: 'string', description: 'Subagent name to run' };

    return {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Short task description (3-5 words)' },
        subagent_name: subagentNameParam,
        prompt: { type: 'string', description: 'Detailed task prompt for the subagent. Include ALL necessary context, file paths, and background since the subagent cannot see your conversation history.' },
      },
      required: ['description', 'subagent_name', 'prompt'],
    };
  }

  async execute(args, context) {
    const subagentName = typeof args.subagent_name === 'string' ? args.subagent_name.trim() : '';
    const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';

    if (!subagentName) {
      throw new Error('subagent_name is required');
    }
    if (!prompt) {
      throw new Error('prompt is required');
    }

    const subagent = this.subagentManager.get(subagentName);
    if (!subagent) {
      throw new Error(`Subagent not found: ${subagentName}`);
    }
    if (!context?.runSubagent) {
      throw new Error('Subagent runner is not available');
    }

    const result = await context.runSubagent({
      subagent,
      prompt,
      parentTaskId: context.taskId,
      onEvent: context.onEvent,
      toolCallId: context.toolCallId || null,
    });

    return JSON.stringify({
      subagent: subagentName,
      output: result || '',
    });
  }
}
