#!/usr/bin/env node
/**
 * Mutation testing.
 *
 * Introduces one deliberate defect at a time into the artifact, runs the suite,
 * and records whether it was caught. A SURVIVING mutation is a coverage gap:
 * the code was broken and the tests said nothing.
 */

const fs = require('fs');
const { execSync } = require('child_process');

const FILE = 'job-tailor-artifact.html';
const original = fs.readFileSync(FILE, 'utf8');

const mutations = [
  // --- Section parsing ---
  { name: 'Header regex loses case-insensitivity',
    find: "|$)', 'gim');",
    to:   "|$)', 'gm');" },

  { name: 'Header regex loses line anchoring',
    find: "var pattern = new RegExp('^\\\\s*(' + escaped.join('|')",
    to:   "var pattern = new RegExp('\\\\s*(' + escaped.join('|')" },

  { name: 'Separator rule dropped, so body lines become headers',
    find: "\\s*(?:[:\\\\-\\u2013]\\\\s*|$)', 'gim');",
    to:   "\\s*[:\\\\-\\u2013]?\\\\s*', 'gim');" },

  { name: 'Header alias map emptied, so translated headers stop resolving',
    find: "(HEADER_ALIASES[k] || []).forEach(function (alias) { map[alias.toLowerCase()] = k; });",
    to:   "" },

  { name: 'Aliases no longer sorted longest-first',
    find: "var matchable = Object.keys(map).sort(function (a, b) { return b.length - a.length; });",
    to:   "var matchable = Object.keys(map);" },

  { name: 'Saved run falls back to no name at all',
    find: "roleFromConfirmation(parts['ROLE CONFIRMATION']) || fallbackRole(text, company),",
    to:   "roleFromConfirmation(parts['ROLE CONFIRMATION'])," },

  { name: 'Date range protection removed',
    find: "s = s.replace(/(\\d)\\s*[\\u2013\\u2014]\\s*(\\d)/g, function (m, a, b) {",
    to:   "s = s.replace(/(\\d)ZZZ(\\d)/g, function (m, a, b) {" },

  { name: 'Unspaced em dashes left in the output',
    find: "s = s.replace(/[\\u2014]/g, ', ');",
    to:   "" },

  { name: 'Spaced dashes no longer replaced',
    find: "s = s.replace(/\\s+[\\u2013\\u2014]\\s+/g, ', ');",
    to:   "" },


  { name: 'Cover letter no longer cleaned',
    find: "makeSection(T().secLetter, stripEmDashes(parts['COVER LETTER'])",
    to:   "makeSection(T().secLetter, (parts['COVER LETTER'])" },

  { name: 'Tailored CV no longer cleaned',
    find: "makeSection(T().secCv, stripEmDashes(parts['TAILORED CV'])",
    to:   "makeSection(T().secCv, (parts['TAILORED CV'])" },


  { name: 'Uniformity threshold raised so nothing is ever flagged',
    find: "var UNIFORM_THRESHOLD = 0.25;",
    to:   "var UNIFORM_THRESHOLD = 0;" },

  { name: 'Uniformity warning never shown',
    find: "variation !== null && variation < UNIFORM_THRESHOLD",
    to:   "false" },

  { name: 'Variation divides by zero instead of returning null',
    find: "if (!mean) return null;",
    to:   "" },

  { name: 'Single role reports a variation it cannot have',
    find: "if (lengths.length < 2) return null;",
    to:   "" },

  { name: 'Prompt no longer asks for uneven weighting',
    find: "Weight the roles unevenly.",
    to:   "Give each role similar weight." },

  { name: 'Bullet length variation instruction dropped',
    find: "Some should be short, six or seven words.",
    to:   "" },


  { name: 'Failed parse hidden again',
    find: "warn.className = 'parse-warn';",
    to:   "warn.className = 'hidden-warn';" },

  { name: 'Question numbering not stripped',
    find: "return l.replace(/^\\s*\\d+[\\.\\)]\\s*/, '').trim();",
    to:   "return l.trim();" },

  { name: 'Punctuation-only question lines kept',
    find: "}).filter(function (l) { return l.length > 2; });",
    to:   "}).filter(function (l) { return l.length > 0; });" },

  // --- CV structure ---
  { name: 'Sentences accepted as headings',
    find: "if (/[.!?]$/.test(t)) return false;",
    to:   "" },

  { name: 'Long lines accepted as headings',
    find: "if (!t || t.length > 48) return false;",
    to:   "if (!t) return false;" },

  { name: 'Bullet marker not stripped',
    find: "return line.replace(/^\\s*[-\\u2022\\u2013*\\u00b7]\\s+/, '').trim();",
    to:   "return line.trim();" },

  // --- Score handling ---
  { name: 'Match score not clamped to 100',
    find: "return m ? Math.max(0, Math.min(100, parseInt(m[1], 10))) : null;",
    to:   "return m ? parseInt(m[1], 10) : null;" },

  // --- URL handling ---
  { name: 'URL only detected when alone in the field',
    find: "function containsUrl(s) {\n    return /\\bhttps?:\\/\\/\\S+/i.test(s)",
    to:   "function containsUrl(s) {\n    return /^\\s*https?:\\/\\/\\S+\\s*$/i.test(s)" },

  { name: 'Gated-site check ignores LinkedIn',
    find: "var GATED_SITES = /\\b(linkedin\\.com|",
    to:   "var GATED_SITES = /\\b(nomatchxyz\\.com|" },

  // --- CSV export ---
  { name: 'CSV does not escape embedded quotes',
    find: "if (/[\",\\n\\r]/.test(s)) return '\"' + s.replace(/\"/g, '\"\"') + '\"';",
    to:   "if (/[\",\\n\\r]/.test(s)) return '\"' + s + '\"';" },

  { name: 'CSV does not quote values containing commas',
    find: "if (/[\",\\n\\r]/.test(s)) return '\"' + s.replace(/\"/g, '\"\"') + '\"';",
    to:   "if (/[\"\\n\\r]/.test(s)) return '\"' + s.replace(/\"/g, '\"\"') + '\"';" },

  { name: 'CSV drops the UTF-8 BOM',
    find: "return '\\ufeff' + [head.map(csvCell).join(',')]",
    to:   "return '' + [head.map(csvCell).join(',')]" },

  // Equivalent mutation, kept as documentation: csvCell already maps null and
  // undefined to an empty cell, so removing this guard changes no behaviour.
  // No test can catch it, and none should be written to try.
  { name: 'CSV drops the redundant score type guard (equivalent)',
    find: "(typeof h.score === 'number') ? h.score : ''",
    to:   "h.score", equivalent: true },

  // --- Portfolio statistics ---
  { name: 'Average includes unscored applications as zero',
    find: "var scored = source.filter(function (h) { return typeof h.score === 'number'; });",
    to:   "var scored = source.slice();" },

  // --- Prompt invariants ---
  { name: 'Section headers no longer forced to English',
    find: "keep the section header lines themselves in English",
    to:   "use whatever header language you prefer" },

  { name: 'Model allowed to guess an unreachable role',
    find: "do NOT guess the role from the URL text",
    to:   "feel free to infer the role from the URL text" },

  { name: 'Confidence section may invent generic caveats',
    find: "Do not manufacture doubt to fill this section",
    to:   "Fill this section generously" },

  { name: 'Language decision may consider the CV',
    find: "Decide the output language from the JOB POSTING ONLY",
    to:   "Decide the output language from the documents" }
];

let caught = 0, survived = 0, equivalent = 0;
const survivors = [];

// Sanity check first. If the suite does not pass on unmodified code, every
// mutation will "fail" it and the score will read 100% for the wrong reason.
// That happened once: a missing constant made the suite crash on load, and the
// run reported a perfect score while testing nothing at all.
try {
  execSync('node test-suite.js', { stdio: 'pipe' });
} catch (e) {
  console.error('\x1b[31mBaseline failed: the suite does not pass on unmodified code.\x1b[0m');
  console.error('Fix that first — mutation results are meaningless until it does.\n');
  const out = (e.stdout || Buffer.from('')).toString() + (e.stderr || Buffer.from('')).toString();
  console.error(out.split('\n').slice(-12).join('\n'));
  process.exit(1);
}
console.log('Baseline passes on unmodified code.\n');

console.log('Running ' + mutations.length + ' mutations\n');

mutations.forEach((m, i) => {
  const n = String(i + 1).padStart(2, ' ');

  if (original.indexOf(m.find) === -1) {
    console.log(`  ${n}. \x1b[33m⊘ SKIPPED\x1b[0m  ${m.name}  (anchor not found)`);
    return;
  }

  fs.writeFileSync(FILE, original.replace(m.find, m.to));

  let failed = false;
  try {
    execSync('node test-suite.js', { stdio: 'pipe' });
  } catch (e) {
    failed = true;   // non-zero exit means the suite caught it
  }

  if (failed) {
    caught++;
    console.log(`  ${n}. \x1b[32m✓ caught\x1b[0m    ${m.name}`);
  } else if (m.equivalent) {
    equivalent++;
    console.log(`  ${n}. \x1b[36m= equivalent\x1b[0m ${m.name}`);
  } else {
    survived++;
    survivors.push(m.name);
    console.log(`  ${n}. \x1b[31m✗ SURVIVED\x1b[0m  ${m.name}`);
  }

  fs.writeFileSync(FILE, original);
});

// Confirm the file is byte-identical to where we started.
const restored = fs.readFileSync(FILE, 'utf8');
console.log('\n' + '─'.repeat(58));
console.log('File restored intact: ' + (restored === original ? 'yes' : 'NO — RESTORE FAILED'));
console.log(`Caught ${caught}, survived ${survived}, equivalent ${equivalent}`);
console.log(`Mutation score ${Math.round(caught / (caught + survived) * 100)}% (equivalents excluded, as they are uncatchable by definition)`);
if (survivors.length) {
  console.log('\nCoverage gaps — these breakages went unnoticed:');
  survivors.forEach(s => console.log('  • ' + s));
}
