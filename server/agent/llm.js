import OpenAI from 'openai';
import { config } from '../config.js';
import { getAuthProfileManager } from './authProfiles.js';

// Legacy single-client mode (fallback if no profiles configured)
const legacyClient = (() => {
  // Prefer Moonshot for OpenAI-compatible fallback.
  if (config.moonshotApiKey) {
    return new OpenAI({
      apiKey: config.moonshotApiKey,
      baseURL: config.moonshotBaseUrl,
    });
  }

  if (config.deepseekApiKey) {
    return new OpenAI({
      apiKey: config.deepseekApiKey,
      baseURL: 'https://api.deepseek.com/v1',
    });
  }

  return null;
})();

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function resolveTemperature({ model, provider }) {
  // Moonshot kimi-k2.5 currently accepts temperature=1 only.
  if (provider === 'moonshot') return 1;
  if (typeof model === 'string' && model.toLowerCase().includes('kimi-k2.5')) return 1;
  return 0.2;
}

/**
 * Chat completion with auth profile rotation
 */
export async function chatCompletion({ messages, tools, toolChoice = 'auto', modelOverride = null }) {
  const profileManager = getAuthProfileManager();

  // If we have multiple profiles, use failover
  if (profileManager.profiles.length > 0) {
    return chatCompletionWithFailover({ messages, tools, toolChoice, modelOverride });
  }

  // Fallback to legacy single-client mode
  if (!legacyClient) {
    throw new Error('No API key configured. Set MOONSHOT_API_KEY, DEEPSEEK_API_KEY, or another provider key.');
  }

  return chatCompletionLegacy({ messages, tools, toolChoice, modelOverride });
}

/**
 * Chat completion with automatic profile failover
 */
async function chatCompletionWithFailover({ messages, tools, toolChoice, modelOverride }) {
  const profileManager = getAuthProfileManager();

  return profileManager.executeWithFailover(async (client, model, profile) => {
    const selectedModel = modelOverride || model;
    const params = {
      model: selectedModel,
      messages,
      temperature: resolveTemperature({ model: selectedModel, provider: profile?.provider }),
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
async function chatCompletionLegacy({ messages, tools, toolChoice, modelOverride }) {
  const selectedModel = modelOverride || config.mainModel || 'kimi-k2.5';
  const selectedProvider = config.moonshotApiKey ? 'moonshot' : 'deepseek';
  const params = {
    model: selectedModel,
    messages,
    temperature: resolveTemperature({ model: selectedModel, provider: selectedProvider }),
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
