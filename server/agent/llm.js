import OpenAI from 'openai';
import { config } from '../config.js';
import { getAuthProfileManager } from './authProfiles.js';

// Legacy single-client mode (fallback if no profiles configured)
const legacyClient = config.deepseekApiKey ? new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: 'https://api.deepseek.com/v1',
}) : null;

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Chat completion with auth profile rotation
 */
export async function chatCompletion({ messages, tools, toolChoice = 'auto' }) {
  const profileManager = getAuthProfileManager();

  // If we have multiple profiles, use failover
  if (profileManager.profiles.length > 0) {
    return chatCompletionWithFailover({ messages, tools, toolChoice });
  }

  // Fallback to legacy single-client mode
  if (!legacyClient) {
    throw new Error('No API key configured. Set DEEPSEEK_API_KEY or other provider keys.');
  }

  return chatCompletionLegacy({ messages, tools, toolChoice });
}

/**
 * Chat completion with automatic profile failover
 */
async function chatCompletionWithFailover({ messages, tools, toolChoice }) {
  const profileManager = getAuthProfileManager();

  return profileManager.executeWithFailover(async (client, model) => {
    const params = {
      model,
      messages,
      temperature: 0.2,
      max_tokens: 4096,
    };

    if (tools && tools.length > 0) {
      params.tools = tools;
      params.tool_choice = toolChoice;
    }

    return client.chat.completions.create(params);
  });
}

/**
 * Legacy single-client chat completion (with retries)
 */
async function chatCompletionLegacy({ messages, tools, toolChoice }) {
  const params = {
    model: 'deepseek-chat',
    messages,
    temperature: 0.2,
    max_tokens: 4096,
  };

  if (tools && tools.length > 0) {
    params.tools = tools;
    params.tool_choice = toolChoice;
  }

  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await legacyClient.chat.completions.create(params);
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode || 0;

      if (status === 429 || status >= 500) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[LLM] Rate limited (${status}), retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

/**
 * Get auth profile status (for debugging/monitoring)
 */
export function getAuthStatus() {
  return getAuthProfileManager().getStatus();
}

/**
 * Reset all auth profiles (clear cooldowns)
 */
export function resetAuthProfiles() {
  getAuthProfileManager().resetAll();
}
