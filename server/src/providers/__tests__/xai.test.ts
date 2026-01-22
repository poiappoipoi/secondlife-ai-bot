import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { XAIProvider } from '../xai';
import type { Message } from '../../types';

describe('XAIProvider', () => {
  let provider: XAIProvider;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    provider = new XAIProvider('test-api-key', 'grok-test', 100, 5000);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should create provider with correct configuration', () => {
      expect(provider.name).toBe('X.AI Grok');
      expect(provider.isConfigured).toBe(true);
    });

    it('should not be configured without API key', () => {
      const emptyProvider = new XAIProvider('', 'grok-test', 100, 5000);
      expect(emptyProvider.isConfigured).toBe(false);
    });
  });

  describe('chat', () => {
    it('should send messages to X.AI API', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello from Grok',
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      );

      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];

      const result = await provider.chat(messages);

      expect(result.content).toBe('Hello from Grok');
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.x.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            messages,
            model: 'grok-test',
            stream: false,
            max_tokens: 100,
          }),
        })
      );
    });

    it('should handle output format response', async () => {
      const mockResponse = {
        output: [
          {
            content: [
              {
                text: 'Response from output format',
              },
            ],
          },
        ],
      };

      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      );

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result.content).toBe('Response from output format');
    });

    it('should throw error if response format is invalid', async () => {
      const mockResponse = { invalid: 'format' };

      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      );

      await expect(provider.chat([{ role: 'user', content: 'Test' }])).rejects.toThrow(
        'Unable to parse AI response format'
      );
    });

    it('should handle response without usage data', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Response without usage',
            },
          },
        ],
      };

      global.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
      );

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result.content).toBe('Response without usage');
      expect(result.usage).toBeUndefined();
    });
  });

  describe('parseResponse', () => {
    it('should parse choices format', () => {
      const data = {
        choices: [
          {
            message: {
              content: 'Parsed content',
            },
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        },
      };

      const result = provider['parseResponse'](data);
      expect(result.content).toBe('Parsed content');
      expect(result.usage?.totalTokens).toBe(3);
    });

    it('should parse output format', () => {
      const data = {
        output: [
          {
            content: [
              {
                text: 'Output format content',
              },
            ],
          },
        ],
      };

      const result = provider['parseResponse'](data);
      expect(result.content).toBe('Output format content');
    });

    it('should prefer output format over choices format', () => {
      const data = {
        output: [
          {
            content: [
              {
                text: 'Output text',
              },
            ],
          },
        ],
        choices: [
          {
            message: {
              content: 'Choices text',
            },
          },
        ],
      };

      const result = provider['parseResponse'](data);
      expect(result.content).toBe('Output text');
    });
  });
});
