import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { LoggerService } from '../logger';
import type { Message } from '../../types';
import { existsSync, rmSync } from 'fs';
import path from 'path';

describe('LoggerService', () => {
  let logger: LoggerService;
  const testLogsDir = path.join(process.cwd(), 'test-logs');

  beforeEach(() => {
    if (existsSync(testLogsDir)) {
      rmSync(testLogsDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testLogsDir)) {
      rmSync(testLogsDir, { recursive: true, force: true });
    }
  });

  it('should create logs directory if it does not exist', async () => {
    logger = new LoggerService();
    await logger.saveConversation([{ role: 'system', content: 'Test' }], 'Test reason');
    expect(existsSync(path.join(process.cwd(), 'logs'))).toBe(true);
  });

  it('should save conversation to file', async () => {
    logger = new LoggerService();
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    await logger.saveConversation(messages, 'Test save');

    const logsDir = path.join(process.cwd(), 'logs');
    expect(existsSync(logsDir)).toBe(true);

    const files = Bun.readdirSync(logsDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it('should save conversation with correct format', async () => {
    logger = new LoggerService();
    const messages: Message[] = [
      { role: 'system', content: 'Test system' },
      { role: 'user', content: 'Test user' },
    ];

    await logger.saveConversation(messages, 'Format test');

    const logsDir = path.join(process.cwd(), 'logs');
    const files = Bun.readdirSync(logsDir);
    const latestFile = files[files.length - 1] as string;
    const filePath = path.join(logsDir, latestFile);

    const content = await Bun.file(filePath).text();
    const parsed = JSON.parse(content);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].role).toBe('system');
    expect(parsed[1].role).toBe('user');
  });

  it('should handle empty conversation array', async () => {
    logger = new LoggerService();
    await logger.saveConversation([], 'Empty test');
  });

  it('should handle save errors gracefully', async () => {
    logger = new LoggerService();
    const invalidPath = '/invalid/path/that/does/not/exist';

    const originalLogsDir = (logger as any).logsDir;
    (logger as any).logsDir = invalidPath;

    await logger.saveConversation([{ role: 'system', content: 'Test' }], 'Error test');

    (logger as any).logsDir = originalLogsDir;
  });
});
