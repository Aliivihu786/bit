import fs from 'fs';
import path from 'path';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'subagents.json');
const DYNAMIC_CONFIG_PATH = path.resolve(process.cwd(), 'subagents.dynamic.json');

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
  constructor({ configPath = DEFAULT_CONFIG_PATH, dynamicPath = DYNAMIC_CONFIG_PATH } = {}) {
    this.configPath = configPath;
    this.dynamicPath = dynamicPath;
    this.fixed = new Map();
    this.dynamic = new Map();
    this._loadFixed();
    this._loadDynamic();
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
      console.log(`[SubagentManager] Loaded ${this.fixed.size} fixed subagent(s)`);
    } catch (err) {
      console.error('[SubagentManager] Failed to load subagents.json:', err.message);
    }
  }

  _loadDynamic() {
    if (!fs.existsSync(this.dynamicPath)) {
      return;
    }
    try {
      const raw = fs.readFileSync(this.dynamicPath, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.subagents;
      if (!Array.isArray(list)) return;
      for (const item of list) {
        const spec = normalizeSpec(item, 'dynamic');
        if (!spec) continue;
        this.dynamic.set(spec.name, spec);
      }
      console.log(`[SubagentManager] Loaded ${this.dynamic.size} dynamic subagent(s)`);
    } catch (err) {
      console.error('[SubagentManager] Failed to load subagents.dynamic.json:', err.message);
    }
  }

  _saveDynamic() {
    try {
      const list = Array.from(this.dynamic.values());
      const data = { subagents: list };
      fs.writeFileSync(this.dynamicPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[SubagentManager] Saved ${list.length} dynamic subagent(s)`);
    } catch (err) {
      console.error('[SubagentManager] Failed to save dynamic subagents:', err.message);
      throw new Error('Failed to persist dynamic subagents');
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
    this._saveDynamic();
    return spec;
  }

  updateDynamic(name, updates) {
    if (this.fixed.has(name)) {
      throw new Error(`Cannot update fixed subagent: ${name}`);
    }
    if (!this.dynamic.has(name)) {
      throw new Error(`Subagent not found: ${name}`);
    }
    const existing = this.dynamic.get(name);
    const updated = normalizeSpec({ ...existing, ...updates }, 'dynamic');
    if (!updated) {
      throw new Error('Invalid subagent spec after update');
    }
    // If name changed, remove old and add new
    if (updated.name !== name) {
      if (this.fixed.has(updated.name) || this.dynamic.has(updated.name)) {
        throw new Error(`Subagent already exists: ${updated.name}`);
      }
      this.dynamic.delete(name);
    }
    this.dynamic.set(updated.name, updated);
    this._saveDynamic();
    return updated;
  }

  deleteDynamic(name) {
    if (this.fixed.has(name)) {
      throw new Error(`Cannot delete fixed subagent: ${name}. Edit subagents.json instead.`);
    }
    if (!this.dynamic.has(name)) {
      throw new Error(`Subagent not found: ${name}`);
    }
    this.dynamic.delete(name);
    this._saveDynamic();
    return true;
  }
}

export const subagentManager = new SubagentManager();
