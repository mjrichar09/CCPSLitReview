import { fetchJson } from '../util/http.js';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Groq provider, over its OpenAI-compatible endpoint.
 *
 * Deliberately plain `fetch` rather than the OpenAI SDK: this is one POST with
 * one response shape, and the pipeline's dependency list is short on purpose.
 */
export function createGroqProvider({ model, apiKey = process.env.GROQ_API_KEY, maxTokens = 8192 }) {
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set — required because a stage is configured with provider "groq"');
  }

  return {
    provider: 'groq',
    model,

    async complete({ system, user, schema, maxTokens: callMax = maxTokens }) {
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: user });

      const body = { model, messages, max_tokens: callMax };
      if (schema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: { name: 'result', schema, strict: true },
        };
      }

      const data = await fetchJson(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const choice = data?.choices?.[0];
      if (choice?.finish_reason === 'length') {
        throw new Error(`groq: response hit max_tokens (${callMax}) and is truncated`);
      }

      return {
        text: choice?.message?.content ?? '',
        // Mapped onto the Anthropic field names so the usage ledger has one shape.
        usage: {
          input_tokens: data?.usage?.prompt_tokens ?? 0,
          output_tokens: data?.usage?.completion_tokens ?? 0,
        },
        raw: data,
      };
    },
  };
}
