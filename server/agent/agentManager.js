import fs from 'fs';
import path from 'path';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'agents.json');
const FALLBACK_AGENT = {
  name: 'default',
  displayName: 'Default Assistant',
  description: 'General-purpose coding assistant',
  systemPrompt: 'You are a helpful AI coding assistant.',
  tools: [],
  excludeTools: [],
  color: '#3b82f6',
};

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

function normalizeAgent(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const name = normalizeString(raw.name);
  const systemPrompt = normalizeString(raw.systemPrompt || raw.system_prompt);

  if (!name || !systemPrompt) return null;

  return {
    name,
    displayName: normalizeString(raw.displayName || raw.display_name) || name,
    description: normalizeString(raw.description) || `Agent: ${name}`,
    systemPrompt,
    tools: normalizeStringArray(raw.tools),
    excludeTools: normalizeStringArray(raw.excludeTools || raw.exclude_tools),
    color: normalizeString(raw.color) || '#3b82f6',
  };
}

export class AgentManager {
  constructor({ configPath = DEFAULT_CONFIG_PATH } = {}) {
    this.configPath = configPath;
    this.agents = new Map();
    this._loadAgents();
  }

  _loadAgents() {
    if (!fs.existsSync(this.configPath)) {
      console.log('[AgentManager] No agents.json found, using fallback');
      this.agents.set(FALLBACK_AGENT.name, FALLBACK_AGENT);
      return;
    }

    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed.agents;

      if (!Array.isArray(list)) {
        console.error('[AgentManager] Invalid agents.json format');
        this.agents.set(FALLBACK_AGENT.name, FALLBACK_AGENT);
        return;
      }

      let loadedCount = 0;
      for (const item of list) {
        const agent = normalizeAgent(item);
        if (!agent) continue;
        this.agents.set(agent.name, agent);
        loadedCount++;
      }

      console.log(`[AgentManager] Loaded ${loadedCount} agent profile(s)`);

      // Always ensure a default exists
      if (!this.agents.has('default')) {
        this.agents.set(FALLBACK_AGENT.name, FALLBACK_AGENT);
      }
    } catch (err) {
      console.error('[AgentManager] Failed to load agents.json:', err.message);
      this.agents.set(FALLBACK_AGENT.name, FALLBACK_AGENT);
    }
  }

  list() {
    return Array.from(this.agents.values());
  }

  get(name) {
    const agent = this.agents.get(name);
    if (!agent) {
      console.log(`[AgentManager] Agent '${name}' not found, using default`);
      return this.agents.get('default') || FALLBACK_AGENT;
    }
    return agent;
  }

  getDefault() {
    return this.agents.get('default') || FALLBACK_AGENT;
  }
}

export const agentManager = new AgentManager();
