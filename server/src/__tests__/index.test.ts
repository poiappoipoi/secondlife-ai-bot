import { describe, it, expect } from 'bun:test';
import { generateBanner, type BannerOptions } from '../index';

describe('generateBanner', () => {
  const baseOptions: BannerOptions = {
    title: '🤖 AI Bot Server',
    port: 3000,
    provider: 'xai',
    model: 'grok-2',
    rateLimit: 40,
  };

  describe('basic structure', () => {
    it('should return an array of strings', () => {
      const banner = generateBanner(baseOptions);
      expect(Array.isArray(banner)).toBe(true);
      expect(banner.length).toBeGreaterThan(0);
      banner.forEach((line) => {
        expect(typeof line).toBe('string');
      });
    });

    it('should start and end with empty lines', () => {
      const banner = generateBanner(baseOptions);
      expect(banner[0]).toBe('');
      expect(banner[banner.length - 1]).toBe('');
    });

    it('should have top and bottom borders', () => {
      const banner = generateBanner(baseOptions);
      const topBorder = banner[1];
      const bottomBorder = banner[banner.length - 2];

      expect(topBorder).toContain('╔');
      expect(topBorder).toContain('╗');
      expect(bottomBorder).toContain('╚');
      expect(bottomBorder).toContain('╝');
    });

    it('should have a divider after the title', () => {
      const banner = generateBanner(baseOptions);
      const dividerIndex = banner.findIndex((line) => line.includes('╠') && line.includes('╣'));
      expect(dividerIndex).toBeGreaterThan(0);
      expect(dividerIndex).toBeLessThan(banner.length - 2);
    });

    it('should contain all required information lines', () => {
      const banner = generateBanner(baseOptions);
      const bannerText = banner.join('\n');

      expect(bannerText).toContain('Status:');
      expect(bannerText).toContain('Running');
      expect(bannerText).toContain('Port:');
      expect(bannerText).toContain('3000');
      expect(bannerText).toContain('Provider:');
      expect(bannerText).toContain('xai');
      expect(bannerText).toContain('Model:');
      expect(bannerText).toContain('grok-2');
      expect(bannerText).toContain('Rate Limit:');
      expect(bannerText).toContain('40');
    });
  });

  describe('title handling', () => {
    it('should include the title in the banner', () => {
      const banner = generateBanner(baseOptions);
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('🤖 AI Bot Server');
    });

    it('should handle different titles', () => {
      const banner = generateBanner({
        ...baseOptions,
        title: 'Test Server',
      });
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('Test Server');
    });
  });

  describe('configEnv handling', () => {
    it('should include config line when configEnv is provided', () => {
      const banner = generateBanner({
        ...baseOptions,
        configEnv: 'xai',
      });
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('Config:');
      expect(bannerText).toContain('AI_PROVIDER=xai');
    });

    it('should not include config line when configEnv is undefined', () => {
      const banner = generateBanner(baseOptions);
      const bannerText = banner.join('\n');
      expect(bannerText).not.toContain('Config:');
      expect(bannerText).not.toContain('AI_PROVIDER');
    });
  });

  describe('different providers and models', () => {
    it('should handle ollama provider', () => {
      const banner = generateBanner({
        ...baseOptions,
        provider: 'ollama',
        model: 'cat-maid',
      });
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('ollama');
      expect(bannerText).toContain('cat-maid');
    });

    it('should handle different port numbers', () => {
      const banner = generateBanner({
        ...baseOptions,
        port: 8080,
      });
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('8080');
    });

    it('should handle different rate limits', () => {
      const banner = generateBanner({
        ...baseOptions,
        rateLimit: 100,
      });
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('100');
    });
  });

  describe('line width consistency', () => {
    it('should have consistent line widths (excluding ANSI codes)', () => {
      const banner = generateBanner(baseOptions);
      const ansiEscape = '\x1b';
      const ansiRegex = new RegExp(`${ansiEscape}\\[[0-9;]*m`, 'g');

      const visibleLengths = banner
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const withoutAnsi = line.replace(ansiRegex, '');
          return withoutAnsi.length;
        });

      if (visibleLengths.length > 0) {
        const firstLength = visibleLengths[0];
        visibleLengths.forEach((length) => {
          expect(length).toBe(firstLength);
        });
      }
    });
  });

  describe('ANSI color codes', () => {
    it('should include ANSI color codes in output', () => {
      const banner = generateBanner(baseOptions);
      const bannerText = banner.join('\n');

      expect(bannerText).toContain('\x1b[0m');
      expect(bannerText).toContain('\x1b[1m');
      expect(bannerText).toContain('\x1b[32m');
    });

    it('should use green for borders', () => {
      const banner = generateBanner(baseOptions);
      const topBorder = banner[1];
      expect(topBorder).toContain('\x1b[32m');
    });

    it('should use cyan for title', () => {
      const banner = generateBanner(baseOptions);
      const titleLine = banner.find((line) => line.includes('AI Bot Server'));
      expect(titleLine).toBeDefined();
      if (titleLine) {
        expect(titleLine).toContain('\x1b[36m');
      }
    });
  });

  describe('emoji handling', () => {
    it('should properly handle emoji in title', () => {
      const banner = generateBanner({
        ...baseOptions,
        title: '🤖 AI Bot Server',
      });
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('🤖');
    });

    it('should handle checkmark emoji in status', () => {
      const banner = generateBanner(baseOptions);
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('✓');
    });
  });

  describe('edge cases', () => {
    it('should handle very long model names', () => {
      const banner = generateBanner({
        ...baseOptions,
        model: 'very-long-model-name-that-exceeds-normal-length',
      });
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('very-long-model-name-that-exceeds-normal-length');
    });

    it('should handle very long provider names', () => {
      const banner = generateBanner({
        ...baseOptions,
        provider: 'very-long-provider-name',
      });
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('very-long-provider-name');
    });

    it('should handle zero rate limit', () => {
      const banner = generateBanner({
        ...baseOptions,
        rateLimit: 0,
      });
      const bannerText = banner.join('\n');
      expect(bannerText).toContain('Rate Limit:');
      expect(bannerText).toContain('0');
    });
  });
});
