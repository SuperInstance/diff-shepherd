import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "\x1b[36m", // Cyan
  [LogLevel.INFO]: "\x1b[32m", // Green
  [LogLevel.WARN]: "\x1b[33m", // Yellow
  [LogLevel.ERROR]: "\x1b[31m", // Red
};

const RESET = "\x1b[0m";

class Logger {
  private logDir: string;
  private logFile: string;
  private minLevel: LogLevel;
  private buffer: string[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;
  private isBuffering = true;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
    this.logDir = join(homedir(), ".diff-shepherd", "logs");
    this.logFile = join(this.logDir, `shepherd-${Date.now()}.log`);

    // Start periodic flush (every 5 seconds)
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {
        // Ignore flush errors
      });
    }, 5000);

    // Ensure log directory exists
    this.ensureLogDirectory();

    // Flush on exit
    process.on("exit", () => {
      this.flushSync();
    });

    process.on("SIGINT", () => {
      this.flushSync();
    });

    process.on("SIGTERM", () => {
      this.flushSync();
    });
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await mkdir(this.logDir, { recursive: true });
      this.isBuffering = false;
      // Flush any buffered logs
      await this.flush();
    } catch (err) {
      // If we can't create the log directory, keep buffering
      // and try again later
    }
  }

  private formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${levelName}]${contextStr} ${message}`;
  }

  private async writeLog(level: LogLevel, message: string, context?: Record<string, unknown>): Promise<void> {
    if (level < this.minLevel) {
      return;
    }

    const formatted = this.formatMessage(level, message, context);

    // Always write to console with colors
    const color = LOG_LEVEL_COLORS[level];
    console.log(`${color}${formatted}${RESET}`);

    // Buffer for file write
    this.buffer.push(formatted + "\n");

    // Flush immediately for errors
    if (level >= LogLevel.ERROR) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const toWrite = this.buffer.join("");
    this.buffer = [];

    try {
      await writeFile(this.logFile, toWrite, { flag: "a" });
    } catch (err) {
      // If write fails, put the logs back in the buffer
      this.buffer.unshift(...toWrite.split("\n").filter(Boolean));
    }
  }

  private flushSync(): void {
    if (this.buffer.length === 0) {
      return;
    }

    const toWrite = this.buffer.join("");
    this.buffer = [];

    try {
      require("fs").appendFileSync(this.logFile, toWrite);
    } catch {
      // Ignore sync write errors
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.writeLog(LogLevel.DEBUG, message, context).catch(() => {});
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.writeLog(LogLevel.INFO, message, context).catch(() => {});
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.writeLog(LogLevel.WARN, message, context).catch(() => {});
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.writeLog(LogLevel.ERROR, message, context).catch(() => {});
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }

  getLogFile(): string {
    return this.logFile;
  }
}

// Create singleton instance
let loggerInstance: Logger | null = null;

export function getLogger(minLevel?: LogLevel): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(minLevel);
  }
  return loggerInstance;
}

export function setLogLevel(level: LogLevel): void {
  const logger = getLogger();
  (logger as any).minLevel = level;
}

export async function closeLogger(): Promise<void> {
  if (loggerInstance) {
    await loggerInstance.close();
    loggerInstance = null;
  }
}
