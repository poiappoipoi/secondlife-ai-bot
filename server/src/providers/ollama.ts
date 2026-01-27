/**
 * Ollama provider implementation for local LLM
 */
import type { Message } from '../types/index';
import type { AIProvider, AIProviderConfig, AIProviderResponse } from '../types/index';
import { LoggerService } from '../services/logger';

/**
 * Ollama OpenAI-compatible API response format
 */
interface OllamaResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Ollama provider - implements chat completion using local Ollama instance
 * Uses OpenAI-compatible API endpoint
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'Ollama';
  protected readonly config: AIProviderConfig;
  protected readonly logger: LoggerService;

  constructor(
    baseUrl: string,
    model: string,
    maxTokens: number,
    timeout: number,
    logger: LoggerService
  ) {
    this.config = {
      apiKey: 'ollama',
      model,
      maxTokens,
      baseUrl,
      timeout,
    };
    this.logger = logger;
    this.logger.info(`Ollama provider initialized: model=${model}, baseUrl=${baseUrl}`);
  }

  /**
   * Ollama doesn't require API key authentication
   */
  get isConfigured(): boolean {
    return true;
  }

  /**
   * Performs fetch request with timeout using AbortController
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Sends chat messages to Ollama API
   * Filters out empty system messages to allow modelfile's SYSTEM directive to work
   */
  async chat(messages: Message[]): Promise<AIProviderResponse> {
    const filteredMessages = messages.filter((msg) => {
      if (msg.role !== 'system') {
        return true;
      }
      return msg.content.trim().length > 0;
    });

    this.logger.debug(`Sending request to Ollama (model: ${this.config.model})`, {
      originalMessageCount: messages.length,
      filteredMessageCount: filteredMessages.length,
    });
    this.logger.debug('Messages sent to LLM', filteredMessages);

    const url = `${this.config.baseUrl}/chat/completions`;
    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: filteredMessages,
          model: this.config.model,
          stream: false,
        }),
      },
      this.config.timeout
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
    }

    const data = (await response.json()) as OllamaResponse;
    const result = this.parseResponse(data);
    this.logger.debug('Response received from Ollama', {
      contentLength: result.content.length,
      usage: result.usage,
    });

    return result;
  }

  /**
   * Streams chat messages from Ollama API
   * Filters out empty system messages to allow modelfile's SYSTEM directive to work
   */
  async *chatStream(messages: Message[]): AsyncIterable<string> {
    const filteredMessages = messages.filter((msg) => {
      if (msg.role !== 'system') {
        return true;
      }
      return msg.content.trim().length > 0;
    });

    this.logger.debug(`Sending streaming request to Ollama (model: ${this.config.model})`, {
      originalMessageCount: messages.length,
      filteredMessageCount: filteredMessages.length,
    });
    this.logger.debug('Messages sent to LLM (streaming)', filteredMessages);

    const url = `${this.config.baseUrl}/chat/completions`;
    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: filteredMessages,
          model: this.config.model,
          stream: true,
        }),
      },
      this.config.timeout
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    this.logger.debug('Streaming response started from Ollama');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    try {
      let lastChunkAt = Date.now();

      while (true) {
        // Manual timeout: if we haven't received a chunk in 10 seconds, abort
        const timeSinceLastChunk = Date.now() - lastChunkAt;
        if (timeSinceLastChunk > 10000) {
          reader.releaseLock();
          throw new Error(`No chunk received for ${timeSinceLastChunk}ms - stream appears hung`);
        }

        this.logger.debug(`Attempting to read stream chunk #${chunkCount + 1}...`);

        // Timeout wrapper with manual cleanup
        let timeoutId: NodeJS.Timeout | null = null;
        let result;

        try {
          result = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(new Error(`Stream chunk #${chunkCount} read timeout after 10000ms`));
              }, 10000);
            }),
          ]);
        } catch (timeoutError) {
          this.logger.error(`Stream stalled on chunk #${chunkCount}`, timeoutError);
          if (timeoutId) clearTimeout(timeoutId);
          reader.releaseLock();
          throw timeoutError;
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }

        if (result.done || !result.value) {
          this.logger.debug(`Stream ended after ${chunkCount} chunks`);
          break;
        }

        chunkCount++;
        const nowTime = Date.now();
        this.logger.debug(`Received chunk #${chunkCount} (${(result.value as Uint8Array).length} bytes)`);
        lastChunkAt = nowTime;

        const value = result.value as Uint8Array;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                return;
              }
              try {
                const parsed: unknown = JSON.parse(data);
                if (typeof parsed === 'object' && parsed !== null && 'choices' in parsed) {
                  const choices = (parsed as { choices: unknown }).choices;
                  if (
                    Array.isArray(choices) &&
                    choices[0] &&
                    typeof choices[0] === 'object' &&
                    choices[0] !== null &&
                    'delta' in choices[0]
                  ) {
                    const delta = (choices[0] as { delta: unknown }).delta;
                    if (
                      delta &&
                      typeof delta === 'object' &&
                      delta !== null &&
                      'content' in delta
                    ) {
                      yield String((delta as { content: unknown }).content);
                    }
                  }
                }
              } catch {
                // Ignore invalid JSON in stream
              }
            } else {
              // Ollama may also send JSON directly without "data: " prefix
              try {
                const parsed: unknown = JSON.parse(line);
                if (typeof parsed === 'object' && parsed !== null && 'choices' in parsed) {
                  const choices = (parsed as { choices: unknown }).choices;
                  if (
                    Array.isArray(choices) &&
                    choices[0] &&
                    typeof choices[0] === 'object' &&
                    choices[0] !== null
                  ) {
                    const choice = choices[0] as Record<string, unknown>;
                    const delta = choice.delta;
                    if (
                      delta &&
                      typeof delta === 'object' &&
                      delta !== null &&
                      'content' in delta
                    ) {
                      yield String((delta as { content: unknown }).content);
                    }
                    if (choice.finish_reason === 'stop') {
                      return;
                    }
                  }
                }
              } catch {
                // Ignore invalid JSON
              }
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        if (buffer.startsWith('data: ')) {
          const data = buffer.slice(6).trim();
          if (data !== '[DONE]') {
            try {
              const parsed: unknown = JSON.parse(data);
              if (typeof parsed === 'object' && parsed !== null && 'choices' in parsed) {
                const choices = (parsed as { choices: unknown }).choices;
                if (
                  Array.isArray(choices) &&
                  choices[0] &&
                  typeof choices[0] === 'object' &&
                  choices[0] !== null &&
                  'delta' in choices[0]
                ) {
                  const delta = (choices[0] as { delta: unknown }).delta;
                  if (delta && typeof delta === 'object' && delta !== null && 'content' in delta) {
                    yield String((delta as { content: unknown }).content);
                  }
                }
              }
            } catch {
              // Ignore invalid JSON
            }
          }
        } else {
          try {
            const parsed: unknown = JSON.parse(buffer);
            if (typeof parsed === 'object' && parsed !== null && 'choices' in parsed) {
              const choices = (parsed as { choices: unknown }).choices;
              if (
                Array.isArray(choices) &&
                choices[0] &&
                typeof choices[0] === 'object' &&
                choices[0] !== null &&
                'delta' in choices[0]
              ) {
                const delta = (choices[0] as { delta: unknown }).delta;
                if (delta && typeof delta === 'object' && delta !== null && 'content' in delta) {
                  yield String((delta as { content: unknown }).content);
                }
              }
            }
          } catch {
            // Ignore invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
      this.logger.debug('Streaming response completed from Ollama');
    }
  }

  /**
   * Parses Ollama response into standard format
   */
  protected parseResponse(data: OllamaResponse): AIProviderResponse {
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Unable to parse Ollama response');
    }

    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }
}
