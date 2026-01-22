import path from 'path';
import { mkdir } from 'fs/promises';
import type { Message } from '../types/index.js';
import { config } from '../config/index.js';

function getUtcTimeFilename(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: config.logging.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  const formatter = new Intl.DateTimeFormat('en-CA', options);
  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}`;
}

export class LoggerService {
  private readonly logsDir: string;
  private logsDirInitialized: Promise<void>;

  constructor() {
    this.logsDir = config.logging.logsDir;
    this.logsDirInitialized = this.ensureLogsDir();
  }

  private async ensureLogsDir(): Promise<void> {
    try {
      // Use Node.js fs.mkdir with recursive: true
      // This won't error if the directory already exists
      await mkdir(this.logsDir, { recursive: true });
    } catch (error) {
      // If mkdir fails, log it but don't throw
      console.error('Failed to ensure logs directory:', error);
    }
  }

  async saveConversation(history: Message[], reason: string): Promise<void> {
    // Ensure logs directory is initialized before writing
    await this.logsDirInitialized;
    
    const filename = `${getUtcTimeFilename()}.txt`;
    const filePath = path.join(this.logsDir, filename);
    const content = JSON.stringify(history, null, 2);

    try {
      await Bun.write(filePath, content);
      console.log(`\n[Log saved]: ${filename} (Reason: ${reason})`);
    } catch (error) {
      console.error('Failed to save log:', error);
    }
  }
}
