/**
 * Structured stderr logging. Everything the pipeline says about its own
 * progress goes to stderr so `--dry-run` can put report JSON on stdout and
 * stay pipeable.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
let threshold = LEVELS.info;

export function setLogLevel(level) {
  if (!(level in LEVELS)) throw new Error(`unknown log level: ${level}`);
  threshold = LEVELS[level];
}

function emit(level, msg, fields) {
  if (LEVELS[level] < threshold) return;
  const tag = level.toUpperCase().padEnd(5);
  const suffix = fields && Object.keys(fields).length
    ? ' ' + Object.entries(fields)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(' ')
    : '';
  process.stderr.write(`${tag} ${msg}${suffix}\n`);
}

export const log = {
  debug: (msg, fields) => emit('debug', msg, fields),
  info: (msg, fields) => emit('info', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  error: (msg, fields) => emit('error', msg, fields),
};
