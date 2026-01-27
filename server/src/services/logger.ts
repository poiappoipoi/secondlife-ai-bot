/**
 * Logger service - saves conversation history to log files with timezone support
 * Provides structured logging with configurable log levels
 */
import path from 'path';
import { mkdir } from 'fs/promises';
import type { Message } from '../types/index';
import { config } from '../config/index';

/**
 * Log level severity ordering
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Parses log level string to enum value
 */
function parseLogLevel(level: string): LogLevel {
  const normalized = level.toUpperCase();
  switch (normalized) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    default:
      return LogLevel.INFO;
  }
}

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
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}`;
}

/**
 * Formats timestamp in configured timezone
 */
function getTimestamp(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: config.logging.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  const formatter = new Intl.DateTimeFormat('en-CA', options);
  return formatter.format(now).replace(',', '');
}

/**
 * Handles saving conversation logs to disk with timezone-aware filenames
 * Provides structured logging with configurable log levels
 */
export class LoggerService {
  private readonly logsDir: string;
  private readonly logLevel: LogLevel;
  private logsDirInitialized: Promise<void>;

  constructor() {
    this.logsDir = config.logging.logsDir;
    this.logLevel = parseLogLevel(config.logging.logLevel);
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
   * Formats log message with timestamp and level
   */
  private formatLogMessage(level: string, message: string, data?: unknown): string {
    const timestamp = getTimestamp();
    const baseMsg = `[${timestamp}] [${level}] ${message}`;
    if (data !== undefined) {
      return `${baseMsg}\n${JSON.stringify(data, null, 2)}`;
    }
    return baseMsg;
  }

  /**
   * Logs debug-level message (most verbose)
   */
  debug(message: string, data?: unknown): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.log(this.formatLogMessage('DEBUG', message, data));
    }
  }

  /**
   * Logs info-level message (general information)
   */
  info(message: string, data?: unknown): void {
    if (this.logLevel <= LogLevel.INFO) {
      console.log(this.formatLogMessage('INFO', message, data));
    }
  }

  /**
   * Logs warning-level message
   */
  warn(message: string, data?: unknown): void {
    if (this.logLevel <= LogLevel.WARN) {
      console.warn(this.formatLogMessage('WARN', message, data));
    }
  }

  /**
   * Logs error-level message
   */
  error(message: string, error?: unknown): void {
    if (this.logLevel <= LogLevel.ERROR) {
      console.error(this.formatLogMessage('ERROR', message, error));
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
      this.info(`Conversation saved: ${filename} (Reason: ${reason})`);
    } catch (error) {
      this.error('Failed to save conversation log', error);
    }
  }
}
