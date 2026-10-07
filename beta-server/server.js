'use strict';

/**
 * Job Tailor — paid beta server. No dependencies.
 *
 * Design constraints, in priority order:
 *   1. No CV, job posting or generated output is ever written to disk or
 *      logged. They exist in memory for one request and are discarded.
 *   2. No user accounts. Access is a licence key; the server stores only its
 *      SHA-256 hash and a credit balance. No name, no email, no password.
 *   3. The Anthropic API key never leaves this process.
 *
 * Consequence: there is very little here to leak, and very little to delete
 * when someone asks you to delete it.
 *
 * Built on node:http rather than a framework so there are no third-party
 * packages to audit or keep patched.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/store');
const { runClaude } = require('./lib/claude');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const COST_PER_RUN = 1;          // one credit per full application run
const MAX_PROMPT_CHARS = 90000;
const MAX_BODY_BYTES = 1024 * 1024;

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('body too large'), { code: 'too_large' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(Object.assign(new Error('bad json'), { code: 'bad_json' })); }
    });
    req.on('error', reject);
  });
}

function rateLimited(keyHash) {
  const now = Date.now();
  const rec = hits.get(keyHash) || { count: 0, start: now };
  if (now - rec.start > WINDOW_MS) { rec.count = 0; rec.start = now; }
  rec.count++;
  hits.set(keyHash, rec);
  return rec.count > MAX_PER_WINDOW;
}

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS * 5;
  for (const [k, v] of hits) if (v.start < cutoff) hits.delete(k);
}, WINDOW_MS * 5).unref();

/** Returns { key, credits } if valid, otherwise responds and returns null. */
function authorise(req, res, body) {
  const key = req.headers['x-licence-key'] || (body && body.licenceKey);
  if (!key || typeof key !== 'string' || key.trim().length < 8) {
    send(res, 401, { error: 'missing_key' });
    return null;
  }
  const trimmed = key.trim();
  let bal;
  try { bal = store.balance(trimmed); }
  catch (e) { send(res, 500, { error: 'store_unavailable' }); return null; }
  if (bal === null) { send(res, 403, { error: 'unknown_key' }); return null; }
  if (rateLimited(store.hashKey(trimmed))) {
    send(res, 429, { error: 'too_many_requests' });
    return null;
  }
  return { key: trimmed, credits: bal };
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  // Confirm the resolved path is still inside PUBLIC_DIR, so a crafted path
  // cannot climb out into the rest of the filesystem.
  if (!full.startsWith(PUBLIC_DIR + path.sep)) {
    send(res, 403, { error: 'forbidden' });
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) { send(res, 404, { error: 'not_found' }); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/healthz') return send(res, 200, { ok: true });

  if (url === '/api/balance' && req.method === 'GET') {
    const auth = authorise(req, res, null);
    if (!auth) return;
    return send(res, 200, { credits: auth.credits });
  }

  if ((url === '/api/generate' || url === '/api/assist') && req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch (e) { return send(res, e.code === 'too_large' ? 413 : 400, { error: e.code || 'bad_request' }); }

    const auth = authorise(req, res, body);
    if (!auth) return;

    const prompt = body.prompt;
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return send(res, 400, { error: 'missing_prompt' });
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      return send(res, 413, { error: 'prompt_too_large' });
    }

    if (url === '/api/generate') {
      const spent = store.spend(auth.key, COST_PER_RUN);
      if (!spent.ok) {
        return send(res, 402, { error: spent.reason, credits: spent.credits || 0 });
      }
      try {
        const result = await runClaude(prompt, { useSearch: !!body.useSearch, maxTokens: 4000 });
        // Token counts only. Never the prompt or the completion.
        console.log('run ok in:%d out:%d search:%s', result.inputTokens, result.outputTokens, !!body.useSearch);
        return send(res, 200, { text: result.text, credits: spent.credits });
      } catch (err) {
        store.refund(auth.key, COST_PER_RUN);
        console.error('run failed', err.code || 'unknown');
        return send(res, 502, { error: 'generation_failed' });
      }
    }

    // Assist calls are short and cheap, and are free during the beta.
    try {
      const result = await runClaude(prompt, { useSearch: !!body.useSearch, maxTokens: 2000 });
      console.log('assist ok in:%d out:%d', result.inputTokens, result.outputTokens);
      return send(res, 200, { text: result.text, credits: auth.credits });
    } catch (err) {
      console.error('assist failed', err.code || 'unknown');
      return send(res, 502, { error: 'generation_failed' });
    }
  }

  if (req.method === 'GET') return serveStatic(req, res);
  send(res, 404, { error: 'not_found' });
});

if (require.main === module) {
  server.listen(PORT, () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('WARNING: ANTHROPIC_API_KEY is not set. Generation will fail.');
    }
    console.log('Job Tailor beta listening on ' + PORT);
  });
}

module.exports = server;
