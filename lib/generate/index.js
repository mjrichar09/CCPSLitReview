import { createProvider, parseJson } from '../providers/index.js';

/**
 * The seam between "what the digest says" and "what produced it".
 *
 * Summarisation is the dominant cost line and the part that is actually the
 * product, so it may later move off the metered API onto a Claude Code routine
 * billed against a subscription. Everything upstream — fetch, normalize,
 * dedupe, score — is deterministic and stays in Actions regardless.
 *
 * `config.generator` selects the implementation. Today there is one, `api`.
 * A routine-based generator would implement the same `generate({ kind, system,
 * user, schema })` and read `staging/<month>/scored.json` out of the repo.
 */
const GENERATORS = {
  api: createApiGenerator,
};

export function createGenerator(config, stage, { env = process.env } = {}) {
  const kind = config.generator ?? 'api';
  const factory = GENERATORS[kind];
  if (!factory) {
    throw new Error(
      `unknown generator "${kind}" — known generators are ${Object.keys(GENERATORS).join(', ')}`,
    );
  }
  return factory(config, stage, { env });
}

/**
 * Repair dash artifacts in generated prose.
 *
 * Measured on the first full run: writing a long paragraph under a JSON schema,
 * the model twice emitted an en dash as a broken escape. `"1.6\ndash7.4-fold"`
 * parses to a newline plus the literal word "dash", and the remaining cases came
 * through as a bare newline mid-sentence. 2 of 241 fields, both of them the
 * longest prose in the report — the overview and one category synthesis — so it
 * would have been visible on the page and nowhere else.
 *
 * `\ndash` between two numbers is unambiguous and becomes an en dash. A leftover
 * stray newline becomes a space rather than a guessed dash: dropping punctuation
 * the model may not have intended is safer than inventing punctuation it did not
 * write. The prompts also now ask for plain ASCII, which addresses the cause;
 * this stays as the guard, because a malformed report is not worth re-running.
 */
export function tidyStrings(value) {
  if (typeof value === 'string') {
    return value
      .replace(/(\d)\s*\n\s*dash\s*(\d)/g, '$1–$2')
      .replace(/\s*\n\s*dash\s*/g, ' — ')
      .replace(/\s*\n\s*/g, ' ')
      .trim();
  }
  if (Array.isArray(value)) return value.map(tidyStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tidyStrings(v)]));
  }
  return value;
}

/** Generation over the metered provider API, one call per request. */
function createApiGenerator(config, stage, { env }) {
  const provider = createProvider(config, stage, { env });

  return {
    kind: 'api',
    provider: provider.provider,
    model: provider.model,
    rates: provider.rates,

    async generate({ system, user, schema, maxTokens, usage }) {
      const response = await provider.complete({ system, user, schema, maxTokens });
      usage?.record({
        stage,
        provider: provider.provider,
        model: provider.model,
        rates: provider.rates,
        usage: response.usage,
      });
      return tidyStrings(parseJson(response.text, `${stage}/${provider.model}`));
    },
  };
}
