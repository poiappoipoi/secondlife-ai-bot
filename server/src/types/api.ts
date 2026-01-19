export interface ChatRequest {
  message: string;
}

export interface SetSystemPromptRequest {
  prompt: string;
}

export interface RateLimitStatus {
  allowed: boolean;
  current: number;
  max: number;
  resetTime: number;
}
