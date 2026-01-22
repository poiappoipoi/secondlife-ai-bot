import { BaseAIProvider } from './base.js';
import type { Message } from '../types/index.js';
import type { AIProviderResponse } from '../types/index.js';

interface XAIResponseChoice {
  message?: {
    content?: string;
  };
}

interface XAIResponseOutput {
  content?: Array<{
    text?: string;
  }>;
}

interface XAIResponse {
  choices?: XAIResponseChoice[];
  output?: XAIResponseOutput[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class XAIProvider extends BaseAIProvider {
  readonly name = 'X.AI Grok';

  constructor(apiKey: string, model: string, maxTokens: number, timeout: number) {
    super({
      apiKey,
      model,
      maxTokens,
      baseUrl: 'https://api.x.ai/v1',
      timeout,
    });
  }

  async chat(messages: Message[]): Promise<AIProviderResponse> {
    const data = await this.makeRequest<XAIResponse>('/chat/completions', {
      messages,
      model: this.config.model,
      stream: false,
      max_tokens: this.config.maxTokens,
    });

    return this.parseResponse(data);
  }

  protected parseResponse(data: XAIResponse): AIProviderResponse {
    let content: string;

    // Handle both response formats (as in original code)
    if (data.output?.[0]?.content?.[0]?.text) {
      content = data.output[0].content[0].text;
    } else if (data.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content;
    } else {
      throw new Error('Unable to parse AI response format');
    }

    return {
      content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }
}
