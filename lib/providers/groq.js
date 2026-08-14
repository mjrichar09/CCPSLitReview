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

      // The caller sizes its budget for the answer alone, which is right for a
      // non-reasoning model. Groq's gpt-oss models spend the *same* completion
      // budget on reasoning first, so a budget of 1024 is consumed before any
      // JSON is emitted and Groq answers 400 json_validate_failed with an empty
      // `failed_generation` — a truncation reported as a schema error.
      //
      // Beware the squeeze this creates on a rate-limited account: Groq counts
      // prompt + budget against tokens-per-minute, so raising the budget enough
      // for reasoning can push a single request past the limit. Measured on the
      // free ("on_demand") tier, whose cap is 8000 TPM: scoring one batch of 8
      // requests 11305 tokens and is rejected outright. Scoring a month on that
      // tier is not a tuning problem — see Status_update.md.
      const budget = Math.max(callMax * 6, 8192);
      const body = { model, messages, max_completion_tokens: budget };
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
        throw new Error(`groq: response hit the completion budget (${budget}) and is truncated`);
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
