import { log } from './log.js';

const USER_AGENT =
  'CCPSLitReview/0.1 (monthly bioprocess digest; +https://github.com/mjrichar09/CCPSLitReview)';

export class HttpError extends Error {
  constructor(status, statusText, url, body) {
    super(`HTTP ${status} ${statusText} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

/**
 * fetch with a timeout, a polite User-Agent, and bounded retries.
 *
 * Retries 429 and 5xx with exponential backoff, honouring Retry-After when the
 * server sends one. 4xx other than 429 is a real error and is not retried —
 * retrying a malformed query just wastes the rate-limit budget.
 */
export async function fetchWithRetry(url, {
  timeoutMs = 30_000,
  retries = 3,
  headers = {},
  accept,
  method,
  body,
  // Extra statuses to treat as transient. 429 and 5xx are always retried; this
  // is for servers that signal throttling with something else — the FDA feed
  // answers a burst with 401, which is otherwise a permanent failure.
  retryStatuses = [],
} = {}) {
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(30_000, 500 * 2 ** (attempt - 1)) + Math.random() * 250;
      const wait = lastErr?.retryAfterMs ?? backoff;
      log.debug('retrying', { url: short(url), attempt, waitMs: Math.round(wait) });
      await sleep(wait);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        ...(method ? { method } : {}),
        ...(body != null ? { body } : {}),
        headers: {
          'User-Agent': USER_AGENT,
          ...(accept ? { Accept: accept } : {}),
          ...headers,
        },
      });

      if (res.ok) return res;

      const retryable = res.status === 429 || res.status >= 500 || retryStatuses.includes(res.status);
      // Named errorBody, not body: a `const body` here shares a block with the
      // request-building `body` parameter above and puts it in a temporal dead
      // zone, which fails every request with "Cannot access 'body'".
      const errorBody = await res.text().catch(() => '');
      const err = new HttpError(res.status, res.statusText, url, errorBody.slice(0, 400));
      if (!retryable) throw err;

      const retryAfter = Number(res.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfterMs = retryAfter * 1000;
      lastErr = err;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof HttpError && err.status && err.status < 500 && err.status !== 429 && !retryStatuses.includes(err.status)) throw err;
      if (err.name === 'AbortError') {
        lastErr = new Error(`timeout after ${timeoutMs}ms for ${short(url)}`);
      } else {
        lastErr = err;
      }
      if (attempt === retries) break;
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (attempt === retries) break;
  }

  throw lastErr ?? new Error(`request failed: ${short(url)}`);
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchWithRetry(url, { accept: 'application/json', ...opts });
  return res.json();
}

export async function fetchText(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function short(url) {
  return url.length > 120 ? `${url.slice(0, 117)}...` : url;
}
