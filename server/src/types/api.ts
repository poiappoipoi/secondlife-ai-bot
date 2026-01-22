/**
 * API request/response type definitions
 */

/**
 * Request body for POST /chat endpoint
 */
export interface ChatRequest {
  message: string;
}

/**
 * Request body for POST /SetSystemPrompt endpoint
 */
export interface SetSystemPromptRequest {
  prompt: string;
}

/**
 * Rate limit status information
 */
export interface RateLimitStatus {
  allowed: boolean;
  current: number;
  max: number;
  resetTime: number;
}
