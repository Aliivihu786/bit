import { WebSearchTool } from '../tools/webSearch.js';
import { WebBrowserTool } from '../tools/webBrowser.js';
import { CodeExecutorTool } from '../tools/codeExecutor.js';
import { FileManagerTool } from '../tools/fileManager.js';
import { MemoryTool } from '../tools/memoryTool.js';
import { CanvasTool } from '../tools/canvasTool.js';
import { ProjectScaffoldTool } from '../tools/projectScaffold.js';
import { SubagentTaskTool } from '../tools/subagentTask.js';
import { CreateSubagentTool } from '../tools/createSubagent.js';
import { DMailTool } from '../tools/dmailTool.js';
import { ThinkTool } from '../tools/thinkTool.js';
import { TodoTool } from '../tools/todoTool.js';
import { subagentManager } from './subagentManager.js';

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.subagentManager = null;
  }

  register(tool) {
    this.tools.set(tool.name, tool);
  }

  getToolDefinitions(options = {}) {
    const { include = null, exclude = [] } = options;
    const includeSet = Array.isArray(include) ? new Set(include) : null;
    const excludeSet = new Set(Array.isArray(exclude) ? exclude : []);
    return Array.from(this.tools.values())
      .filter(tool => {
        if (includeSet && !includeSet.has(tool.name)) return false;
        if (excludeSet.has(tool.name)) return false;
        return true;
      })
      .map(t => t.toToolDefinition());
  }

  async executeTool(name, args, context) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    if (context?.allowedTools && Array.isArray(context.allowedTools)) {
      if (!context.allowedTools.includes(name)) {
        throw new Error(`Tool not allowed for this agent: ${name}`);
      }
    }
    if (context?.excludedTools && Array.isArray(context.excludedTools)) {
      if (context.excludedTools.includes(name)) {
        throw new Error(`Tool not allowed for this agent: ${name}`);
      }
    }
    return tool.execute(args, context);
  }
}

export function createToolRegistry(sandboxGetter) {
  const registry = new ToolRegistry();
  registry.subagentManager = subagentManager;
  registry.register(new WebSearchTool());
  registry.register(new WebBrowserTool()); // Read-only: goto, get_text, get_links
  registry.register(new CodeExecutorTool(sandboxGetter));
  registry.register(new FileManagerTool(sandboxGetter));
  registry.register(new MemoryTool());
  registry.register(new CanvasTool(sandboxGetter)); // Also writes to workspace
  registry.register(new ProjectScaffoldTool(sandboxGetter));
  registry.register(new SubagentTaskTool(registry.subagentManager));
  registry.register(new CreateSubagentTool(registry.subagentManager));
  registry.register(new DMailTool());
  registry.register(new ThinkTool());
  registry.register(new TodoTool());
  return registry;
}
