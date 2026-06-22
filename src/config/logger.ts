import { inspect } from 'node:util';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

const serializeContext = (context: LogContext): LogContext =>
  Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value,
    ]),
  );

const colors: Record<LogLevel, string> = {
  debug: '\u001b[90m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
};

const formatDevelopmentLog = (
  level: LogLevel,
  message: string,
  context: LogContext,
): string => {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  const label = level.toUpperCase().padEnd(5);
  const coloredLabel = useColor ? `${colors[level]}${label}\u001b[0m` : label;

  const details = Object.entries(context).map(([key, value]) => {
    if (value instanceof Error) {
      const errorText = `${value.name}: ${value.message}`;
      const showStack = process.env.LOG_STACKS === 'true';
      return `  ${key}: ${showStack && value.stack ? value.stack : errorText}`;
    }

    return `  ${key}: ${inspect(value, { colors: useColor, depth: 4, breakLength: 100 })}`;
  });

  return [`${time} ${coloredLabel} ${message}`, ...details].join('\n');
};

const write = (level: LogLevel, message: string, context: LogContext = {}): void => {
  const entry = process.env.NODE_ENV === 'production'
    ? JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...serializeContext(context),
      })
    : formatDevelopmentLog(level, message, context);

  if (level === 'error') {
    console.error(entry);
    return;
  }

  if (level === 'warn') {
    console.warn(entry);
    return;
  }

  console.log(entry);
};

const logger = {
  debug: (message: string, context?: LogContext): void => write('debug', message, context),
  info: (message: string, context?: LogContext): void => write('info', message, context),
  warn: (message: string, context?: LogContext): void => write('warn', message, context),
  error: (message: string, context?: LogContext): void => write('error', message, context),
};

export default logger;
