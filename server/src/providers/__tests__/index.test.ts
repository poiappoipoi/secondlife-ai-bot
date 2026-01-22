import { describe, it, expect } from 'bun:test';
import { createProvider, getConfiguredProvider } from '../index';
import { XAIProvider } from '../xai';
import { OllamaProvider } from '../ollama';

describe('Provider Factory', () => {
  describe('createProvider', () => {
    it('should create XAI provider when type is xai', () => {
      const provider = createProvider('xai');
      expect(provider).toBeInstanceOf(XAIProvider);
      expect(provider.name).toBe('X.AI Grok');
    });

    it('should create Ollama provider when type is ollama', () => {
      const provider = createProvider('ollama');
      expect(provider).toBeInstanceOf(OllamaProvider);
      expect(provider.name).toBe('Ollama');
    });

    it('should use config provider type when not specified', () => {
      const provider = createProvider();
      expect(provider).toBeDefined();
      expect(['X.AI Grok', 'Ollama']).toContain(provider.name);
    });

    it('should throw error for unknown provider type', () => {
      expect(() => createProvider('unknown' as any)).toThrow('Unknown provider type: unknown');
    });
  });

  describe('getConfiguredProvider', () => {
    it('should return a provider instance', () => {
      try {
        const provider = getConfiguredProvider();
        expect(provider).toBeDefined();
        expect(['X.AI Grok', 'Ollama']).toContain(provider.name);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('not configured');
      }
    });

    it('should return Ollama provider when configured', () => {
      const provider = createProvider('ollama');
      expect(provider).toBeInstanceOf(OllamaProvider);
      expect(provider.isConfigured).toBe(true);
    });
  });
});
