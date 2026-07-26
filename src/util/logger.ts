type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let level: LogLevel = "info";

function currentLevel(): LogLevel {
  return level;
}

export function setLogLevel(next: LogLevel): void {
  level = next;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (!shouldLog(level)) {
    return;
  }

  const prefix = `[${new Date().toISOString()}] ${level.toUpperCase()}`;
  if (meta !== undefined) {
    console.error(`${prefix} ${message}`, meta);
  } else {
    console.error(`${prefix} ${message}`);
  }
}

export const logger = {
  debug(message: string, meta?: unknown): void {
    write("debug", message, meta);
  },
  info(message: string, meta?: unknown): void {
    write("info", message, meta);
  },
  warn(message: string, meta?: unknown): void {
    write("warn", message, meta);
  },
  error(message: string, meta?: unknown): void {
    write("error", message, meta);
  },
};
