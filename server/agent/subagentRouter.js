import { chatCompletion } from './llm.js';
import { config } from '../config.js';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'then',
  'your', 'you', 'are', 'use', 'using', 'used', 'have', 'has', 'had', 'will',
  'can', 'could', 'should', 'would', 'about', 'over', 'under', 'into', 'onto',
  'also', 'more', 'less', 'make', 'made', 'need', 'needs', 'task', 'agent',
  'subagent', 'help', 'please', 'just', 'like', 'some', 'any', 'each', 'such',
  'code', 'review', 'write', 'fix', 'create', 'build', 'design',
]);

const SKIP_PHRASES = [
  'no subagent',
  'dont use subagent',
  "don't use subagent",
  'do not use subagent',
  'use main agent',
  'no helper',
];

const DECOMPOSE_HINTS = [
  'research',
  'analyze',
  'compare',
  'summarize',
  'plan',
  'design',
  'review',
  'audit',
  'benchmark',
];

const MULTI_STEP_PATTERNS = [
  /\band\b/i,
  /\bthen\b/i,
  /\balso\b/i,
  /\bplus\b/i,
  /;/,
  /\n/,
];

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(t => t.trim())
    .filter(t => t.length >= 4 && !STOPWORDS.has(t));
}

function extractJsonBlock(text) {
  if (!text) return null;
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  const candidate = text.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function unique(arr) {
  return [...new Set(arr)];
}

function shouldDecompose(message) {
  if (!message || typeof message !== 'string') return false;
  const trimmed = message.trim();
  if (trimmed.length < 80) return false;
  const wordCount = trimmed.split(/\s+/g).length;
  if (wordCount < 12) return false;
  const hasMultiStep = MULTI_STEP_PATTERNS.some(re => re.test(trimmed));
  if (hasMultiStep) return true;
  const lower = trimmed.toLowerCase();
  return DECOMPOSE_HINTS.some(hint => lower.includes(hint));
}

export function autoSelectSubagent(message, subagents) {
  if (!message || typeof message !== 'string') return null;
  if (!Array.isArray(subagents) || subagents.length === 0) return null;

  const msg = message.toLowerCase();
  if (SKIP_PHRASES.some(phrase => msg.includes(phrase))) return null;
  const msgTokens = new Set(tokenize(message));
  if (msgTokens.size < 2) return null;

  // Explicit name mention wins
  const explicit = subagents.find(s => s.name && msg.includes(s.name.toLowerCase()));
  if (explicit) {
    return {
      subagent: explicit,
      score: 10,
      reason: 'explicit name',
    };
  }

  let best = null;
  let secondScore = 0;

  for (const subagent of subagents) {
    const nameTokens = unique(tokenize(subagent.name || ''));
    const descTokens = unique(tokenize(subagent.description || ''));
    const allTokens = unique([...nameTokens, ...descTokens]);
    if (allTokens.length === 0) continue;

    let score = 0;
    const matched = [];
    for (const token of allTokens) {
      if (msgTokens.has(token)) {
        score += 1;
        matched.push(token);
      }
    }
    for (const token of nameTokens) {
      if (msgTokens.has(token)) {
        score += 2;
      }
    }

    if (!best || score > best.score) {
      secondScore = best ? best.score : secondScore;
      best = { subagent, score, matched: unique(matched) };
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!best) return null;
  if (best.score < 2) return null;
  if (best.score === secondScore) return null;

  return {
    subagent: best.subagent,
    score: best.score,
    reason: best.matched.slice(0, 5).join(', '),
  };
}

export function buildAutoSubagentPrompt(userMessage) {
  return [
    'You are running as an auto-selected subagent.',
    'Focus on producing a concise, actionable summary for the main agent.',
    '',
    'User request:',
    userMessage,
  ].join('\n');
}

export function buildSubagentBatchPrompt(userMessage, tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const taskLines = list.map((task, index) => {
    const title = task?.title ? `${task.title}: ` : '';
    const prompt = task?.prompt ? task.prompt : `Task ${index + 1}`;
    return `- ${title}${prompt}`;
  });

  return [
    'You are running as an auto-selected subagent.',
    'Focus on producing a concise, actionable summary for the main agent.',
    '',
    'User request:',
    userMessage,
    '',
    'Your assigned subtasks:',
    ...(taskLines.length ? taskLines : ['- (no tasks provided)']),
  ].join('\n');
}

export async function autoSelectSubagentLLM(message, subagents) {
  if (!message || typeof message !== 'string') return null;
  if (!Array.isArray(subagents) || subagents.length === 0) return null;
  if (!config.deepseekApiKey) return null;

  const list = subagents
    .map(s => `- ${s.name}: ${s.description || 'No description'}`)
    .join('\n');

  const system = [
    'You are a routing classifier.',
    'Choose the single best subagent for the user request, or "none".',
    'Return JSON only: {"name":"subagent_name_or_none","reason":"short reason","confidence":0-1}.',
  ].join('\n');

  const user = [
    'User request:',
    message,
    '',
    'Available subagents:',
    list,
  ].join('\n');

  try {
    const response = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      modelOverride: config.subagentModel || config.mainModel,
    });
    const content = response?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonBlock(content);
    if (!parsed || !parsed.name) return null;
    const name = String(parsed.name).trim();
    if (name.toLowerCase() === 'none') return null;
    const match = subagents.find(s => s.name === name);
    if (!match) return null;
    const confidence = Number(parsed.confidence || 0);
    if (Number.isNaN(confidence) || confidence < 0.55) return null;
    return {
      subagent: match,
      score: confidence * 10,
      reason: String(parsed.reason || '').trim(),
    };
  } catch {
    return null;
  }
}

export async function planSubagentDecomposition(message, subagents) {
  if (!message || typeof message !== 'string') return null;
  if (!Array.isArray(subagents) || subagents.length === 0) return null;
  if (!shouldDecompose(message)) return null;
  if (!config.deepseekApiKey) return null;

  const list = subagents
    .map(s => `- ${s.name}: ${s.description || 'No description'}`)
    .join('\n');

  const system = [
    'You are a task decomposition planner for a multi-agent system.',
    'Decide whether the user request should be split into parallel subtasks.',
    'If not, return JSON: {"decompose":false,"reason":"short reason"}.',
    'If yes, return JSON: {"decompose":true,"reason":"short reason","tasks":[{"title":"short name","prompt":"clear instruction","subagent":"subagent_name_or_none"}]}.',
    'Rules:',
    '- Use only subagent names from the provided list, or "none" if the main agent should handle it.',
    '- Keep tasks <= 5 and prompts concise but specific.',
    '- Prefer assigning tasks to subagents that best match the description.',
  ].join('\n');

  const user = [
    'User request:',
    message,
    '',
    'Available subagents:',
    list,
  ].join('\n');

  try {
    const response = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      modelOverride: config.subagentModel || config.mainModel,
    });
    const content = response?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonBlock(content);
    if (!parsed || !parsed.decompose) return null;
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    if (tasks.length === 0) return null;

    const validNames = new Set(subagents.map(s => s.name));
    const normalized = tasks
      .map((task) => {
        if (!task || typeof task !== 'object') return null;
        const title = String(task.title || '').trim();
        const prompt = String(task.prompt || '').trim();
        const subagent = String(task.subagent || '').trim();
        if (!prompt) return null;
        if (subagent && subagent !== 'none' && !validNames.has(subagent)) {
          return null;
        }
        return { title, prompt, subagent: subagent || 'none' };
      })
      .filter(Boolean);

    if (normalized.length === 0) return null;

    return {
      reason: String(parsed.reason || '').trim(),
      tasks: normalized.slice(0, 5),
    };
  } catch {
    return null;
  }
}
