import { WebSearchTool } from '../tools/webSearch.js';
import { WebBrowserTool } from '../tools/webBrowser.js';
import { CodeExecutorTool } from '../tools/codeExecutor.js';
import { FileManagerTool } from '../tools/fileManager.js';
import { MemoryTool } from '../tools/memoryTool.js';
import { CanvasTool } from '../tools/canvasTool.js';
import { ProjectScaffoldTool } from '../tools/projectScaffold.js';

class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    this.tools.set(tool.name, tool);
  }

  getToolDefinitions() {
    return Array.from(this.tools.values()).map(t => t.toToolDefinition());
  }

  async executeTool(name, args, context) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(args, context);
  }
}

export function createToolRegistry(sandboxGetter) {
  const registry = new ToolRegistry();
  registry.register(new WebSearchTool());
  registry.register(new WebBrowserTool()); // Read-only: goto, get_text, get_links
  registry.register(new CodeExecutorTool(sandboxGetter));
  registry.register(new FileManagerTool(sandboxGetter));
  registry.register(new MemoryTool());
  registry.register(new CanvasTool(sandboxGetter)); // Also writes to workspace
  registry.register(new ProjectScaffoldTool(sandboxGetter));
  return registry;
}
