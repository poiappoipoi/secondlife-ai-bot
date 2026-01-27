import { describe, it, expect } from 'bun:test';
import { config } from '../index';

describe('Config', () => {
  it('should have valid server configuration', () => {
    expect(config.server.port).toBeGreaterThan(0);
    expect(typeof config.server.nodeEnv).toBe('string');
  });

  it('should have valid AI configuration', () => {
    expect(['xai', 'ollama']).toContain(config.ai.provider);
    expect(config.ai.maxTokens).toBeGreaterThan(0);
    expect(config.ai.timeout).toBeGreaterThan(0);
    expect(typeof config.ai.xai.apiKey).toBe('string');
    expect(typeof config.ai.xai.model).toBe('string');
    expect(typeof config.ai.ollama.baseUrl).toBe('string');
    expect(typeof config.ai.ollama.model).toBe('string');
  });

  it('should have valid rate limit configuration', () => {
    expect(config.rateLimit.maxRequestsPerHour).toBeGreaterThan(0);
    expect(config.rateLimit.windowMs).toBeGreaterThan(0);
  });

  it('should have valid conversation configuration', () => {
    expect(config.conversation.inactivityTimeoutMs).toBeGreaterThan(0);
    expect(typeof config.conversation.defaultSystemPrompt).toBe('string');
  });

  it('should have valid logging configuration', () => {
    expect(typeof config.logging.timezone).toBe('string');
    expect(config.logging.logsDir).toContain('logs');
  });

  it('should have default port of 3002', () => {
    expect(config.server.port).toBe(3002);
  });

  it('should have default max tokens of 300', () => {
    expect(config.ai.maxTokens).toBe(300);
  });

  it('should have default rate limit of 40', () => {
    expect(config.rateLimit.maxRequestsPerHour).toBe(40);
  });
});
