import { env } from 'process';

const IS_PROD = env.NODE_ENV === 'production' || env.NODE_ENV === 'prod';

const timestamp = () => new Date().toISOString();

function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return String(obj);
  }
}

function log(level, message, meta = {}) {
  const entry = {
    timestamp: timestamp(),
    level,
    message,
    ...meta
  };
  console.log(safeStringify(entry));
}

export const info = (message, meta) => log('info', message, meta);
export const warn = (message, meta) => log('warn', message, meta);
export const error = (message, meta) => log('error', message, meta);

export default { info, warn, error };
