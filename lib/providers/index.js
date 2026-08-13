import { createAnthropicProvider } from './anthropic.js';
import { createGroqProvider } from './groq.js';

const FACTORIES = {
  anthropic: createAnthropicProvider,
  groq: createGroqProvider,
};

export const PROVIDERS = Object.keys(FACTORIES);

/**
 * Build the provider for one pipeline stage.
 *
 * Provider choice is per stage, not global: scoring is high-volume and bounded
 * judgement, generation is low-volume and the whole product. Swapping either is
 * a config edit (`models.<stage>`), and both implementations answer the same
 * `complete({ system, user, schema })` call, so nothing downstream changes.
 */
export function createProvider(config, stage, { env = process.env } = {}) {
  const settings = config?.models?.[stage];
  if (!settings) throw new Error(`no model configured for stage "${stage}"`);

  const factory = FACTORIES[settings.provider];
  if (!factory) {
    throw new Error(
      `unknown provider "${settings.provider}" for stage "${stage}" — known providers are ${PROVIDERS.join(', ')}`,
    );
  }

  const provider = factory({
    model: settings.model,
    apiKey: settings.provider === 'groq' ? env.GROQ_API_KEY : env.ANTHROPIC_API_KEY,
  });
  return { ...provider, stage, rates: settings.rates };
}

/**
 * Parse a provider's structured response.
 *
 * Both providers are asked for schema-constrained JSON, so a parse failure here
 * means the provider broke its contract. It is surfaced with the offending text
 * rather than silently skipped — a scoring batch that quietly returned nothing
 * would drop a whole category from the digest.
 */
export function parseJson(text, context = 'provider') {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error(`${context}: empty response where JSON was required`);
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some models wrap JSON in a fenced block despite the schema constraint.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch { /* fall through to the error below */ }
    }
    throw new Error(`${context}: response was not valid JSON: ${trimmed.slice(0, 200)}`);
  }
}
