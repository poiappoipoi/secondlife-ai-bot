import { describe, it, expect, beforeEach } from 'bun:test';
import { RateLimiterService } from '../rate-limiter';

describe('RateLimiterService', () => {
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    rateLimiter = new RateLimiterService();
  });

  describe('check', () => {
    it('should allow requests within limit', () => {
      const maxRequests = 40;
      for (let i = 0; i < maxRequests; i++) {
        const status = rateLimiter.check();
        expect(status.allowed).toBe(true);
        expect(status.current).toBe(i + 1);
        expect(status.max).toBe(maxRequests);
      }
    });

    it('should block requests exceeding limit', () => {
      const maxRequests = 40;
      const customLimiter = new RateLimiterService();

      for (let i = 0; i < maxRequests; i++) {
        const status = customLimiter.check();
        expect(status.allowed).toBe(true);
        expect(status.max).toBe(maxRequests);
      }

      const blockedStatus = customLimiter.check();
      expect(blockedStatus.allowed).toBe(false);
      expect(blockedStatus.current).toBe(maxRequests);
      expect(blockedStatus.max).toBe(maxRequests);
    });

    it('should increment counter only when allowed', () => {
      const _maxRequests = 2;
      const customLimiter = new RateLimiterService();

      const first = customLimiter.check();
      expect(first.allowed).toBe(true);
      expect(first.current).toBe(1);

      const second = customLimiter.check();
      expect(second.allowed).toBe(true);
      expect(second.current).toBe(2);

      const third = customLimiter.check();
      expect(third.allowed).toBe(false);
      expect(third.current).toBe(2);
    });

    it('should reset window after timeout', async () => {
      const shortWindowMs = 100;
      const customLimiter = new RateLimiterService();

      customLimiter.check();
      customLimiter.check();

      const statusBefore = customLimiter.getStatus();
      expect(statusBefore.current).toBe(2);

      await new Promise((resolve) => setTimeout(resolve, shortWindowMs + 50));

      const statusAfter = customLimiter.check();
      expect(statusAfter.current).toBe(1);
      expect(statusAfter.allowed).toBe(true);
    });

    it('should return reset time', () => {
      const status = rateLimiter.check();
      expect(status.resetTime).toBeGreaterThan(Date.now());
      expect(typeof status.resetTime).toBe('number');
    });
  });

  describe('getStatus', () => {
    it('should return status without incrementing counter', () => {
      const status1 = rateLimiter.getStatus();
      expect(status1.current).toBe(0);

      const status2 = rateLimiter.getStatus();
      expect(status2.current).toBe(0);

      rateLimiter.check();
      const status3 = rateLimiter.getStatus();
      expect(status3.current).toBe(1);
    });

    it('should reflect current state accurately', () => {
      rateLimiter.check();
      rateLimiter.check();

      const status = rateLimiter.getStatus();
      expect(status.current).toBe(2);
      expect(status.max).toBe(40);
      expect(status.allowed).toBe(true);
    });

    it('should show blocked status when limit reached', () => {
      const maxRequests = 40;
      const customLimiter = new RateLimiterService();

      for (let i = 0; i < maxRequests; i++) {
        customLimiter.check();
      }

      const status = customLimiter.getStatus();
      expect(status.allowed).toBe(false);
      expect(status.current).toBe(maxRequests);
    });
  });
});
