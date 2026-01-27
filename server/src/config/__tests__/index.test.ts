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
    expect(config.conversation.maxHistoryMessages).toBeGreaterThan(0);
  });

  it('should have valid logging configuration', () => {
    expect(typeof config.logging.timezone).toBe('string');
    expect(config.logging.logsDir).toContain('logs');
  });

  it('should have valid port configured', () => {
    expect(config.server.port).toBeGreaterThan(0);
    expect(config.server.port).toBeLessThan(65536);
  });

  it('should have valid max tokens configured', () => {
    expect(config.ai.maxTokens).toBeGreaterThan(0);
  });

  it('should have valid rate limit configured', () => {
    expect(config.rateLimit.maxRequestsPerHour).toBeGreaterThan(0);
  });
});
