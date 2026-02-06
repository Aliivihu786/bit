import { BaseTool } from './baseTool.js';
import fs from 'fs/promises';
import path from 'path';

const MEMORY_DIR = path.join(process.cwd(), 'server', 'data', 'memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'MEMORY.md');

// Ensure memory directory exists
async function ensureMemoryDir() {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
}

// Simple keyword-based search (can be enhanced with embeddings later)
function searchMemory(content, query) {
  const lines = content.split('\n');
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const results = [];

  let currentSection = '';
  let currentContent = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection && currentContent.length > 0) {
        const text = currentContent.join('\n');
        const score = calculateRelevance(text, queryTerms);
        if (score > 0) {
          results.push({ section: currentSection, content: text.trim(), score });
        }
      }
      currentSection = line.replace(/^#+\s*/, '');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection && currentContent.length > 0) {
    const text = currentContent.join('\n');
    const score = calculateRelevance(text, queryTerms);
    if (score > 0) {
      results.push({ section: currentSection, content: text.trim(), score });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

function calculateRelevance(text, queryTerms) {
  const lowerText = text.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    const matches = (lowerText.match(new RegExp(term, 'g')) || []).length;
    score += matches;
  }
  return score;
}

export class MemoryTool extends BaseTool {
  get name() { return 'memory'; }

  get description() {
    return `Manage your persistent memory. Use this to remember important information across conversations.
Actions:
- save: Save a new memory with a title and content. Good for facts, preferences, context.
- search: Search your memories by keywords/topic to recall relevant information.
- list: List all memory sections/topics you've saved.
- read: Read the full content of a specific memory section.
- delete: Delete a memory section you no longer need.

Always search your memory at the start of complex tasks to recall relevant context!`;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['save', 'search', 'list', 'read', 'delete'],
          description: 'The memory operation to perform',
        },
        title: {
          type: 'string',
          description: 'Memory section title (for save/read/delete)',
        },
        content: {
          type: 'string',
          description: 'Memory content to save',
        },
        query: {
          type: 'string',
          description: 'Search query for finding relevant memories',
        },
      },
      required: ['action'],
    };
  }

  async execute({ action, title, content, query }) {
    await ensureMemoryDir();

    switch (action) {
      case 'save':
        return this._save(title, content);
      case 'search':
        return this._search(query);
      case 'list':
        return this._list();
      case 'read':
        return this._read(title);
      case 'delete':
        return this._delete(title);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async _save(title, content) {
    if (!title || !content) {
      throw new Error('Both title and content are required for saving');
    }

    let existing = '';
    try {
      existing = await fs.readFile(MEMORY_FILE, 'utf-8');
    } catch {
      // File doesn't exist yet
    }

    // Check if section already exists
    const sectionRegex = new RegExp(`^## ${this._escapeRegex(title)}$`, 'm');
    const sectionMatch = existing.match(sectionRegex);

    if (sectionMatch) {
      // Update existing section
      const nextSectionRegex = /^## /m;
      const startIdx = sectionMatch.index;
      const afterSection = existing.slice(startIdx + sectionMatch[0].length);
      const nextMatch = afterSection.match(nextSectionRegex);
      const endIdx = nextMatch ? startIdx + sectionMatch[0].length + nextMatch.index : existing.length;

      const before = existing.slice(0, startIdx);
      const after = existing.slice(endIdx);
      const newSection = `## ${title}\n\n${content}\n\n`;

      await fs.writeFile(MEMORY_FILE, before + newSection + after.trimStart());
      return JSON.stringify({ saved: true, title, action: 'updated' });
    } else {
      // Append new section
      const newSection = `\n## ${title}\n\n${content}\n`;
      await fs.writeFile(MEMORY_FILE, existing + newSection);
      return JSON.stringify({ saved: true, title, action: 'created' });
    }
  }

  async _search(query) {
    if (!query) {
      throw new Error('Query is required for search');
    }

    let content = '';
    try {
      content = await fs.readFile(MEMORY_FILE, 'utf-8');
    } catch {
      return JSON.stringify({ results: [], message: 'No memories saved yet' });
    }

    const results = searchMemory(content, query);

    if (results.length === 0) {
      return JSON.stringify({ results: [], message: 'No relevant memories found' });
    }

    return JSON.stringify({
      results: results.map(r => ({
        section: r.section,
        content: r.content.slice(0, 500) + (r.content.length > 500 ? '...' : ''),
        relevance: r.score,
      }))
    });
  }

  async _list() {
    let content = '';
    try {
      content = await fs.readFile(MEMORY_FILE, 'utf-8');
    } catch {
      return JSON.stringify({ sections: [], message: 'No memories saved yet' });
    }

    const sections = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.startsWith('## ')) {
        sections.push(line.replace(/^#+\s*/, ''));
      }
    }

    return JSON.stringify({ sections, count: sections.length });
  }

  async _read(title) {
    if (!title) {
      throw new Error('Title is required for reading');
    }

    let content = '';
    try {
      content = await fs.readFile(MEMORY_FILE, 'utf-8');
    } catch {
      return JSON.stringify({ error: 'No memories saved yet' });
    }

    const sectionRegex = new RegExp(`^## ${this._escapeRegex(title)}$`, 'm');
    const match = content.match(sectionRegex);

    if (!match) {
      return JSON.stringify({ error: `Memory section "${title}" not found` });
    }

    const startIdx = match.index + match[0].length;
    const afterSection = content.slice(startIdx);
    const nextMatch = afterSection.match(/^## /m);
    const sectionContent = nextMatch
      ? afterSection.slice(0, nextMatch.index).trim()
      : afterSection.trim();

    return JSON.stringify({ title, content: sectionContent });
  }

  async _delete(title) {
    if (!title) {
      throw new Error('Title is required for deletion');
    }

    let content = '';
    try {
      content = await fs.readFile(MEMORY_FILE, 'utf-8');
    } catch {
      return JSON.stringify({ error: 'No memories saved yet' });
    }

    const sectionRegex = new RegExp(`^## ${this._escapeRegex(title)}$`, 'm');
    const match = content.match(sectionRegex);

    if (!match) {
      return JSON.stringify({ error: `Memory section "${title}" not found` });
    }

    const startIdx = match.index;
    const afterSection = content.slice(startIdx + match[0].length);
    const nextMatch = afterSection.match(/^## /m);
    const endIdx = nextMatch ? startIdx + match[0].length + nextMatch.index : content.length;

    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx);

    await fs.writeFile(MEMORY_FILE, (before + after).trim() + '\n');
    return JSON.stringify({ deleted: true, title });
  }

  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
