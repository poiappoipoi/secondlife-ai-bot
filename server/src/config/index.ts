import dotenv from 'dotenv';
import path from 'path';
import type { ProviderType } from '../types/index.js';

// Load environment files (support both .env and legacy key.env)
// Uses process.cwd() to find config files relative to where server is run
// Load .env first, then key.env (which will override .env values)
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'key.env'), override: true });

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function parseNumber(value: string, defaultValue: number): number {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseProviderType(value: string): ProviderType {
  if (value === 'xai' || value === 'ollama') {
    return value;
  }
  return 'xai';
}

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
    defaultSystemPrompt: string;
  };
  logging: {
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
    defaultSystemPrompt: optionalEnv(
      'DEFAULT_SYSTEM_PROMPT',
      ''
    ),
  },
  logging: {
    timezone: optionalEnv('LOG_TIMEZONE', 'Asia/Taipei'),
    logsDir: path.join(process.cwd(), 'logs'),
  },
};
