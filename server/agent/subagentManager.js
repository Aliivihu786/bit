import fs from 'fs';
import path from 'path';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'subagents.json');

function normalizeString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .filter(v => v.length > 0);
}

function normalizeSpec(raw, kind) {
  if (!raw || typeof raw !== 'object') return null;
  const name = normalizeString(raw.name);
  const systemPrompt = normalizeString(raw.systemPrompt || raw.system_prompt);
  if (!name || !systemPrompt) return null;
  const description = normalizeString(raw.description) || `Subagent ${name}`;
  const tools = normalizeStringArray(raw.tools);
  const excludeTools = normalizeStringArray(raw.excludeTools || raw.exclude_tools);
  return { name, description, systemPrompt, tools, excludeTools, kind };
}

export class SubagentManager {
  constructor({ configPath = DEFAULT_CONFIG_PATH } = {}) {
    this.configPath = configPath;
    this.fixed = new Map();
    this.dynamic = new Map();
    this._loadFixed();
  }

  _loadFixed() {
    if (!fs.existsSync(this.configPath)) {
      return;
    }
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.subagents;
      if (!Array.isArray(list)) return;
      for (const item of list) {
        const spec = normalizeSpec(item, 'fixed');
        if (!spec) continue;
        this.fixed.set(spec.name, spec);
      }
    } catch (err) {
      console.error('[SubagentManager] Failed to load subagents.json:', err.message);
    }
  }

  list() {
    return [...this.fixed.values(), ...this.dynamic.values()];
  }

  get(name) {
    if (this.dynamic.has(name)) return this.dynamic.get(name);
    return this.fixed.get(name);
  }

  addDynamic(raw) {
    const spec = normalizeSpec(raw, 'dynamic');
    if (!spec) {
      throw new Error('Invalid subagent spec. name and system_prompt are required.');
    }
    if (this.fixed.has(spec.name) || this.dynamic.has(spec.name)) {
      throw new Error(`Subagent already exists: ${spec.name}`);
    }
    this.dynamic.set(spec.name, spec);
    return spec;
  }
}

export const subagentManager = new SubagentManager();
