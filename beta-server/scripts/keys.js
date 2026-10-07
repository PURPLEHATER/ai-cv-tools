#!/usr/bin/env node
'use strict';

/**
 * Licence key admin.
 *
 *   node scripts/keys.js new 20          issue a key with 20 credits
 *   node scripts/keys.js topup KEY 20    add credits
 *   node scripts/keys.js balance KEY     check remaining
 *   node scripts/keys.js revoke KEY      set to zero
 *   node scripts/keys.js stats           totals across all keys
 *
 * Keys are shown once, when issued. Only the hash is stored, so a lost key
 * cannot be recovered — issue a new one and revoke the old.
 */

const crypto = require('crypto');
const store = require('../lib/store');

function makeKey() {
  // Grouped for legibility when someone types it by hand.
  const raw = crypto.randomBytes(15).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return 'JT-' + raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8, 12) + '-' + raw.slice(12, 16);
}

const [, , cmd, a, b] = process.argv;

try {
  if (cmd === 'new') {
    const credits = parseInt(a || '20', 10);
    if (!Number.isFinite(credits) || credits <= 0) throw new Error('credits must be a positive number');
    const key = makeKey();
    store.issue(key, credits);
    console.log('\nLicence key issued. Send this to the customer — it is not recoverable.\n');
    console.log('  ' + key);
    console.log('  ' + credits + ' credits\n');

  } else if (cmd === 'topup') {
    if (!a) throw new Error('usage: topup KEY CREDITS');
    const credits = parseInt(b || '20', 10);
    const rec = store.topUp(a, credits);
    console.log('Topped up. New balance: ' + rec.credits);

  } else if (cmd === 'balance') {
    if (!a) throw new Error('usage: balance KEY');
    const bal = store.balance(a);
    console.log(bal === null ? 'Unknown key' : bal + ' credits remaining');

  } else if (cmd === 'revoke') {
    if (!a) throw new Error('usage: revoke KEY');
    store.revoke(a);
    console.log('Revoked. Balance set to zero.');

  } else if (cmd === 'stats') {
    const s = store.stats();
    console.log('Keys issued:        ' + s.keys);
    console.log('Keys used at least once: ' + s.active);
    console.log('Credits outstanding: ' + s.creditsOutstanding);
    console.log('Credits used:        ' + s.creditsUsed);

  } else {
    console.log('Commands: new [credits] | topup KEY CREDITS | balance KEY | revoke KEY | stats');
    process.exit(1);
  }
} catch (err) {
  console.error('Error: ' + err.message);
  process.exit(1);
}
