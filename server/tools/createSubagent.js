import { BaseTool } from './baseTool.js';

export class CreateSubagentTool extends BaseTool {
  constructor(subagentManager) {
    super();
    this.subagentManager = subagentManager;
  }

  get name() {
    return 'create_subagent';
  }

  get description() {
    return 'Create a dynamic subagent with a custom system prompt and optional tool restrictions.';
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique subagent name' },
        description: { type: 'string', description: 'Short description of the subagent' },
        system_prompt: { type: 'string', description: 'System prompt for the subagent' },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional allow-list of tool names for this subagent',
        },
        exclude_tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional deny-list of tool names for this subagent',
        },
      },
      required: ['name', 'system_prompt'],
    };
  }

  async execute(args) {
    const spec = {
      name: args.name,
      description: args.description,
      systemPrompt: args.system_prompt,
      tools: args.tools,
      excludeTools: args.exclude_tools,
    };

    const created = this.subagentManager.addDynamic(spec);
    return JSON.stringify({
      created: true,
      name: created.name,
      available: this.subagentManager.list().map(s => s.name),
    });
  }
}
