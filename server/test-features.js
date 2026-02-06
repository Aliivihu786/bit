/**
 * Feature Test Script
 * Run with: node server/test-features.js
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.chdir(dirname(__dirname));

console.log('\n🧪 BIT AGENT FEATURE TESTS\n');
console.log('='.repeat(50));

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${err.message}`);
    failed++;
  }
}

// ============================================
// 1. AUTH PROFILE ROTATION
// ============================================
console.log('\n📦 1. AUTH PROFILE ROTATION\n');

await test('AuthProfileManager loads from env', async () => {
  const { getAuthProfileManager } = await import('./agent/authProfiles.js');
  const manager = getAuthProfileManager();

  // Should have loaded profiles from env
  if (typeof manager.profiles !== 'object') {
    throw new Error('Profiles not initialized');
  }
  console.log(`   Loaded ${manager.profiles.length} profile(s)`);
});

await test('AuthProfile failover logic works', async () => {
  const { AuthProfileManager } = await import('./agent/authProfiles.js');
  const manager = new AuthProfileManager();

  // Add mock profiles
  manager.addProfile({ id: 'test1', name: 'Test 1', apiKey: 'sk-test1', provider: 'deepseek', priority: 0 });
  manager.addProfile({ id: 'test2', name: 'Test 2', apiKey: 'sk-test2', provider: 'openai', priority: 1 });

  if (manager.profiles.length !== 2) {
    throw new Error('Failed to add profiles');
  }

  // Test getNextProfile
  const profile = manager.getNextProfile();
  if (profile.id !== 'test1') {
    throw new Error('Should return highest priority profile');
  }

  // Mark first profile as failed
  profile.markFailure(new Error('Rate limited'));

  // Should now return second profile
  const next = manager.getNextProfile();
  if (next.id !== 'test2') {
    throw new Error('Should failover to next profile');
  }
});

// ============================================
// 2. SKILLS SYSTEM
// ============================================
console.log('\n📦 2. SKILLS SYSTEM\n');

await test('SkillManager loads skills from directory', async () => {
  const { getSkillManager } = await import('./agent/skillManager.js');
  const manager = await getSkillManager();

  if (!manager.loaded) {
    throw new Error('Skills not loaded');
  }

  console.log(`   Loaded ${manager.skills.size} skill(s)`);

  for (const [id, skill] of manager.skills) {
    console.log(`   - ${skill.emoji} ${skill.name} (valid: ${skill.isValid})`);
  }
});

await test('Skills inject into system prompt', async () => {
  const { getSkillManager } = await import('./agent/skillManager.js');
  const manager = await getSkillManager();

  const skillsPrompt = manager.getSkillsPrompt();

  if (manager.getActiveSkills().length > 0 && !skillsPrompt.includes('Available Skills')) {
    throw new Error('Skills not injected into prompt');
  }

  console.log(`   Skills prompt length: ${skillsPrompt.length} chars`);
});

await test('getSystemPrompt returns full prompt with skills', async () => {
  const { getSystemPrompt } = await import('./agent/prompts.js');
  const prompt = await getSystemPrompt();

  if (!prompt.includes('Bit Agent')) {
    throw new Error('Base prompt not included');
  }

  console.log(`   Full prompt length: ${prompt.length} chars`);
});

// ============================================
// 3. MEMORY SYSTEM
// ============================================
console.log('\n📦 3. MEMORY SYSTEM\n');

await test('MemoryTool save action', async () => {
  const { MemoryTool } = await import('./tools/memoryTool.js');
  const tool = new MemoryTool();

  const result = await tool.execute({
    action: 'save',
    title: 'Test Feature',
    content: 'This is a test memory entry for feature testing.',
  });

  const parsed = JSON.parse(result);
  if (!parsed.saved) {
    throw new Error('Failed to save memory');
  }
});

await test('MemoryTool search action', async () => {
  const { MemoryTool } = await import('./tools/memoryTool.js');
  const tool = new MemoryTool();

  const result = await tool.execute({
    action: 'search',
    query: 'test feature',
  });

  const parsed = JSON.parse(result);
  if (!parsed.results) {
    throw new Error('Search did not return results array');
  }

  console.log(`   Found ${parsed.results.length} matching memories`);
});

await test('MemoryTool list action', async () => {
  const { MemoryTool } = await import('./tools/memoryTool.js');
  const tool = new MemoryTool();

  const result = await tool.execute({ action: 'list' });
  const parsed = JSON.parse(result);

  if (!parsed.sections) {
    throw new Error('List did not return sections');
  }

  console.log(`   ${parsed.count} memory section(s)`);
});

// ============================================
// 4. CONTEXT WINDOW GUARD
// ============================================
console.log('\n📦 4. CONTEXT WINDOW GUARD\n');

await test('ContextWindowGuard initialization', async () => {
  const { ContextWindowGuard } = await import('./agent/contextWindowGuard.js');
  const guard = new ContextWindowGuard({ model: 'deepseek-chat' });

  const status = guard.getStatus();

  if (status.maxTokens !== 64000) {
    throw new Error(`Unexpected max tokens: ${status.maxTokens}`);
  }

  console.log(`   Max tokens: ${status.maxTokens}, Effective limit: ${status.effectiveLimit}`);
});

await test('ContextWindowGuard warning thresholds', async () => {
  const { ContextWindowGuard } = await import('./agent/contextWindowGuard.js');
  const guard = new ContextWindowGuard({ model: 'deepseek-chat' });

  // Simulate 75% usage
  guard.lastPromptTokens = Math.floor(guard.effectiveLimit * 0.75);

  const events = [];
  const status = guard.check([], (e) => events.push(e));

  if (!guard.warningEmitted) {
    throw new Error('Warning should have been emitted at 75%');
  }

  console.log(`   Warning emitted at ${status.usagePercent}% usage`);
});

await test('ContextWindowGuard message compaction', async () => {
  const { ContextWindowGuard } = await import('./agent/contextWindowGuard.js');
  const guard = new ContextWindowGuard();

  // Create many messages
  const messages = Array(20).fill(null).map((_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i} with some content`,
  }));

  const compacted = guard.compactMessages(messages);

  if (compacted.length >= messages.length) {
    throw new Error('Messages should have been compacted');
  }

  console.log(`   Compacted ${messages.length} -> ${compacted.length} messages`);
});

// ============================================
// 5. CANVAS SYSTEM
// ============================================
console.log('\n📦 5. CANVAS SYSTEM\n');

await test('CanvasTool create action', async () => {
  const { CanvasTool } = await import('./tools/canvasTool.js');
  const tool = new CanvasTool();

  // First delete if exists
  try {
    await tool.execute({ action: 'delete', name: 'test-canvas.html' });
  } catch {}

  const result = await tool.execute({
    action: 'create',
    name: 'test-canvas.html',
    content: '<!DOCTYPE html><html><body><h1>Test Canvas</h1></body></html>',
  });

  const parsed = JSON.parse(result);
  if (!parsed.created) {
    throw new Error('Failed to create canvas');
  }

  console.log(`   Created: ${parsed.url}`);
});

await test('CanvasTool list action', async () => {
  const { CanvasTool } = await import('./tools/canvasTool.js');
  const tool = new CanvasTool();

  const result = await tool.execute({ action: 'list' });
  const parsed = JSON.parse(result);

  if (!Array.isArray(parsed.canvases)) {
    throw new Error('List did not return canvases array');
  }

  console.log(`   Found ${parsed.count} canvas(es)`);
});

await test('CanvasTool read action', async () => {
  const { CanvasTool } = await import('./tools/canvasTool.js');
  const tool = new CanvasTool();

  const result = await tool.execute({ action: 'read', name: 'test-canvas.html' });
  const parsed = JSON.parse(result);

  if (!parsed.content.includes('Test Canvas')) {
    throw new Error('Read did not return correct content');
  }
});

await test('CanvasTool update action', async () => {
  const { CanvasTool } = await import('./tools/canvasTool.js');
  const tool = new CanvasTool();

  const result = await tool.execute({
    action: 'update',
    name: 'test-canvas.html',
    content: '<!DOCTYPE html><html><body><h1>Updated Canvas</h1></body></html>',
  });

  const parsed = JSON.parse(result);
  if (!parsed.updated) {
    throw new Error('Failed to update canvas');
  }
});

await test('CanvasTool delete action', async () => {
  const { CanvasTool } = await import('./tools/canvasTool.js');
  const tool = new CanvasTool();

  const result = await tool.execute({ action: 'delete', name: 'test-canvas.html' });
  const parsed = JSON.parse(result);

  if (!parsed.deleted) {
    throw new Error('Failed to delete canvas');
  }
});

// ============================================
// 6. TOOL REGISTRY
// ============================================
console.log('\n📦 6. TOOL REGISTRY\n');

await test('All tools registered correctly', async () => {
  const { createToolRegistry } = await import('./agent/toolRegistry.js');

  // Create registry with mock getters
  const registry = createToolRegistry(
    () => Promise.resolve({}), // mock sandbox
    () => Promise.resolve({})  // mock browser session
  );

  const tools = registry.getToolDefinitions();
  const toolNames = tools.map(t => t.function.name);

  const expectedTools = [
    'web_search',
    'web_browser',
    'code_executor',
    'file_manager',
    'browser_automation',
    'memory',
    'canvas',
  ];

  for (const name of expectedTools) {
    if (!toolNames.includes(name)) {
      throw new Error(`Missing tool: ${name}`);
    }
  }

  console.log(`   Registered tools: ${toolNames.join(', ')}`);
});

// ============================================
// 7. LLM WITH AUTH PROFILES
// ============================================
console.log('\n📦 7. LLM MODULE\n');

await test('LLM module exports correct functions', async () => {
  const llm = await import('./agent/llm.js');

  if (typeof llm.chatCompletion !== 'function') {
    throw new Error('chatCompletion not exported');
  }

  if (typeof llm.getAuthStatus !== 'function') {
    throw new Error('getAuthStatus not exported');
  }

  const status = llm.getAuthStatus();
  console.log(`   Auth profiles: ${status.totalProfiles}, Available: ${status.availableProfiles}`);
});

// ============================================
// SUMMARY
// ============================================
console.log('\n' + '='.repeat(50));
console.log(`\n📊 TEST SUMMARY: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
