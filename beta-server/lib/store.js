'use strict';

/**
 * Credit store.
 *
 * Deliberately holds no personal data. A record is:
 *   { credits, issued, lastUsed, used }
 * keyed by the SHA-256 hash of the licence key.
 *
 * No name, no email, no CV, no job posting, no generated output. If this file
 * leaked it would reveal how many credits some anonymous key has left.
 *
 * A JSON file is adequate for a small beta on a single instance. It is not
 * adequate for multiple instances or high concurrency — see README before
 * scaling past that.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'credits.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key).trim()).digest('hex');
}

function readAll() {
  ensureDir();
  if (!fs.existsSync(FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    console.error('Credit store unreadable; refusing to overwrite it.', err.message);
    throw new Error('credit store corrupt');
  }
}

// Write to a temp file then rename, so an interrupted write cannot truncate
// the store and wipe everyone's credits.
function writeAll(data) {
  ensureDir();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

function issue(key, credits) {
  const all = readAll();
  const h = hashKey(key);
  if (all[h]) throw new Error('key already exists');
  all[h] = {
    credits: credits,
    issued: new Date().toISOString(),
    used: 0,
    lastUsed: null
  };
  writeAll(all);
  return all[h];
}

function topUp(key, credits) {
  const all = readAll();
  const h = hashKey(key);
  if (!all[h]) throw new Error('key not found');
  all[h].credits += credits;
  writeAll(all);
  return all[h];
}

function revoke(key) {
  const all = readAll();
  const h = hashKey(key);
  if (!all[h]) throw new Error('key not found');
  all[h].credits = 0;
  all[h].revoked = new Date().toISOString();
  writeAll(all);
  return all[h];
}

function balance(key) {
  const all = readAll();
  const rec = all[hashKey(key)];
  return rec ? rec.credits : null;
}

/**
 * Reserves one credit up front. Returning false means the caller must not
 * proceed. Charging before the work rather than after means a crash mid-request
 * cannot be replayed for free; refund() exists for genuine failures.
 */
function spend(key, cost) {
  const all = readAll();
  const h = hashKey(key);
  const rec = all[h];
  if (!rec) return { ok: false, reason: 'unknown_key' };
  if (rec.credits < cost) return { ok: false, reason: 'no_credits', credits: rec.credits };
  rec.credits -= cost;
  rec.used += cost;
  rec.lastUsed = new Date().toISOString();
  writeAll(all);
  return { ok: true, credits: rec.credits };
}

function refund(key, cost) {
  try {
    const all = readAll();
    const rec = all[hashKey(key)];
    if (!rec) return;
    rec.credits += cost;
    rec.used = Math.max(0, rec.used - cost);
    writeAll(all);
  } catch (err) {
    console.error('Refund failed:', err.message);
  }
}

function stats() {
  const all = readAll();
  const keys = Object.values(all);
  return {
    keys: keys.length,
    creditsOutstanding: keys.reduce((n, r) => n + r.credits, 0),
    creditsUsed: keys.reduce((n, r) => n + r.used, 0),
    active: keys.filter(r => r.lastUsed).length
  };
}

module.exports = { hashKey, issue, topUp, revoke, balance, spend, refund, stats, FILE };
