/**
 * Auth Profile Rotation - API key failover on rate limits
 *
 * Inspired by OpenClaw's auth-profiles system
 *
 * Features:
 * - Configure multiple API keys/providers
 * - Automatic failover on rate limits (429) or auth errors (401/403)
 * - Cool-down periods for failed profiles
 * - Usage tracking per profile
 * - Support for multiple providers (DeepSeek, OpenAI, etc.)
 */

import OpenAI from 'openai';

// Profile states
const PROFILE_STATE = {
  ACTIVE: 'active',
  COOLDOWN: 'cooldown',
  DISABLED: 'disabled',
};

// Default cool-down period after failure (5 minutes)
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

// Provider configurations
const PROVIDER_CONFIGS = {
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-70b-versatile',
  },
};

class AuthProfile {
  constructor(config) {
    this.id = config.id || `profile-${Date.now()}`;
    this.name = config.name || this.id;
    this.provider = config.provider || 'deepseek';
    this.apiKey = config.apiKey;
    this.model = config.model || PROVIDER_CONFIGS[this.provider]?.defaultModel;
    this.baseURL = config.baseURL || PROVIDER_CONFIGS[this.provider]?.baseURL;
    this.priority = config.priority || 0; // Lower = higher priority

    // State tracking
    this.state = PROFILE_STATE.ACTIVE;
    this.cooldownUntil = null;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastUsed = null;
    this.lastError = null;

    // Create OpenAI client for this profile
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });
  }

  isAvailable() {
    if (this.state === PROFILE_STATE.DISABLED) return false;
    if (this.state === PROFILE_STATE.COOLDOWN) {
      if (Date.now() >= this.cooldownUntil) {
        this.state = PROFILE_STATE.ACTIVE;
        this.cooldownUntil = null;
        return true;
      }
      return false;
    }
    return true;
  }

  markSuccess() {
    this.successCount++;
    this.lastUsed = Date.now();
    this.failureCount = 0; // Reset failure count on success
  }

  markFailure(error, cooldownMs = DEFAULT_COOLDOWN_MS) {
    this.failureCount++;
    this.lastError = error;
    this.lastUsed = Date.now();

    // Progressive cooldown based on failure count
    const multiplier = Math.min(this.failureCount, 5);
    const actualCooldown = cooldownMs * multiplier;

    this.state = PROFILE_STATE.COOLDOWN;
    this.cooldownUntil = Date.now() + actualCooldown;

    console.log(`[AuthProfile] ${this.name} entered cooldown for ${actualCooldown / 1000}s (failures: ${this.failureCount})`);
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      provider: this.provider,
      model: this.model,
      state: this.state,
      isAvailable: this.isAvailable(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      cooldownRemaining: this.cooldownUntil ? Math.max(0, this.cooldownUntil - Date.now()) : 0,
    };
  }
}

export class AuthProfileManager {
  constructor() {
    this.profiles = [];
    this.currentProfileIndex = 0;
  }

  /**
   * Add a profile from config
   */
  addProfile(config) {
    const profile = new AuthProfile(config);
    this.profiles.push(profile);
    // Sort by priority (lower = higher priority)
    this.profiles.sort((a, b) => a.priority - b.priority);
    console.log(`[AuthProfileManager] Added profile: ${profile.name} (${profile.provider})`);
    return profile;
  }

  /**
   * Load profiles from environment variables
   * Supports: DEEPSEEK_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, etc.
   * Also supports numbered keys: DEEPSEEK_API_KEY_2, DEEPSEEK_API_KEY_3
   */
  loadFromEnv() {
    const envMappings = [
      { envKey: 'DEEPSEEK_API_KEY', provider: 'deepseek', priority: 0 },
      { envKey: 'DEEPSEEK_API_KEY_2', provider: 'deepseek', priority: 1 },
      { envKey: 'DEEPSEEK_API_KEY_3', provider: 'deepseek', priority: 2 },
      { envKey: 'OPENAI_API_KEY', provider: 'openai', priority: 10 },
      { envKey: 'OPENAI_API_KEY_2', provider: 'openai', priority: 11 },
      { envKey: 'OPENROUTER_API_KEY', provider: 'openrouter', priority: 20 },
      { envKey: 'GROQ_API_KEY', provider: 'groq', priority: 30 },
    ];

    for (const mapping of envMappings) {
      const apiKey = process.env[mapping.envKey];
      if (apiKey) {
        this.addProfile({
          id: mapping.envKey.toLowerCase().replace(/_/g, '-'),
          name: `${mapping.provider} (${mapping.envKey})`,
          provider: mapping.provider,
          apiKey,
          priority: mapping.priority,
        });
      }
    }

    if (this.profiles.length === 0) {
      console.warn('[AuthProfileManager] No API keys found in environment!');
    } else {
      console.log(`[AuthProfileManager] Loaded ${this.profiles.length} profile(s)`);
    }
  }

  /**
   * Get the next available profile
   */
  getNextProfile() {
    // First, try to find an available profile in priority order
    for (const profile of this.profiles) {
      if (profile.isAvailable()) {
        return profile;
      }
    }

    // No available profiles - find the one with shortest cooldown remaining
    let bestProfile = null;
    let shortestCooldown = Infinity;

    for (const profile of this.profiles) {
      if (profile.state === PROFILE_STATE.DISABLED) continue;
      const remaining = profile.cooldownUntil ? profile.cooldownUntil - Date.now() : 0;
      if (remaining < shortestCooldown) {
        shortestCooldown = remaining;
        bestProfile = profile;
      }
    }

    return bestProfile;
  }

  /**
   * Execute a request with automatic failover
   */
  async executeWithFailover(requestFn) {
    const maxAttempts = this.profiles.length * 2; // Allow retrying each profile twice
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const profile = this.getNextProfile();

      if (!profile) {
        throw new Error('No available auth profiles');
      }

      // Wait if profile is in cooldown
      if (!profile.isAvailable() && profile.cooldownUntil) {
        const waitTime = profile.cooldownUntil - Date.now();
        if (waitTime > 0 && waitTime < 30000) { // Wait up to 30s
          console.log(`[AuthProfileManager] Waiting ${waitTime}ms for ${profile.name} cooldown`);
          await new Promise(r => setTimeout(r, waitTime));
        }
      }

      try {
        console.log(`[AuthProfileManager] Using profile: ${profile.name} (attempt ${attempt + 1})`);
        const result = await requestFn(profile.client, profile.model);
        profile.markSuccess();
        return result;
      } catch (err) {
        lastError = err;
        const status = err.status || err.statusCode || 0;

        // Check if this is a failover-worthy error
        if (isFailoverError(err)) {
          console.log(`[AuthProfileManager] Profile ${profile.name} failed (${status}): ${err.message}`);
          profile.markFailure(err);
          continue; // Try next profile
        }

        // Non-failover error - throw immediately
        throw err;
      }
    }

    throw lastError || new Error('All auth profiles exhausted');
  }

  /**
   * Get status of all profiles
   */
  getStatus() {
    return {
      totalProfiles: this.profiles.length,
      availableProfiles: this.profiles.filter(p => p.isAvailable()).length,
      profiles: this.profiles.map(p => p.getStatus()),
    };
  }

  /**
   * Reset all profiles (clear cooldowns)
   */
  resetAll() {
    for (const profile of this.profiles) {
      profile.state = PROFILE_STATE.ACTIVE;
      profile.cooldownUntil = null;
      profile.failureCount = 0;
    }
  }
}

/**
 * Check if error should trigger failover
 */
function isFailoverError(err) {
  const status = err.status || err.statusCode || 0;

  // Rate limit
  if (status === 429) return true;

  // Auth errors
  if (status === 401 || status === 403) return true;

  // Server errors (might be provider-specific)
  if (status >= 500 && status < 600) return true;

  // Network errors
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return true;

  // Quota exceeded (OpenAI specific)
  if (err.code === 'insufficient_quota') return true;

  return false;
}

// Singleton instance
let managerInstance = null;

export function getAuthProfileManager() {
  if (!managerInstance) {
    managerInstance = new AuthProfileManager();
    managerInstance.loadFromEnv();
  }
  return managerInstance;
}
