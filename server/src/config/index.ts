/**
 * Application configuration - loads environment variables and provides type-safe config
 * Supports .env and key.env files (key.env overrides .env)
 */
import path from 'path';
import { readFileSync, existsSync } from 'fs';
import type { ProviderType } from '../types/index';

/**
 * Manually loads key.env file to override .env values
 * Bun automatically loads .env, but we need explicit loading for key.env override behavior
 */
function loadKeyEnvSync(): void {
  try {
    const keyEnvPath = path.join(process.cwd(), 'key.env');
    if (existsSync(keyEnvPath)) {
      const content = readFileSync(keyEnvPath, 'utf-8');
      // Parse simple KEY=VALUE format
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          const value = trimmed.substring(equalIndex + 1).trim();
          // Remove quotes if present
          const unquotedValue = value.replace(/^["']|["']$/g, '');
          process.env[key] = unquotedValue;
        }
      }
    }
  } catch {
    // key.env is optional, ignore errors
  }
}

// Load key.env at module initialization
loadKeyEnvSync();

/**
 * Gets environment variable or returns default value
 */
function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

/**
 * Parses string to number, returns default if invalid
 */
function parseNumber(value: string, defaultValue: number): number {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parses boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Validates and parses provider type from environment variable
 */
function parseProviderType(value: string): ProviderType {
  if (value === 'xai' || value === 'ollama') {
    return value;
  }
  return 'xai';
}

/**
 * Type-safe application configuration structure
 */
export interface AppConfig {
  server: {
    port: number;
    nodeEnv: string;
  };
  ai: {
    provider: ProviderType;
    maxTokens: number;
    timeout: number;
    xai: {
      apiKey: string;
      model: string;
    };
    ollama: {
      baseUrl: string;
      model: string;
    };
  };
  rateLimit: {
    maxRequestsPerHour: number;
    windowMs: number;
  };
  conversation: {
    inactivityTimeoutMs: number;
    maxHistoryMessages: number;
    contextBudget: {
      enabled: boolean;
      maxContextTokens: number;
      systemPromptMaxPercent: number;
    };
  };
  persona: {
    personaFile: string;
    personasDir: string;
  };
  logging: {
    logLevel: string;
    timezone: string;
    logsDir: string;
  };
}

export const config: AppConfig = {
  server: {
    port: parseNumber(optionalEnv('PORT', '3000'), 3000),
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
  },
  ai: {
    provider: parseProviderType(optionalEnv('AI_PROVIDER', 'xai')),
    maxTokens: parseNumber(optionalEnv('AI_MAX_TOKENS', '300'), 300),
    timeout: parseNumber(optionalEnv('AI_TIMEOUT_MS', '30000'), 30000),
    xai: {
      apiKey: optionalEnv('XAI_API_KEY', ''),
      model: optionalEnv('XAI_MODEL', 'grok-4-1-fast-non-reasoning'),
    },
    ollama: {
      baseUrl: optionalEnv('OLLAMA_BASE_URL', 'http://localhost:11434/v1'),
      model: optionalEnv('OLLAMA_MODEL', 'cat-maid'),
    },
  },
  rateLimit: {
    maxRequestsPerHour: parseNumber(optionalEnv('RATE_LIMIT_MAX', '40'), 40),
    windowMs: parseNumber(optionalEnv('RATE_LIMIT_WINDOW_MS', '3600000'), 3600000),
  },
  conversation: {
    inactivityTimeoutMs: parseNumber(optionalEnv('INACTIVITY_TIMEOUT_MS', '3600000'), 3600000),
    maxHistoryMessages: parseNumber(optionalEnv('CONVERSATION_MAX_HISTORY_MESSAGES', '50'), 50),
    contextBudget: {
      enabled: parseBoolean(process.env.CONTEXT_BUDGET_ENABLED, false),
      maxContextTokens: parseNumber(optionalEnv('CONTEXT_MAX_TOKENS', '8000'), 8000),
      systemPromptMaxPercent: parseNumber(
        optionalEnv('CONTEXT_SYSTEM_PROMPT_MAX_PERCENT', '80'),
        80
      ),
    },
  },
  persona: {
    personaFile: optionalEnv('PERSONA_FILE', 'cat-maid.md'),
    personasDir: optionalEnv('PERSONAS_DIR', path.join(process.cwd(), 'personas')),
  },
  logging: {
    logLevel: optionalEnv('LOG_LEVEL', 'INFO'),
    timezone: optionalEnv('LOG_TIMEZONE', 'UTC'),
    logsDir: path.join(process.cwd(), 'logs'),
  },
};
