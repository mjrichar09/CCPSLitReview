/**
 * Token and cost accounting, broken out by stage and model.
 *
 * Every provider call reports here. The totals are printed at the end of every
 * run — dry runs included — and persisted into the month's JSON under
 * `run_stats`, so cost is visible across months rather than only in a job log
 * that ages out.
 *
 * Cache multipliers follow Anthropic's published pricing: a cache read costs
 * ~0.1x the input rate and a cache write ~1.25x. Scoring sends the same
 * category rubric with every batch, so getting this wrong would misreport the
 * dominant term in the cheapest stage.
 */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export function createUsageLedger() {
  const rows = new Map();

  function key(stage, provider, model) {
    return `${stage}|${provider}|${model}`;
  }

  return {
    /** Record one call. `rates` is USD per million tokens. */
    record({ stage, provider, model, rates, usage, calls = 1 }) {
      const k = key(stage, provider, model);
      let row = rows.get(k);
      if (!row) {
        row = {
          stage, provider, model, rates,
          calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
        };
        rows.set(k, row);
      }
      row.calls += calls;
      row.input += usage?.input_tokens ?? 0;
      row.output += usage?.output_tokens ?? 0;
      row.cacheRead += usage?.cache_read_input_tokens ?? 0;
      row.cacheWrite += usage?.cache_creation_input_tokens ?? 0;
      return row;
    },

    rows: () => [...rows.values()],

    /**
     * Re-seed from rows persisted in a staging artifact.
     *
     * Without this, a run resumed from staging reports only what *this* process
     * spent — so a re-run after a mid-pipeline failure would record a month
     * costing $0.89 when it actually cost $2.34. The staging layer exists to
     * make resumption cheap; it must not also make it lie about cost.
     */
    restore(saved) {
      for (const row of saved ?? []) {
        const k = key(row.stage, row.provider, row.model);
        const existing = rows.get(k);
        if (existing) {
          existing.calls += row.calls ?? 0;
          existing.input += row.input ?? 0;
          existing.output += row.output ?? 0;
          existing.cacheRead += row.cacheRead ?? 0;
          existing.cacheWrite += row.cacheWrite ?? 0;
        } else {
          rows.set(k, {
            stage: row.stage, provider: row.provider, model: row.model, rates: row.rates,
            calls: row.calls ?? 0, input: row.input ?? 0, output: row.output ?? 0,
            cacheRead: row.cacheRead ?? 0, cacheWrite: row.cacheWrite ?? 0,
          });
        }
      }
    },

    totals() {
      let cost = 0, input = 0, output = 0, calls = 0;
      for (const row of rows.values()) {
        cost += rowCost(row);
        input += row.input + row.cacheRead + row.cacheWrite;
        output += row.output;
        calls += row.calls;
      }
      return { cost, input, output, calls };
    },

    /** Shape persisted into the month JSON under `run_stats`. */
    toJSON(extra = {}) {
      const t = this.totals();
      return {
        ...extra,
        total_cost_usd: round(t.cost, 4),
        total_input_tokens: t.input,
        total_output_tokens: t.output,
        calls: t.calls,
        by_stage: [...rows.values()].map((row) => ({
          stage: row.stage,
          provider: row.provider,
          model: row.model,
          calls: row.calls,
          input_tokens: row.input,
          output_tokens: row.output,
          cache_read_tokens: row.cacheRead,
          cache_write_tokens: row.cacheWrite,
          cost_usd: round(rowCost(row), 4),
        })),
      };
    },

    /** Human-readable table for the job log. */
    table({ keptItems = null } = {}) {
      const out = [];
      const w = { stage: 12, model: 24 };
      out.push('');
      out.push(
        'stage'.padEnd(w.stage) + 'model'.padEnd(w.model) +
        'calls'.padStart(7) + 'in'.padStart(10) + 'out'.padStart(9) + 'cached'.padStart(10) + 'USD'.padStart(10),
      );
      out.push('-'.repeat(w.stage + w.model + 46));

      for (const row of rows.values()) {
        out.push(
          row.stage.padEnd(w.stage) +
          row.model.slice(0, w.model - 1).padEnd(w.model) +
          String(row.calls).padStart(7) +
          String(row.input).padStart(10) +
          String(row.output).padStart(9) +
          String(row.cacheRead).padStart(10) +
          rowCost(row).toFixed(4).padStart(10),
        );
      }

      const t = this.totals();
      out.push('-'.repeat(w.stage + w.model + 46));
      out.push(
        'total'.padEnd(w.stage + w.model) +
        String(t.calls).padStart(7) +
        String(t.input).padStart(10) +
        String(t.output).padStart(9) +
        ''.padStart(10) +
        t.cost.toFixed(4).padStart(10),
      );
      if (keptItems > 0) {
        out.push(`per kept item: $${(t.cost / keptItems).toFixed(4)}  (${keptItems} items)`);
      }
      out.push('');
      return out.join('\n');
    },
  };
}

function rowCost(row) {
  const inRate = row.rates?.input ?? 0;
  const outRate = row.rates?.output ?? 0;
  return (
    (row.input / 1e6) * inRate +
    (row.cacheRead / 1e6) * inRate * CACHE_READ_MULTIPLIER +
    (row.cacheWrite / 1e6) * inRate * CACHE_WRITE_MULTIPLIER +
    (row.output / 1e6) * outRate
  );
}

function round(n, places) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
