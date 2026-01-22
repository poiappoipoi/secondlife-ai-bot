import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { BaseAIProvider } from '../base';
import type { Message, AIProviderConfig, AIProviderResponse } from '../../types';

class TestProvider extends BaseAIProvider {
  readonly name = 'Test Provider';

  async chat(messages: Message[]): Promise<AIProviderResponse> {
    const data = await this.makeRequest<{ content: string }>('/test', { messages });
    return this.parseResponse(data);
  }

  protected parseResponse(data: { content: string }): AIProviderResponse {
    return { content: data.content };
  }
}

describe('BaseAIProvider', () => {
  let provider: TestProvider;
  let config: AIProviderConfig;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    config = {
      apiKey: 'test-api-key',
      model: 'test-model',
      maxTokens: 100,
      baseUrl: 'https://api.test.com',
      timeout: 5000,
    };
    provider = new TestProvider(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('isConfigured', () => {
    it('should return true when API key is present', () => {
      expect(provider.isConfigured).toBe(true);
    });

    it('should return false when API key is empty', () => {
      const emptyConfig = { ...config, apiKey: '' };
      const emptyProvider = new TestProvider(emptyConfig);
      expect(emptyProvider.isConfigured).toBe(false);
    });
  });

  describe('fetchWithTimeout', () => {
    it('should make successful request', async () => {
      const mockResponse = new Response(JSON.stringify({ content: 'test' }), {
        status: 200,
      });

      global.fetch = mock(() => Promise.resolve(mockResponse));

      const response = await provider['fetchWithTimeout'](
        'https://api.test.com/test',
        { method: 'GET' },
        5000
      );

      expect(response.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should timeout after specified duration', async () => {
      global.fetch = mock(() => new Promise(() => {}));

      await expect(
        provider['fetchWithTimeout'](
          'https://api.test.com/test',
          { method: 'GET' },
          10
        )
      ).rejects.toThrow('Request timeout after 10ms');
    });

    it('should handle network errors', async () => {
      global.fetch = mock(() => Promise.reject(new Error('Network error')));

      await expect(
        provider['fetchWithTimeout'](
          'https://api.test.com/test',
          { method: 'GET' },
          5000
        )
      ).rejects.toThrow('Network error');
    });
  });

  describe('makeRequest', () => {
    it('should make authenticated POST request', async () => {
      const mockResponse = new Response(JSON.stringify({ content: 'response' }), {
        status: 200,
      });

      global.fetch = mock(() => Promise.resolve(mockResponse));

      const result = await provider['makeRequest']<{ content: string }>('/test', {
        test: 'data',
      });

      expect(result).toEqual({ content: 'response' });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should throw error on HTTP error status', async () => {
      const mockResponse = new Response('Unauthorized', {
        status: 401,
        statusText: 'Unauthorized',
      });

      global.fetch = mock(() => Promise.resolve(mockResponse));

      await expect(
        provider['makeRequest']<{ content: string }>('/test', {})
      ).rejects.toThrow('HTTP 401 Unauthorized: Unauthorized');
    });

    it('should handle error response with text', async () => {
      const mockResponse = new Response('Custom error message', {
        status: 400,
        statusText: 'Bad Request',
      });

      global.fetch = mock(() => Promise.resolve(mockResponse));

      await expect(
        provider['makeRequest']<{ content: string }>('/test', {})
      ).rejects.toThrow('HTTP 400 Bad Request: Custom error message');
    });

    it('should use timeout from config', async () => {
      const mockResponse = new Response(JSON.stringify({}), { status: 200 });
      global.fetch = mock(() => Promise.resolve(mockResponse));

      await provider['makeRequest']<{}>('/test', {});

      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
