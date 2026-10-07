'use strict';

/**
 * Claude wrapper.
 *
 * The API key lives only here, in the server process. It is never sent to the
 * browser and never appears in a response.
 *
 * Nothing from the prompt or the completion is logged. That is deliberate: the
 * prompt contains a CV, which is personal data. Logging it would put employment
 * histories in your server logs and undo the main safety property of this
 * design. Errors log status codes and messages only.
 */

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

async function runClaude(prompt, { useSearch = false, maxTokens = 4000 } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw Object.assign(new Error('server not configured'), { code: 'no_key' });

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  };
  if (useSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    // Status and message only — never the prompt.
    console.error('Anthropic API error', res.status, data && data.error && data.error.type);
    throw Object.assign(new Error('upstream error'), { code: 'upstream', status: res.status });
  }

  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  if (!text) throw Object.assign(new Error('empty completion'), { code: 'empty' });

  // Token counts are useful for cost tracking and contain no personal data.
  const usage = data.usage || {};
  return {
    text,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0
  };
}

module.exports = { runClaude, MODEL };
