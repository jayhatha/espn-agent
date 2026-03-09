/**
 * DEV-gated logger for the extension.
 * In production builds (import.meta.env.DEV === false), log/warn/debug are no-ops.
 * console.error is ALWAYS active -- never suppress real errors.
 */
const isDev = import.meta.env.DEV;

export const logger = {
  log: isDev ? console.log.bind(console) : () => {},
  warn: isDev ? console.warn.bind(console) : () => {},
  debug: isDev ? console.debug.bind(console) : () => {},
  info: isDev ? console.info.bind(console) : () => {},
  error: console.error.bind(console),  // ALWAYS active
};
