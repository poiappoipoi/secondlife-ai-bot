import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import type { Message } from '../types/index.js';
import { config } from '../config/index.js';

function getTaiwanTimeFilename(): string {
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

  constructor() {
    this.logsDir = config.logging.logsDir;
    this.ensureLogsDir();
  }

  private ensureLogsDir(): void {
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true });
      console.log('--- Created logs directory ---');
    }
  }

  async saveConversation(history: Message[], reason: string): Promise<void> {
    const filename = `${getTaiwanTimeFilename()}.txt`;
    const filePath = path.join(this.logsDir, filename);
    const content = JSON.stringify(history, null, 2);

    try {
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`\n[Log saved]: ${filename} (Reason: ${reason})`);
    } catch (error) {
      console.error('Failed to save log:', error);
    }
  }
}
