/**
 * Token-bucket rate limiting with a concurrency cap, per host.
 *
 * Real throttling rather than a sleep between calls: tokens refill continuously
 * at `rps`, so a burst of requests after an idle gap is allowed up to `burst`
 * and the sustained rate still holds. NCBI's 3/s unkeyed vs 10/s keyed limit is
 * the case that matters — exceeding it gets the whole run 429'd.
 */

export function createLimiter({ rps, concurrency = 4, burst } = {}) {
  if (!(rps > 0)) throw new Error('createLimiter: rps must be > 0');
  const capacity = burst ?? Math.max(1, Math.floor(rps));

  let tokens = capacity;
  let lastRefill = Date.now();
  let active = 0;
  let timer = null;
  const queue = [];

  function refill() {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - lastRefill) / 1000) * rps);
    lastRefill = now;
  }

  function arm(ms) {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      pump();
    }, Math.max(1, Math.ceil(ms)));
    // Deliberately NOT unref'd. This timer is the only thing keeping the event
    // loop alive while every queued job is waiting on a token, so unref'ing it
    // lets Node exit mid-run with code 0 and partial results — a silent
    // truncation, which is the one failure mode this pipeline must not have.
    // pump() never arms a timer once the queue is empty, so it cannot outlive
    // the work.
  }

  function pump() {
    refill();

    while (queue.length > 0 && active < concurrency && tokens >= 1) {
      tokens -= 1;
      const job = queue.shift();
      active += 1;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }

    if (queue.length === 0) return;

    // Still work pending: wait for whichever constraint is binding.
    if (active >= concurrency) {
      // A slot frees via the finally() above; no timer needed.
      return;
    }
    arm(((1 - tokens) / rps) * 1000);
  }

  return {
    /** Run `fn` once a token and a concurrency slot are both available. */
    schedule(fn) {
      return new Promise((resolve, reject) => {
        queue.push({ run: fn, resolve, reject });
        pump();
      });
    },
    get pending() {
      return queue.length + active;
    },
  };
}

/**
 * One limiter per logical host key, so per-source settings are independent and
 * two categories hitting PubMed share a single bucket rather than each getting
 * the full rate.
 */
export function createLimiterRegistry() {
  const limiters = new Map();
  return {
    for(key, opts) {
      let limiter = limiters.get(key);
      if (!limiter) {
        limiter = createLimiter(opts);
        limiters.set(key, limiter);
      }
      return limiter;
    },
  };
}
