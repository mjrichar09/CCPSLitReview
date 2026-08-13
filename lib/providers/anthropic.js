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

      // Cache the rubric: it is identical across every batch in a category, and
      // it is the largest part of the prompt.
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
