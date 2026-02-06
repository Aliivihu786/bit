export class BaseTool {
  get name() {
    throw new Error('Must implement name');
  }

  get description() {
    throw new Error('Must implement description');
  }

  get parameters() {
    throw new Error('Must implement parameters');
  }

  toToolDefinition() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }

  async execute(args, context) {
    throw new Error('Must implement execute');
  }
}
