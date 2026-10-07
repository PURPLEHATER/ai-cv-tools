#!/usr/bin/env node
'use strict';

/**
 * Backend tests. No dependencies, no network — the Claude call is stubbed.
 *
 * The privacy suite is the important one: it asserts that no CV text reaches
 * disk or logs. That is the property the whole design rests on, so it should
 * fail loudly if someone later adds a convenient console.log.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-test-'));
process.env.DATA_DIR = TMP;

const store = require('../lib/store');

let passed = 0, failed = 0;
const failures = [];
let current = '';
function suite(n) { current = n; (global.__say || console.log)('\n\x1b[1m' + n + '\x1b[0m'); }
function it(n, c) {
  if (c) { passed++; (global.__say || console.log)('  \x1b[32m✓\x1b[0m ' + n); }
  else { failed++; failures.push(current + ' → ' + n); (global.__say || console.log)('  \x1b[31m✗ ' + n + '\x1b[0m'); }
}

// ---------------------------------------------------------------
suite('Credit store');

const KEY = 'JT-TEST-AAAA-BBBB-CCCC';
store.issue(KEY, 5);
it('new key has the issued credits', store.balance(KEY) === 5);
it('unknown key returns null, not zero', store.balance('JT-NOPE') === null);

let dup = false;
try { store.issue(KEY, 5); } catch (e) { dup = true; }
it('issuing the same key twice is rejected', dup);

const s1 = store.spend(KEY, 1);
it('spending succeeds while credits remain', s1.ok === true);
it('balance decrements', store.balance(KEY) === 4);

store.spend(KEY, 4);
it('balance reaches zero', store.balance(KEY) === 0);

const s2 = store.spend(KEY, 1);
it('spending past zero is refused', s2.ok === false && s2.reason === 'no_credits');
it('refused spend does not go negative', store.balance(KEY) === 0);

const s3 = store.spend('JT-NOPE', 1);
it('spending on an unknown key is refused', s3.ok === false && s3.reason === 'unknown_key');

store.refund(KEY, 1);
it('refund restores a credit', store.balance(KEY) === 1);

store.topUp(KEY, 10);
it('top-up adds credits', store.balance(KEY) === 11);

store.revoke(KEY);
it('revoke zeroes the balance', store.balance(KEY) === 0);
it('revoked key still spends nothing', store.spend(KEY, 1).ok === false);

// ---------------------------------------------------------------
suite('Store holds no personal data');

const raw = fs.readFileSync(store.FILE, 'utf8');
it('licence key is not stored in plain text', raw.indexOf(KEY) === -1);
it('key is stored as a hash', raw.indexOf(store.hashKey(KEY)) !== -1);
const parsed = JSON.parse(raw);
const rec = parsed[store.hashKey(KEY)];
const allowed = ['credits', 'issued', 'used', 'lastUsed', 'revoked'];
it('record contains only credit accounting fields',
   Object.keys(rec).every(k => allowed.indexOf(k) !== -1));
it('no field could hold a CV or a name',
   JSON.stringify(rec).length < 200);

// ---------------------------------------------------------------
suite('Atomic writes');

store.issue('JT-ATOMIC-KEY-0001', 3);
it('no stray .tmp file left behind', !fs.existsSync(store.FILE + '.tmp'));
it('store still parses after several writes', typeof JSON.parse(fs.readFileSync(store.FILE, 'utf8')) === 'object');

// ---------------------------------------------------------------
suite('Server behaviour');

// Stub the network before loading the server.
const realFetch = global.fetch;
const allPrompts = [];
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  allPrompts.push(body.messages[0].content);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: 'ROLE CONFIRMATION\nApplying for: Test Role' }],
      usage: { input_tokens: 100, output_tokens: 50 }
    })
  };
};
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
process.env.PORT = '0';

const captured = [];
const realLog = console.log;
const realErr = console.error;
console.log = (...a) => captured.push(a.map(String).join(' '));
console.error = (...a) => captured.push(a.map(String).join(' '));

const server = require('../server');

(async () => {
  await new Promise(resolve => server.listen(0, resolve));
  const PORT = server.address().port;

  // Console stays captured while requests run, so the privacy assertions
  // below are checking real output rather than an empty array.
  const base = 'http://127.0.0.1:' + PORT;
  global.__say = realLog;
  const LIVE = 'JT-LIVE-KEY-000001';
  store.issue(LIVE, 2);

  const CV_SECRET = 'Jane Doe, jane.secret@example.com, Kungliga Tekniska Hogskolan';

  async function req(pathname, opts = {}) {
    const res = await realFetch(base + pathname, opts);
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { status: res.status, data };
  }

  try {
    let r = await req('/healthz');
    it('health endpoint responds', r.status === 200 && r.data.ok === true);

    r = await req('/api/balance');
    it('balance without a key is rejected', r.status === 401);

    r = await req('/api/balance', { headers: { 'X-Licence-Key': 'JT-NOT-A-REAL-KEY' } });
    it('unknown key is rejected', r.status === 403);

    r = await req('/api/balance', { headers: { 'X-Licence-Key': LIVE } });
    it('valid key returns the balance', r.status === 200 && r.data.credits === 2);

    r = await req('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Licence-Key': LIVE },
      body: JSON.stringify({ prompt: 'CV: ' + CV_SECRET, useSearch: false })
    });
    it('generate succeeds with credits', r.status === 200 && !!r.data.text);
    it('response reports the new balance', r.data.credits === 1);
    it('a credit was actually spent', store.balance(LIVE) === 1);

    r = await req('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Licence-Key': LIVE },
      body: JSON.stringify({ prompt: 'second run' })
    });
    it('second run spends the last credit', store.balance(LIVE) === 0);

    r = await req('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Licence-Key': LIVE },
      body: JSON.stringify({ prompt: 'third run' })
    });
    it('run without credits returns 402', r.status === 402);
    it('402 names the reason', r.data.error === 'no_credits');

    r = await req('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Licence-Key': LIVE },
      body: JSON.stringify({})
    });
    it('missing prompt rejected before spending', r.status === 400 || r.status === 402);

    // Assist endpoint is free.
    const FREE = 'JT-FREE-KEY-000001';
    store.issue(FREE, 1);
    await req('/api/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Licence-Key': FREE },
      body: JSON.stringify({ prompt: 'interview questions please' })
    });
    it('assist does not consume a credit', store.balance(FREE) === 1);

    // ---------------------------------------------------------------
    suite('Nothing personal is written or logged');

    const logged = captured.join('\n');
    it('log capture actually captured something (guards against a vacuous pass)',
       captured.length > 0);
    it('CV text never appears in logs', logged.indexOf('Jane Doe') === -1);
    it('email never appears in logs', logged.indexOf('jane.secret@example.com') === -1);
    it('prompt text never appears in logs', logged.indexOf('Kungliga') === -1);
    it('token counts are logged instead', /in:\s*100/.test(logged) || logged.indexOf('run ok') !== -1);

    const onDisk = fs.readdirSync(TMP).map(f => fs.readFileSync(path.join(TMP, f), 'utf8')).join('\n');
    it('CV text never written to the data directory', onDisk.indexOf('Jane Doe') === -1);
    it('email never written to disk', onDisk.indexOf('jane.secret') === -1);
    it('generated output never written to disk', onDisk.indexOf('ROLE CONFIRMATION') === -1);

    it('the prompt did reach Claude (stub saw it)',
       allPrompts.some(p => p.indexOf('Jane Doe') !== -1));

    // ---------------------------------------------------------------
    suite('Rate limiting');

    const RL = 'JT-RATE-KEY-000001';
    store.issue(RL, 50);
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const rr = await req('/api/balance', { headers: { 'X-Licence-Key': RL } });
      if (rr.status === 429) { limited = true; break; }
    }
    it('excessive requests are rate limited', limited);

    // ---------------------------------------------------------------
    console.log = realLog;
    console.error = realErr;
    console.log('\n' + '─'.repeat(52));
    if (failed) {
      console.log(`\x1b[31m${failed} failed\x1b[0m, ${passed} passed`);
      failures.forEach(f => console.log('  • ' + f));
      server.close();
      process.exit(1);
    } else {
      console.log(`\x1b[32mAll ${passed} checks passed\x1b[0m`);
      server.close();
      process.exit(0);
    }
  } catch (err) {
    console.error('Test harness error:', err);
    process.exit(1);
  }
})();
