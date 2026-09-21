/**
 * Simple logger utility with ANSI colors
 * No external dependencies
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const ANSI_COLORS: Record<LogLevel | "context" | "reset", string> = {
  debug: "\x1b[90m", // gray
  info: "\x1b[34m", // blue
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  context: "\x1b[36m", // cyan
  reset: "\x1b[0m",
};

const PREFIXES: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

function getEnvValue(key: string): string | undefined {
  try {
    if (typeof process !== "undefined" && process.env) {
      return process.env[key];
    }
  } catch {}
  try {
    const meta = import.meta as any;
    if (typeof meta !== "undefined" && meta.env) {
      return meta.env[key];
    }
  } catch {}
  return undefined;
}

function getLogLevel(): LogLevel {
  const env = getEnvValue("LOG_LEVEL")?.toLowerCase();
  if (env === "debug") return "debug";
  if (env === "info") return "info";
  if (env === "warn") return "warn";
  if (env === "error") return "error";
  return getEnvValue("DEBUG") === "true" ? "debug" : "info";
}

const CURRENT_LEVEL = getLogLevel();
const CURRENT_LEVEL_NUM = LOG_LEVELS[CURRENT_LEVEL];

export class Logger {
  constructor(private context: string) {}

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= CURRENT_LEVEL_NUM;
  }

  private format(level: LogLevel, message: string, args: any[]): string {
    const color = ANSI_COLORS[level];
    const reset = ANSI_COLORS.reset;
    const contextColor = ANSI_COLORS.context;
    const prefix = PREFIXES[level];

    const prefixStr = `${color}[${prefix}]${reset}`;
    const contextStr = `${contextColor}[${this.context}]${reset}`;
    const argsStr = args.length > 0 ? " " + args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") : "";

    return `${prefixStr} ${contextStr} ${message}${argsStr}`;
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) return;

    const output = this.format(level, message, args);

    if (level === "error") {
      console.error(output);
    } else if (level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log("debug", message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log("info", message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log("warn", message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log("error", message, ...args);
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}
