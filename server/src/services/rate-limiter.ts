import { config } from '../config/index.js';
import type { RateLimitStatus } from '../types/index.js';

export class RateLimiterService {
  private requestCount: number = 0;
  private windowStartTime: number = Date.now();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor() {
    this.maxRequests = config.rateLimit.maxRequestsPerHour;
    this.windowMs = config.rateLimit.windowMs;
  }

  check(): RateLimitStatus {
    const now = Date.now();

    // Reset window if expired
    if (now - this.windowStartTime > this.windowMs) {
      this.requestCount = 0;
      this.windowStartTime = now;
      console.log('--- Rate limit counter reset (new window) ---');
    }

    const allowed = this.requestCount < this.maxRequests;

    if (allowed) {
      this.requestCount++;
    }

    return {
      allowed,
      current: this.requestCount,
      max: this.maxRequests,
      resetTime: this.windowStartTime + this.windowMs,
    };
  }

  getStatus(): RateLimitStatus {
    return {
      allowed: this.requestCount < this.maxRequests,
      current: this.requestCount,
      max: this.maxRequests,
      resetTime: this.windowStartTime + this.windowMs,
    };
  }
}
