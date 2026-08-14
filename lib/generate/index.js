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
      return parseJson(response.text, `${stage}/${provider.model}`);
    },
  };
}
