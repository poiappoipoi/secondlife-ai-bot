/**
 * Rate limiter service - implements sliding window rate limiting
 */
import { config } from '../config/index';
import type { RateLimitStatus } from '../types/index';

/**
 * Implements sliding window rate limiting
 * Tracks request count within a time window and blocks requests when limit is exceeded
 */
export class RateLimiterService {
  private requestCount: number = 0;
  private windowStartTime: number = Date.now();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor() {
    this.maxRequests = config.rateLimit.maxRequestsPerHour;
    this.windowMs = config.rateLimit.windowMs;
  }

  /**
   * Checks if request is allowed and increments counter if allowed
   * Automatically resets window if expired
   * @returns Rate limit status including allowed flag and current count
   */
  check(): RateLimitStatus {
    const now = Date.now();

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

  /**
   * Gets current rate limit status without incrementing counter
   */
  getStatus(): RateLimitStatus {
    return {
      allowed: this.requestCount < this.maxRequests,
      current: this.requestCount,
      max: this.maxRequests,
      resetTime: this.windowStartTime + this.windowMs,
    };
  }
}
