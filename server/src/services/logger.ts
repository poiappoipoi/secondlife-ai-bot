/**
 * Logger service - saves conversation history to log files with timezone support
 */
import path from 'path';
import { mkdir } from 'fs/promises';
import type { Message } from '../types/index';
import { config } from '../config/index';

/**
 * Generates filename based on current time in configured timezone
 */
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

/**
 * Handles saving conversation logs to disk with timezone-aware filenames
 */
export class LoggerService {
  private readonly logsDir: string;
  private logsDirInitialized: Promise<void>;

  constructor() {
    this.logsDir = config.logging.logsDir;
    this.logsDirInitialized = this.ensureLogsDir();
  }

  /**
   * Ensures logs directory exists (creates if missing)
   */
  private async ensureLogsDir(): Promise<void> {
    try {
      await mkdir(this.logsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to ensure logs directory:', error);
    }
  }

  /**
   * Saves conversation history to log file
   * @param history - Message array to save
   * @param reason - Reason for saving (for logging)
   */
  async saveConversation(history: Message[], reason: string): Promise<void> {
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
