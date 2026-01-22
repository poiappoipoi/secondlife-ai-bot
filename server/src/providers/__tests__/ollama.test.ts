import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { OllamaProvider } from '../ollama';
import type { Message } from '../../types';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    provider = new OllamaProvider('http://localhost:11434/v1', 'test-model', 100, 5000);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should create provider with correct configuration', () => {
      expect(provider.name).toBe('Ollama');
      expect(provider.isConfigured).toBe(true);
    });
  });

  describe('chat', () => {
    it('should send messages to Ollama API', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello from Ollama',
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
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), { status: 200 })
        )
      );

      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];

      const result = await provider.chat(messages);

      expect(result.content).toBe('Hello from Ollama');
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: messages,
            model: 'test-model',
            stream: false,
          }),
        })
      );
    });

    it('should filter out empty system messages', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Response',
            },
          },
        ],
      };

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), { status: 200 })
        )
      );

      const messages: Message[] = [
        { role: 'system', content: '' },
        { role: 'system', content: '   ' },
        { role: 'user', content: 'Hello' },
      ];

      await provider.chat(messages);

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
    });

    it('should keep non-empty system messages', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Response',
            },
          },
        ],
      };

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), { status: 200 })
        )
      );

      const messages: Message[] = [
        { role: 'system', content: 'Valid system prompt' },
        { role: 'user', content: 'Hello' },
      ];

      await provider.chat(messages);

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
    });

    it('should throw error if response format is invalid', async () => {
      const mockResponse = {
        choices: [],
      };

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), { status: 200 })
        )
      );

      await expect(
        provider.chat([{ role: 'user', content: 'Test' }])
      ).rejects.toThrow('Unable to parse Ollama response');
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
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), { status: 200 })
        )
      );

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result.content).toBe('Response without usage');
      expect(result.usage).toBeUndefined();
    });

    it('should not include Authorization header', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Response',
            },
          },
        ],
      };

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), { status: 200 })
        )
      );

      await provider.chat([{ role: 'user', content: 'Test' }]);

      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[1].headers).not.toHaveProperty('Authorization');
    });
  });

  describe('parseResponse', () => {
    it('should parse valid response', () => {
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

    it('should throw error for missing content', () => {
      const data = {
        choices: [{}],
      };

      expect(() => provider['parseResponse'](data)).toThrow(
        'Unable to parse Ollama response'
      );
    });
  });

  describe('fetchWithTimeout', () => {
    it('should timeout after specified duration', async () => {
      global.fetch = mock(() => new Promise(() => {}));

      await expect(
        provider['fetchWithTimeout'](
          'http://localhost:11434/v1/test',
          { method: 'GET' },
          10
        )
      ).rejects.toThrow('Request timeout after 10ms');
    });
  });
});
