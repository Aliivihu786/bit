/**
 * Skills System - Metadata-driven plugin architecture
 *
 * Inspired by OpenClaw's skills system
 *
 * Features:
 * - Skills defined as SKILL.md files with YAML frontmatter
 * - Auto-discovery of skills in /skills directory
 * - Requirement validation (bins, env vars)
 * - Dynamic system prompt injection
 * - Enable/disable skills per task
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

const SKILLS_DIR = path.join(process.cwd(), 'server', 'skills');

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const yamlContent = match[1];
  const body = match[2];

  // Simple YAML parser for our use case
  const metadata = parseSimpleYaml(yamlContent);

  return { metadata, body };
}

/**
 * Simple YAML parser (handles our skill metadata format)
 */
function parseSimpleYaml(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  let currentKey = null;
  let currentIndent = 0;
  const stack = [result];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Handle key: value pairs
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      if (value) {
        // Simple value
        if (value.startsWith('"') && value.endsWith('"')) {
          stack[stack.length - 1][key] = value.slice(1, -1);
        } else if (value.startsWith('[') && value.endsWith(']')) {
          // Inline array - filter out empty strings for empty arrays like []
          stack[stack.length - 1][key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, '')).filter(s => s !== '');
        } else if (value === 'true') {
          stack[stack.length - 1][key] = true;
        } else if (value === 'false') {
          stack[stack.length - 1][key] = false;
        } else if (!isNaN(value)) {
          stack[stack.length - 1][key] = Number(value);
        } else {
          stack[stack.length - 1][key] = value;
        }
      } else {
        // Nested object
        stack[stack.length - 1][key] = {};
        stack.push(stack[stack.length - 1][key]);
        currentIndent = indent;
      }
    } else if (trimmed.startsWith('- ')) {
      // Array item
      const value = trimmed.slice(2).trim();
      const parent = stack[stack.length - 1];
      const lastKey = Object.keys(parent).pop();
      if (!Array.isArray(parent[lastKey])) {
        parent[lastKey] = [];
      }
      parent[lastKey].push(value.replace(/"/g, ''));
    }
  }

  return result;
}

/**
 * Check if a binary exists in PATH
 */
function binaryExists(name) {
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an environment variable is set
 */
function envExists(name) {
  return !!process.env[name];
}

/**
 * Skill class representing a loaded skill
 */
class Skill {
  constructor(id, metadata, documentation) {
    this.id = id;
    this.name = metadata.name || id;
    this.description = metadata.description || '';
    this.emoji = metadata.openclaw?.emoji || metadata.emoji || '🔧';
    this.enabled = true;
    this.documentation = documentation;

    // Requirements
    this.requires = metadata.openclaw?.requires || metadata.requires || {};
    this.requiredBins = this.requires.bins || [];
    this.requiredEnv = this.requires.env || [];
    this.anyBins = this.requires.anyBins || [];

    // Install instructions
    this.install = metadata.openclaw?.install || metadata.install || [];

    // Validate requirements
    this.validationResult = this.validateRequirements();
    this.isValid = this.validationResult.valid;
  }

  validateRequirements() {
    const missing = {
      bins: [],
      env: [],
    };

    // Check required binaries
    for (const bin of this.requiredBins) {
      if (!binaryExists(bin)) {
        missing.bins.push(bin);
      }
    }

    // Check anyBins (at least one must exist)
    if (this.anyBins.length > 0) {
      const hasAny = this.anyBins.some(bin => binaryExists(bin));
      if (!hasAny) {
        missing.bins.push(`one of: ${this.anyBins.join(', ')}`);
      }
    }

    // Check required env vars
    for (const env of this.requiredEnv) {
      if (!envExists(env)) {
        missing.env.push(env);
      }
    }

    const valid = missing.bins.length === 0 && missing.env.length === 0;

    return { valid, missing };
  }

  getPromptSection() {
    if (!this.enabled || !this.isValid) return null;

    return `## ${this.emoji} ${this.name}

${this.description}

${this.documentation}`;
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      emoji: this.emoji,
      description: this.description,
      enabled: this.enabled,
      isValid: this.isValid,
      validationResult: this.validationResult,
      hasInstallInstructions: this.install.length > 0,
    };
  }
}

/**
 * Skill Manager - loads and manages all skills
 */
export class SkillManager {
  constructor() {
    this.skills = new Map();
    this.loaded = false;
  }

  /**
   * Load all skills from the skills directory
   */
  async loadSkills() {
    try {
      const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadSkillFromDir(path.join(SKILLS_DIR, entry.name));
        } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
          await this.loadSkillFromFile(path.join(SKILLS_DIR, entry.name));
        }
      }

      this.loaded = true;
      console.log(`[SkillManager] Loaded ${this.skills.size} skill(s)`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('[SkillManager] Skills directory not found, creating...');
        await fs.mkdir(SKILLS_DIR, { recursive: true });
      } else {
        console.error('[SkillManager] Error loading skills:', err.message);
      }
    }
  }

  /**
   * Load a skill from a directory (expects SKILL.md inside)
   */
  async loadSkillFromDir(dirPath) {
    const skillFile = path.join(dirPath, 'SKILL.md');
    try {
      await this.loadSkillFromFile(skillFile);
    } catch (err) {
      // Directory without SKILL.md, skip
    }
  }

  /**
   * Load a skill from a markdown file
   */
  async loadSkillFromFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const { metadata, body } = parseFrontmatter(content);

      const id = path.basename(path.dirname(filePath));
      const skill = new Skill(
        metadata.name || id,
        metadata,
        body.trim()
      );

      this.skills.set(skill.id, skill);

      if (skill.isValid) {
        console.log(`[SkillManager] Loaded skill: ${skill.emoji} ${skill.name}`);
      } else {
        console.log(`[SkillManager] Skill ${skill.name} has unmet requirements:`, skill.validationResult.missing);
      }
    } catch (err) {
      // File read error, skip
    }
  }

  /**
   * Get all enabled and valid skills
   */
  getActiveSkills() {
    return Array.from(this.skills.values()).filter(s => s.enabled && s.isValid);
  }

  /**
   * Get skill by ID
   */
  getSkill(id) {
    return this.skills.get(id);
  }

  /**
   * Enable a skill
   */
  enableSkill(id) {
    const skill = this.skills.get(id);
    if (skill) {
      skill.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a skill
   */
  disableSkill(id) {
    const skill = this.skills.get(id);
    if (skill) {
      skill.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Generate system prompt additions from active skills
   */
  getSkillsPrompt() {
    const activeSkills = this.getActiveSkills();
    if (activeSkills.length === 0) return '';

    const sections = activeSkills
      .map(s => s.getPromptSection())
      .filter(Boolean);

    if (sections.length === 0) return '';

    return `

# Available Skills

The following specialized skills are available to help with specific tasks:

${sections.join('\n\n---\n\n')}
`;
  }

  /**
   * Get status of all skills
   */
  getStatus() {
    return {
      loaded: this.loaded,
      totalSkills: this.skills.size,
      activeSkills: this.getActiveSkills().length,
      skills: Array.from(this.skills.values()).map(s => s.getStatus()),
    };
  }
}

// Singleton instance
let managerInstance = null;

export async function getSkillManager() {
  if (!managerInstance) {
    managerInstance = new SkillManager();
    await managerInstance.loadSkills();
  }
  return managerInstance;
}

/**
 * Create a sample skill file
 */
export async function createSampleSkill(name, config) {
  const skillDir = path.join(SKILLS_DIR, name);
  await fs.mkdir(skillDir, { recursive: true });

  const skillContent = `---
name: ${config.name || name}
description: "${config.description || 'A custom skill'}"
emoji: "${config.emoji || '🔧'}"
requires:
  bins: ${JSON.stringify(config.bins || [])}
  env: ${JSON.stringify(config.env || [])}
---

# ${config.name || name}

${config.documentation || 'Add your skill documentation here.'}

## Usage

Describe how to use this skill.

## Examples

Add examples here.
`;

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);
  console.log(`[SkillManager] Created skill: ${name}`);
}
