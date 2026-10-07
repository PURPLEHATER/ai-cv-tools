#!/usr/bin/env node
/**
 * Mutation testing for cv-screen-artifact.html.
 *
 * Introduces one deliberate defect at a time and checks the suite notices.
 * A SURVIVING mutation is a coverage gap: the code was broken and the tests
 * said nothing.
 *
 * The mutations are weighted toward the failures that would matter most in
 * this tool — a candidate silently vanishing, a requirement silently passing,
 * a scoring rule quietly widening — rather than toward easy syntactic ones.
 */

const fs = require('fs');
const { execSync } = require('child_process');

const FILE = 'cv-screen-artifact.html';
const SUITE = 'cv-screen-test.js';
const original = fs.readFileSync(FILE, 'utf8');

const mutations = [
  // --- Section parsing (shared, extracted logic) ---
  { name: 'Header regex loses case-insensitivity',
    find: "')\\\\s*[:\\\\-\\u2013]?\\\\s*', 'gim');",
    to:   "')\\\\s*[:\\\\-\\u2013]?\\\\s*', 'gm');" },

  { name: 'Header regex loses line anchoring',
    find: "var pattern = new RegExp('^\\\\s*(' + escaped.join('|')",
    to:   "var pattern = new RegExp('\\\\s*(' + escaped.join('|')" },

  // --- CV structure ---
  { name: 'Sentences accepted as CV headings',
    find: "if (/[.!?]$/.test(t)) return false;",
    to:   "" },

  { name: 'Bullet marker not stripped',
    find: "return line.replace(/^\\s*[-\\u2022\\u2013*\\u00b7]\\s+/, '').trim();",
    to:   "return line.trim();" },

  // --- Template detection ---
  { name: 'Template placeholders treated as section headings',
    find: "if (f0 === '[' || f0 === '<' || f0 === '(' || f0 === '\\u007b') return;",
    to:   "" },

  { name: 'Template heading length guard removed',
    find: "if (!t || t.length > 40) return;",
    to:   "if (!t) return;" },

  // --- Score handling ---
  { name: 'Score not clamped to 100',
    find: "return m ? Math.max(0, Math.min(100, parseInt(m[1], 10))) : null;",
    to:   "return m ? parseInt(m[1], 10) : null;" },

  // --- Coverage parsing: the matrix depends entirely on this ---
  { name: 'Short coverage string defaults to met instead of not-evidenced',
    find: "for (var i = 0; i < count; i++) out.push(letters[i] || 'N');",
    to:   "for (var i = 0; i < count; i++) out.push(letters[i] || 'M');" },

  { name: 'Coverage accepts any letter, not just M/A/N',
    find: "String(code || '').toUpperCase().replace(/[^MAN]/g, '').split('')",
    to:   "String(code || '').toUpperCase().split('')" },

  { name: 'Coverage stops being case-insensitive',
    find: "String(code || '').toUpperCase().replace(/[^MAN]/g, '')",
    to:   "String(code || '').replace(/[^MAN]/g, '')" },

  // --- Screening line parsing ---
  { name: 'Non-numeric scores accepted as NaN',
    find: "if (!Number.isFinite(idx) || !Number.isFinite(score)) return;",
    to:   "" },

  { name: 'Out-of-range CV ids no longer rejected',
    find: "      var f = batch[idx - 1];\n      if (!f) return;",
    to:   "      var f = batch[idx - 1] || batch[0];" },

  // --- Silent omission: the failure class that matters most here ---
  { name: 'Deck truncates the candidate list to 20',
    find: "var body = rows.map(function (r, i) {",
    to:   "var body = rows.slice(0, 20).map(function (r, i) {" },

  { name: 'Matrix slide truncates the candidate list',
    find: "var mb = rows.map(function (r) {",
    to:   "var mb = rows.slice(0, 20).map(function (r) {" },

  { name: 'Deck tables stop paginating',
    find: "autoPage: true, autoPageRepeatHeader: true",
    to:   "autoPage: false" },

  // --- Glossary parsing ---
  { name: 'Glossary lines without a separator accepted',
    find: "if (parts.length < 2 || !parts[0]) return null;",
    to:   "if (!parts[0]) return null;" },

  { name: 'Glossary no longer capped',
    find: "}).filter(Boolean).slice(0, 20);",
    to:   "}).filter(Boolean);" },

  // --- Prompt discipline: scoring fairness ---
  { name: 'Scoring may consider how well the CV is written',
    find: "Do not score on how well written the CV is",
    to:   "Consider how well written the CV is" },

  { name: 'Missing evidence may be read as a judgement of the person',
    find: "that is missing evidence, not a negative judgement of the candidate",
    to:   "count that against the candidate" },

  { name: 'Adjacency no longer restrained',
    find: "Use A sparingly and only where the transfer is genuine.",
    to:   "Use A generously." },

  { name: 'Adjacency no longer needs justifying',
    find: "adjacent explains every A you gave",
    to:   "adjacent may be left blank" },

  // --- Prompt discipline: submission honesty ---
  { name: 'Seniority inflation permitted',
    find: "do not inflate seniority",
    to:   "emphasise seniority" },

  { name: 'Template example text may leak into output',
    find: "never carry template example text through into the output",
    to:   "template example text may be kept" },

  { name: 'Missing template sections may be invented',
    find: "omit that section rather than inventing content",
    to:   "fill that section with plausible content" },

  // --- Prompt discipline: the ask panel ---
  { name: 'Questions may be answered from inference',
    find: "Answer using ONLY what the CV states",
    to:   "Answer as best you can" },

  { name: 'Experience may be inferred from a job title',
    find: "Do not infer experience from a job title",
    to:   "Infer experience from the job title where reasonable" },

  // --- Requirement extraction ---
  { name: 'Unverifiable soft requirements become matrix columns',
    find: "Skip soft requirements like",
    to:   "Include soft requirements like" },

  { name: 'Requirement list no longer capped at ten',
    find: "at most 10 lines",
    to:   "as many lines as needed" },

  // --- Human oversight ---
  { name: 'Shortlist becomes a filter rather than a selection',
    find: "rows.forEach(function (r, i) {",
    to:   "rows.slice(0, n).forEach(function (r, i) {" },

  { name: 'Tailoring fires automatically after screening',
    find: "      renderRanking(rows, brief);",
    to:   "      renderRanking(rows, brief);\n      tailorSelected(rows.slice(0, 10), brief, $('batch-output'));" }
];

let caught = 0, survived = 0, equivalent = 0;
const survivors = [];

// A crashing suite exits non-zero for every mutation and reports a false 100%.
try {
  execSync('node ' + SUITE, { stdio: 'pipe' });
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
    execSync('node ' + SUITE, { stdio: 'pipe' });
  } catch (e) {
    failed = true;
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

const restored = fs.readFileSync(FILE, 'utf8');
console.log('\n' + '─'.repeat(58));
console.log('File restored intact: ' + (restored === original ? 'yes' : 'NO — RESTORE FAILED'));
console.log(`Caught ${caught}, survived ${survived}, equivalent ${equivalent}`);
console.log(`Mutation score ${Math.round(caught / (caught + survived) * 100)}%`);
if (survivors.length) {
  console.log('\nCoverage gaps — these breakages went unnoticed:');
  survivors.forEach(s => console.log('  • ' + s));
}
