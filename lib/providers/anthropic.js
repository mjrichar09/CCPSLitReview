import Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic provider.
 *
 * Structured output goes through `output_config.format` with a JSON schema, so
 * a malformed response is a provider-side failure rather than something we have
 * to regex out of prose.
 */
export function createAnthropicProvider({ model, apiKey = process.env.ANTHROPIC_API_KEY, maxTokens = 8192 }) {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — required for the scoring and generation stages');
  }
  const client = new Anthropic({ apiKey });

  return {
    provider: 'anthropic',
    model,

    async complete({ system, user, schema, maxTokens: callMax = maxTokens }) {
      const params = {
        model,
        max_tokens: callMax,
        messages: [{ role: 'user', content: user }],
      };

      // Cache the rubric: it is identical across every batch in a category.
      //
      // Measured on a real month, this currently does nothing on Haiku: the
      // scoring system prompt is ~1k tokens and Haiku's minimum cacheable
      // prefix is 2048, so both cache counters came back 0. It is left in
      // because it costs nothing, it starts working the moment a rubric grows
      // or a stage moves to a model with a lower minimum, and the usage ledger
      // reports cache tokens honestly either way. The saving forgone is ~14% of
      // scoring input, about $0.04 a month — not worth padding a prompt for.
      if (system) {
        params.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
      }
      if (schema) {
        params.output_config = { format: { type: 'json_schema', schema } };
      }

      const response = await client.messages.create(params);

      if (response.stop_reason === 'refusal') {
        throw new Error(`anthropic: request refused (${response.stop_details?.category ?? 'no category'})`);
      }
      if (response.stop_reason === 'max_tokens') {
        throw new Error(`anthropic: response hit max_tokens (${callMax}) and is truncated`);
      }

      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { text, usage: response.usage, raw: response };
    },
  };
}
