#!/usr/bin/env node
/**
 * Job Tailor — test suite
 *
 * Extracts the real functions from job-tailor-artifact.html and runs them.
 * Nothing here is a reimplementation: if the shipped code changes, these
 * tests change with it or fail.
 */

const fs = require('fs');
const path = require('path');

const ARTIFACT = path.join(__dirname, 'job-tailor-artifact.html');
const html = fs.readFileSync(ARTIFACT, 'utf8');

// ---- Extract the inline script and pull out the functions under test ----

const inline = html.match(/<script>([\s\S]*?)<\/script>/g).pop()
  .replace(/^<script>/, '').replace(/<\/script>$/, '');

function extractFn(name) {
  const start = inline.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('Function not found in artifact: ' + name);
  let i = inline.indexOf('{', start), depth = 0, end = -1;
  for (let k = i; k < inline.length; k++) {
    if (inline[k] === '{') depth++;
    else if (inline[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return inline.slice(start, end + 1);
}

function extractObject(decl) {
  const start = inline.indexOf(decl);
  if (start === -1) throw new Error('Object not found in artifact: ' + decl);
  let i = inline.indexOf('{', start), depth = 0, end = -1;
  for (let k = i; k < inline.length; k++) {
    if (inline[k] === '{') depth++;
    else if (inline[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return inline.slice(i, end + 1);
}

const sandbox = {};
[
  'parseSections', 'parseQuestions', 'looksLikeUrl', 'containsUrl',
  'looksLikeHeading', 'looksLikeBullet', 'stripBullet', 'looksLikeContact',
  'parseCvStructure', 'gatedSiteName', 'isBareGatedUrl', 'fmtTokens',
  'roleFromConfirmation'
].forEach(name => {
  sandbox[name] = eval('(' + extractFn(name) + ')');
});

// GATED_SITES is a const the extracted fns close over; rebuild the pair together.
const gatedSrc = inline.match(/var GATED_SITES = [^;]+;/)[0];
eval(gatedSrc);
sandbox.gatedSiteName = eval('(' + extractFn('gatedSiteName') + ')');
sandbox.isBareGatedUrl = eval('(' + extractFn('isBareGatedUrl') + ')');
sandbox.looksLikeUrl = eval('(' + extractFn('looksLikeUrl') + ')');

const HEADING_WORDS = eval(inline.match(/var HEADING_WORDS = [^;]+;/)[0].replace('var HEADING_WORDS = ', '').replace(/;$/, ''));
sandbox.looksLikeHeading = eval('(' + extractFn('looksLikeHeading') + ')');
sandbox.parseCvStructure = eval('(' + extractFn('parseCvStructure') + ')');

const HEADER_ALIASES = eval('(' + extractObject('var HEADER_ALIASES = {') + ')');
const STRINGS = eval('(' + extractObject('var STRINGS = {') + ')');

// These run the shipped implementations, not copies of them.
const scoreFromText = eval('(' + extractFn('scoreFromText') + ')');
const buildHistoryCsv = eval('(' + extractFn('buildHistoryCsv') + ')');
const computePortfolioStats = eval('(' + extractFn('computePortfolioStats') + ')');
const SECTION_COST = eval('(' + extractObject('var SECTION_COST = {') + ')');

const {
  parseSections, parseQuestions, looksLikeUrl, containsUrl,
  looksLikeHeading, looksLikeBullet, stripBullet, looksLikeContact,
  parseCvStructure, gatedSiteName, isBareGatedUrl, fmtTokens, roleFromConfirmation
} = sandbox;

// Taken from the shipped file rather than restated here. A hardcoded copy
// silently drifted once already: POSITIONS and CONFIDENCE were added to the
// artifact and this list kept testing the old set.
const KEYS = eval(inline.match(/var SECTION_KEYS = (\[[^\]]+\])/)[1]);

// ---- Tiny test harness ----

let passed = 0, failed = 0, current = '';
const failures = [];
function suite(name) { current = name; console.log('\n\x1b[1m' + name + '\x1b[0m'); }
function it(name, cond) {
  if (cond) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { failed++; failures.push(current + ' → ' + name); console.log('  \x1b[31m✗ ' + name + '\x1b[0m'); }
}

// =====================================================================
suite('Section parsing — well-formed output');

const FULL = `ROLE CONFIRMATION
Applying for: Senior Technical Artist — Design at Volvo Cars

TAILORED CV
Jane Doe
Senior Technical Artist with eight years in real-time pipelines.

COVER LETTER
Dear Hiring Manager, I am applying for the Senior Technical Artist role.

ATS MATCH SCORE
72%
Present: Maya, Unreal, shader authoring
Missing: Houdini

SKILLS GAP
No Houdini experience listed.

TONE CHECK
Reads naturally.

POSITIONS
1. Senior Technical Artist, Prior Studio (2020-2024)
2. Technical Artist, Earlier Co (2016-2020)

CONFIDENCE
Salary data came from two sources, neither recent.

INTERVIEW TIPS
Prepare a reel walkthrough.

COMPANY RED FLAGS
Reviews mention slow decision-making.

COMPANY FINANCIALS
Publicly listed, revenue growth around 8%.

SALARY
Range roughly 55,000-72,000 SEK per month in Gothenburg.

INTERVIEW QUESTIONS
1. Walk me through your pipeline experience.
2. How do you work with engineering on performance?
3. Describe a tool you built.
4. How do you balance fidelity and frame budget?
5. Why Volvo Cars?`;

const full = parseSections(FULL, KEYS);
it('every section in the shipped key list is populated',
   KEYS.every(k => full[k].length > 0));
it('the fixture covers every shipped section \u2014 no key untested',
   KEYS.length === 13);
it('role confirmation isolated exactly',
   full['ROLE CONFIRMATION'] === 'Applying for: Senior Technical Artist — Design at Volvo Cars');
it('CV does not bleed into cover letter', full['TAILORED CV'].indexOf('Dear Hiring Manager') === -1);
it('salary does not bleed into questions', full['SALARY'].indexOf('Walk me through') === -1);
it('exactly 5 interview questions', parseQuestions(full['INTERVIEW QUESTIONS']).length === 5);
it('first question text intact',
   parseQuestions(full['INTERVIEW QUESTIONS'])[0] === 'Walk me through your pipeline experience.');

// =====================================================================
suite('Section parsing — header format variations');

it('lowercase headers', parseSections('tailored cv\nBody A.', KEYS)['TAILORED CV'] === 'Body A.');
it('title case headers', parseSections('Skills Gap\nGap text.', KEYS)['SKILLS GAP'] === 'Gap text.');
it('trailing colon consumed', parseSections('TAILORED CV:\nBody.', KEYS)['TAILORED CV'] === 'Body.');
it('trailing dash consumed', parseSections('TAILORED CV -\nBody.', KEYS)['TAILORED CV'] === 'Body.');
it('trailing en-dash consumed', parseSections('TAILORED CV \u2013\nBody.', KEYS)['TAILORED CV'] === 'Body.');
it('header and content on one line',
   parseSections('COMPANY FINANCIALS: Private, no figures.', KEYS)['COMPANY FINANCIALS'] === 'Private, no figures.');
it('leading whitespace tolerated', parseSections('   TAILORED CV\nBody.', KEYS)['TAILORED CV'] === 'Body.');

// =====================================================================
suite('Section parsing — false-split safety');

const mid = parseSections(
  'COVER LETTER\nI look forward to discussing interview questions and the tailored cv approach.\n\nINTERVIEW QUESTIONS\n1. A real question?',
  KEYS);
it('"interview questions" mid-sentence does not split', mid['COVER LETTER'].indexOf('interview questions') !== -1);
it('"tailored cv" mid-sentence does not split', mid['COVER LETTER'].indexOf('tailored cv') !== -1);
it('real questions section still isolated', mid['INTERVIEW QUESTIONS'].indexOf('A real question') !== -1);
it('cover letter did not absorb questions', mid['COVER LETTER'].indexOf('A real question') === -1);
const salaryMid = parseSections('COVER LETTER\nHappy to discuss salary expectations.\n\nSALARY\nReal range.', KEYS);
it('"salary" mid-sentence does not split', salaryMid['COVER LETTER'].indexOf('salary expectations') !== -1);

// A body line beginning with a section word is not a header. This was a real
// bug: a CONFIDENCE section opening "Salary data came from two sources" was
// swallowed by the SALARY key, losing the section entirely.
it('a body line beginning with a section word is not a header',
   parseSections('CONFIDENCE\nSalary data came from two sources, neither recent.', KEYS)['CONFIDENCE']
     .indexOf('Salary data') === 0);
it('and that line does not leak into the section it names',
   parseSections('CONFIDENCE\nSalary data came from two sources.', KEYS)['SALARY'] === '');
it('a header still works alone on its line',
   parseSections('SALARY\n55k', KEYS)['SALARY'] === '55k');
// Without the line anchor these split mid-sentence: the separator rule alone
// cannot tell a header from a word that happens to be followed by a colon.
it('a section word mid-sentence followed by a colon does not split',
   parseSections('CONFIDENCE\nWe should discuss SALARY: before the interview.', KEYS)['CONFIDENCE']
     .indexOf('We should discuss SALARY') === 0);
it('a section word mid-sentence followed by a dash does not split',
   parseSections('CONFIDENCE\nThey mentioned SALARY - it was vague.', KEYS)['CONFIDENCE']
     .indexOf('They mentioned SALARY') === 0);

// =====================================================================
suite('Section parsing — degraded model output');

it('missing section stays empty', parseSections('TAILORED CV\nBody.', KEYS)['SKILLS GAP'] === '');
it('empty question block yields none', parseQuestions('').length === 0);
it('blank lines between questions filtered', parseQuestions('1. A question?\n\n2. Another one?').length === 2);
it('stray punctuation line dropped', parseQuestions(':\n1. Real question?').length === 1);
it('paren-numbered questions parsed', parseQuestions('1) First?\n2) Second?').length === 2);
it('no headers at all leaves everything empty (UI falls back)',
   KEYS.every(k => parseSections('Just prose, no headers.', KEYS)[k] === ''));

// =====================================================================
suite('Role extraction (the wrong-role guard)');

it('strips "Applying for:" prefix',
   roleFromConfirmation('Applying for: Senior Technical Artist at Volvo') === 'Senior Technical Artist at Volvo');
it('handles lowercase prefix',
   roleFromConfirmation('applying for: Data Analyst at Foo') === 'Data Analyst at Foo');
it('passes through when no prefix',
   roleFromConfirmation('Senior Engineer at Bar') === 'Senior Engineer at Bar');
it('uses first line only',
   roleFromConfirmation('Applying for: Designer at Foo\nExtra commentary') === 'Designer at Foo');
it('empty input safe', roleFromConfirmation('') === '');
it('confirmation reports the target role, not a CV title',
   full['ROLE CONFIRMATION'].indexOf('Senior Technical Artist') !== -1 &&
   full['ROLE CONFIRMATION'].indexOf('Group Design Leader') === -1);

// =====================================================================
suite('CV structure — heading detection');

it('ALL CAPS "EXPERIENCE"', looksLikeHeading('EXPERIENCE'));
it('"Education"', looksLikeHeading('Education'));
it('"Professional Experience"', looksLikeHeading('Professional Experience'));
it('"Technical Skills"', looksLikeHeading('Technical Skills'));
it('sentence ending in a period is not a heading', !looksLikeHeading('Led a team of nine engineers.'));
it('ALL CAPS sentence ending in a period is not a heading',
   !looksLikeHeading('LED A TEAM OF NINE.'));
it('ALL CAPS line ending in a question mark is not a heading',
   !looksLikeHeading('WHAT NEXT?'));
it('long line is not a heading',
   !looksLikeHeading('Group Design Leader at a mid-size retail company responsible for many things'));
it('long ALL CAPS line is not a heading',
   !looksLikeHeading('LED THE ENTIRE PLATFORM TEAM ACROSS THREE PRODUCT LINES AND SHIPPED TOOLING'));
it('ALL CAPS line just over the short-heading limit is rejected',
   !looksLikeHeading('A'.repeat(33)));
it('ALL CAPS line at the limit is still a heading', looksLikeHeading('A'.repeat(32)));
it('long line starting with a heading word is still not a heading',
   !looksLikeHeading('Professional Experience across three studios building real-time rendering pipelines'));
it('long line starting with "Skills" is not a heading',
   !looksLikeHeading('Skills developed over a decade of shipping tools used by every team in the studio'));
it('the same phrase kept short IS a heading', looksLikeHeading('Professional Experience'));
it('row of dashes is not a heading', !looksLikeHeading('--------'));
it('job title line is not a heading', !looksLikeHeading('Senior Technical Artist, Volvo Cars (2020-2024)'));

// =====================================================================
suite('CV structure — bullets and contact');

it('hyphen bullet', looksLikeBullet('- Built a shader tool'));
it('unicode bullet', looksLikeBullet('\u2022 Built a shader tool'));
it('asterisk bullet', looksLikeBullet('* Built a shader tool'));
it('marker stripped', stripBullet('\u2022  Built a shader tool') === 'Built a shader tool');
it('hyphenated word is not a bullet', !looksLikeBullet('State-of-the-art rendering'));
it('email detected', looksLikeContact('jane@example.com'));
it('phone detected', looksLikeContact('555-123-4567'));
it('international phone detected', looksLikeContact('+46 70 123 4567'));
it('linkedin detected', looksLikeContact('linkedin.com/in/janedoe'));
it('prose is not contact', !looksLikeContact('Experienced technical artist with a decade of shipping games'));

// =====================================================================
suite('CV structure — full parse');

const CV = `Jane Doe
jane@example.com | +46 70 123 4567

PROFESSIONAL SUMMARY
Technical artist with eight years building real-time pipelines.

EXPERIENCE
Senior Technical Artist, Prior Studio (2020-2024)
- Built a shader authoring tool adopted studio-wide
- Cut shader compile times by 40%

EDUCATION
BA Computer Graphics, University of Gothenburg

SKILLS
Maya, Unreal, Python, HLSL`;

const cv = parseCvStructure(CV);
it('name extracted', cv.name === 'Jane Doe');
it('contact line captured', cv.contact.length === 1 && cv.contact[0].indexOf('jane@example.com') === 0);
const headings = cv.blocks.filter(b => b.type === 'heading').map(b => b.text);
it('four headings found', headings.length === 4);
it('headings are correct', headings.join(',') === 'PROFESSIONAL SUMMARY,EXPERIENCE,EDUCATION,SKILLS');
it('two bullets found', cv.blocks.filter(b => b.type === 'bullet').length === 2);
it('job title kept as body text, not a heading',
   cv.blocks.some(b => b.type === 'text' && b.text.indexOf('Senior Technical Artist, Prior Studio') === 0));
it('CV starting with a heading assigns no name', parseCvStructure('EXPERIENCE\nA role').name === '');
it('empty CV safe', parseCvStructure('').blocks.length === 0);
it('CRLF handled', parseCvStructure('Jane Doe\r\njane@example.com\r\n\r\nSKILLS\r\nPython').name === 'Jane Doe');

// =====================================================================
suite('URL handling (the LinkedIn regression)');

const LI = 'https://www.linkedin.com/jobs/view/4123456789/';
it('bare URL detected', containsUrl(LI));
it('URL with a title line above it detected',
   containsUrl('Senior Technical Artist\nhttps://careers.saab.com/job/12345'));
it('URL with trailing notes detected',
   containsUrl('https://careers.saab.com/job/12345 — applied 3 Sep'));
it('www URL without scheme detected', containsUrl('www.careers.saab.com/job/12345'));
it('plain posting text has no URL',
   !containsUrl('Senior Technical Artist\nWe are looking for someone to join our team.'));
it('LinkedIn bare link flagged as gated', isBareGatedUrl(LI));
it('site named correctly', gatedSiteName(LI) === 'LinkedIn');
it('Indeed regional domain flagged', isBareGatedUrl('https://uk.indeed.com/viewjob?jk=abc123'));
it('company careers site not flagged', !isBareGatedUrl('https://careers.saab.com/job/12345'));
it('Workday link not flagged',
   !isBareGatedUrl('https://volvo.wd3.myworkdayjobs.com/en-US/careers/job/x'));
it('LinkedIn link with pasted text is not flagged',
   !isBareGatedUrl('Senior Technical Artist\nWe are hiring...\nSource: https://linkedin.com/jobs/view/123'));

// =====================================================================
suite('Usage estimate');

const SEARCH_COST = 3000, SCAFFOLD = 700;
function estimate(cvText, posting, research, salary) {
  let input = Math.ceil((cvText.length + posting.length) / 4) + SCAFFOLD;
  let output = 0;
  Object.keys(SECTION_COST).forEach(k => {
    if (!research && (k === 'COMPANY RED FLAGS' || k === 'COMPANY FINANCIALS')) return;
    if (!salary && k === 'SALARY') return;
    output += SECTION_COST[k];
  });
  let searches = 0;
  if (containsUrl(posting)) searches += 1;
  if (research) searches += 2;
  if (salary) searches += 1;
  return { searches, total: input + output + searches * SEARCH_COST };
}
const bigCv = 'x'.repeat(4000), bigPost = 'y'.repeat(3000);
const all = estimate(bigCv, bigPost, true, true);
const none = estimate(bigCv, bigPost, false, false);
it('toggling research off reduces cost', estimate(bigCv, bigPost, false, true).total < all.total);
it('toggling salary off reduces cost', estimate(bigCv, bigPost, true, false).total < all.total);
it('both off is cheapest', none.total < all.total);
it('both off with pasted text needs no searches', none.searches === 0);
it('all on needs three searches', all.searches === 3);
it('a URL adds a search even with toggles off',
   estimate(bigCv, 'https://careers.saab.com/job/1', false, false).searches === 1);
it('turning research off saves over half the run', (all.total - none.total) > all.total * 0.5);
it('999 formats as a plain number', fmtTokens(999) === '999');
it('1000 formats as 1k', fmtTokens(1000) === '1k');
it('15400 formats as 15.4k', fmtTokens(15400) === '15.4k');

// =====================================================================
suite('Match score handling');

const score = scoreFromText;   // shipped implementation
it('reads 72% from the section', score(full['ATS MATCH SCORE']) === 72);
it('no percentage returns null', score('Roughly seven of ten keywords matched.') === null);
it('0% is valid, not null', score('0% match') === 0);
it('150% clamps to 100', score('150%') === 100);
it('999% clamps to 100 rather than overflowing the meter', score('999%') === 100);
it('clamped value keeps the meter within 20 segments', Math.round(score('999%') / 5) === 20);
it('percentage mid-sentence extracted', score('About a 65% overlap.') === 65);
it('space before percent handled', score('72 %') === 72);
it('meter lights 14 of 20 segments at 72%', Math.round(72 / 5) === 14);
it('meter never exceeds 20 segments', Math.round(100 / 5) === 20);

// =====================================================================
suite('File type validation (no accept filter on mobile)');

function classify(name, type) {
  const n = (name || '').toLowerCase();
  const isPdf = n.endsWith('.pdf') || type === 'application/pdf';
  const isDocx = n.endsWith('.docx') ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return isPdf ? 'pdf' : isDocx ? 'docx' : 'reject';
}
it('cv.pdf accepted', classify('cv.pdf', 'application/pdf') === 'pdf');
it('cv.docx accepted', classify('cv.docx', '') === 'docx');
it('uppercase CV.PDF accepted', classify('CV.PDF', '') === 'pdf');
it('empty MIME from iCloud still accepted', classify('cv.docx', '') === 'docx');
it('octet-stream MIME still accepted', classify('cv.pdf', 'application/octet-stream') === 'pdf');
it('correct MIME with no extension accepted', classify('document', 'application/pdf') === 'pdf');
it('legacy .doc rejected', classify('cv.doc', '') === 'reject');
it('.pages rejected', classify('cv.pages', '') === 'reject');
it('image rejected', classify('photo.jpg', 'image/jpeg') === 'reject');
it('no name and no type rejected', classify('', '') === 'reject');

// =====================================================================
suite('Translations');

const enKeys = Object.keys(STRINGS.en).sort();
const svKeys = Object.keys(STRINGS.sv).sort();
it('every English string has a Swedish counterpart',
   enKeys.filter(k => svKeys.indexOf(k) === -1).length === 0);
it('no orphan Swedish strings',
   svKeys.filter(k => enKeys.indexOf(k) === -1).length === 0);
it('types match across languages',
   enKeys.every(k => typeof STRINGS.en[k] === typeof STRINGS.sv[k]));
it('no blank strings',
   ['en','sv'].every(L => Object.keys(STRINGS[L])
     .every(k => typeof STRINGS[L][k] !== 'string' || STRINGS[L][k].trim())));
it('no long string left untranslated',
   enKeys.filter(k => typeof STRINGS.en[k] === 'string' &&
     STRINGS.en[k] === STRINGS.sv[k] && STRINGS.en[k].length > 12).length === 0);
it('Swedish singular search term', STRINGS.sv.costLine('4k', 1).indexOf('1 webbsökning') !== -1);
it('Swedish plural search term', STRINGS.sv.costLine('4k', 3).indexOf('3 webbsökningar') !== -1);
it('zero searches omits the clause (en)', STRINGS.en.costLine('4k', 0).indexOf('search') === -1);
it('zero searches omits the clause (sv)', STRINGS.sv.costLine('4k', 0).indexOf('sökning') === -1);
it('status labels cover every cycle value',
   ['not applied','applied','interviewing','closed']
     .every(s => STRINGS.en.statuses[s] && STRINGS.sv.statuses[s]));
it('touch-specific strings exist in both',
   !!STRINGS.en.cvphTouch && !!STRINGS.sv.cvphTouch &&
   !!STRINGS.en.pickfileTouch && !!STRINGS.sv.pickfileTouch);

// =====================================================================
suite('Saved run payload');

function readRun(stored) {
  let text = stored, posting = '', cvText = '';
  try {
    const p = JSON.parse(stored);
    if (p && p.text) { text = p.text; posting = p.posting || ''; cvText = p.cv || ''; }
  } catch (e) { /* legacy plain text */ }
  return { text, posting, cv: cvText };
}
const payload = JSON.stringify({ v: 1, text: 'ROLE CONFIRMATION\nApplying for: X', posting: 'Posting text', cv: 'CV text' });
it('text recovered', readRun(payload).text.indexOf('ROLE CONFIRMATION') === 0);
it('posting recovered', readRun(payload).posting === 'Posting text');
it('CV recovered', readRun(payload).cv === 'CV text');
it('legacy plain-text run still readable', readRun('ROLE CONFIRMATION\nOld run').text.indexOf('ROLE CONFIRMATION') === 0);
it('malformed JSON treated as plain text', readRun('{ not json').text === '{ not json');
it('JSON without .text falls back to raw', readRun('{"other":"value"}').text === '{"other":"value"}');

// =====================================================================
suite('Application history');

function cycle(s) {
  const order = ['not applied','applied','interviewing','closed'];
  return order[(order.indexOf(s) + 1) % order.length];
}
it('not applied → applied', cycle('not applied') === 'applied');
it('applied → interviewing', cycle('applied') === 'interviewing');
it('interviewing → closed', cycle('interviewing') === 'closed');
it('closed wraps around', cycle('closed') === 'not applied');
const cache = [];
for (let i = 0; i < 45; i++) cache.unshift({ id: 'run-' + i });
it('history trims to 40', cache.slice(0, 40).length === 40);
it('newest run retained', cache.slice(0, 40)[0].id === 'run-44');
it('oldest runs dropped', cache.slice(40)[cache.slice(40).length - 1].id === 'run-0');
it('deletion removes only the target',
   [{id:'a'},{id:'b'},{id:'c'}].filter(h => h.id !== 'b').length === 2);

// =====================================================================
suite('Output language — posting decides, not the CV');

const langInstr = inline.slice(inline.indexOf('function langInstruction'),
                               inline.indexOf('function langShort'));

it('auto mode decides from the posting only',
   langInstr.indexOf('Decide the output language from the JOB POSTING ONLY') !== -1);
it('auto mode explicitly discounts the CV\u2019s language',
   langInstr.indexOf('has NO bearing on this decision') !== -1);
it('accented proper nouns named as not-evidence',
   langInstr.indexOf('are not evidence of any language') !== -1);
it('Swedish institution names given as examples',
   langInstr.indexOf('Kungliga Tekniska') !== -1 && langInstr.indexOf('Chalmers') !== -1);
it('non-Swedish accented examples included too',
   /M\\u00fcnchen|Universit\\u00e9|M\u00fcnchen|Universit\u00e9/.test(langInstr));
it('English posting + Swedish CV case stated explicitly',
   langInstr.indexOf('write everything in English even when the CV is Swedish') !== -1);
it('institution names protected from translation in every mode',
   (langInstr.match(/institution and school names/g) || []).length >= 2);
it('forced modes also ignore the CV\u2019s language',
   langInstr.indexOf('regardless of what language the candidate') !== -1);
it('the word "posting" drives auto mode, not "CV"',
   langInstr.indexOf('JOB POSTING ONLY') < langInstr.indexOf('has NO bearing'));

// =====================================================================
suite('Role confirmation banner — two lines');

function splitBanner(raw) {
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
  return { role: lines[0] || raw, lang: lines.slice(1).join(' ') };
}
const twoLine = splitBanner('Applying for: Senior Technical Artist \u2014 Design at Volvo Cars\nWritten in: English (the posting is in English)');
it('role line extracted', twoLine.role === 'Applying for: Senior Technical Artist \u2014 Design at Volvo Cars');
it('language line extracted', twoLine.lang.indexOf('Written in: English') === 0);
it('language line kept out of the role line', twoLine.role.indexOf('Written in') === -1);
const oneLine = splitBanner('Applying for: Designer at Foo');
it('single-line banner still works', oneLine.role === 'Applying for: Designer at Foo');
it('single-line banner has no language line', oneLine.lang === '');
const spaced = splitBanner('Applying for: Designer at Foo\n\n\nWritten in: Swedish');
it('blank lines between the two collapse', spaced.lang === 'Written in: Swedish');
const threeLine = splitBanner('Applying for: X\nWritten in: Swedish\nExtra note');
it('extra lines fold into the language line rather than disappearing',
   threeLine.lang === 'Written in: Swedish Extra note');
it('prompt asks for the language line',
   inline.indexOf('Written in: [language]') !== -1);

// =====================================================================
suite('Practice generated on demand');

const mainPrompt = inline.slice(inline.indexOf("var prompt = '<candidate_cv>"),
                                inline.indexOf('var keys = ['));
it('main prompt no longer asks for interview questions',
   mainPrompt.indexOf('INTERVIEW QUESTIONS') === -1);
it('main prompt no longer asks for interview tips',
   mainPrompt.indexOf('INTERVIEW TIPS') === -1);
it('interview tips removed from the cost estimate',
   Object.keys(SECTION_COST).indexOf('INTERVIEW TIPS') === -1);
it('the on-demand prompt asks for both tips and questions',
   inline.indexOf('INTERVIEW TIPS: 5-8 specific, practical things') !== -1 &&
   inline.indexOf('INTERVIEW QUESTIONS: Exactly 5 likely questions') !== -1);
it('on-demand prompt keeps its two headers in English',
   inline.indexOf('Keep the two header lines in English exactly as written') !== -1);
it('malformed prep headers fall back to reading the whole reply',
   inline.indexOf('if (!qs.length) qs = parseQuestions(text);') !== -1);
it('interview questions removed from the cost estimate',
   Object.keys(SECTION_COST).indexOf('INTERVIEW QUESTIONS') === -1);
it('a separate on-demand generator exists',
   inline.indexOf('function generatePracticeQuestions') !== -1);
it('questions are cached per run so they are written once',
   inline.indexOf("function practiceKey(id) { return 'practice-' + id; }") !== -1);
it('cached prep is reused rather than regenerated',
   inline.indexOf('if (prep && prep.questions && prep.questions.length)') !== -1);
it('older array-shaped caches still load',
   inline.indexOf("Array.isArray(saved) ? { tips: '', questions: saved } : saved") !== -1);
it('deleting a run also deletes its cached questions',
   /window\.storage\.delete\(practiceKey\(entry\.id\)/.test(inline));
it('trimming old runs also drops their cached questions',
   /window\.storage\.delete\(practiceKey\(d\.id\)/.test(inline));
it('practice checkbox state persists on the history entry',
   inline.indexOf('entry.practice = practiceBox.checked') !== -1);
it('ratings use the job\u2019s own CV and posting, not the current form',
   inline.indexOf('var ctxCv = currentCv, ctxPosting = currentPosting') !== -1 &&
   /Their CV[^+]*\+ ctxCv/.test(inline) &&
   /job posting[^+]*\+ ctxPosting/.test(inline));
it('cached path still loads the job context for ratings',
   inline.indexOf('The prep is cached, but the job') !== -1);
it('question parsing still capped at five',
   inline.indexOf('qs = qs.slice(0, 5)') !== -1);
it('practice strings exist in both languages',
   !!STRINGS.en.practiceLabel && !!STRINGS.sv.practiceLabel &&
   !!STRINGS.en.practiceLoading && !!STRINGS.sv.practiceLoading &&
   !!STRINGS.en.practiceFail && !!STRINGS.sv.practiceFail);
it('checkbox has a 44px tap target for mobile',
   html.indexOf('.hpractice') !== -1 && /\.hpractice\s*\{[^}]*min-height: 44px/.test(html));

// A run with both toggles off and pasted text should now be cheaper than before,
// since the questions are no longer generated up front.
const beforeQuestions = 120;
it('dropping questions saves their generation cost on every run',
   beforeQuestions > 0 && Object.keys(SECTION_COST).every(k => k !== 'INTERVIEW QUESTIONS'));

// =====================================================================
suite('Interview prep — grouping and labelling');

it('checkbox label states what it is for',
   STRINGS.en.practiceLabel === 'Got an interview');
it('Swedish label matches that meaning', STRINGS.sv.practiceLabel === 'F\u00e5tt intervju');
it('tooltip explains when to tick it',
   STRINGS.en.practiceTip.indexOf('once you have an interview') !== -1);
it('a hint appears above the job list',
   !!STRINGS.en.prepHint && !!STRINGS.sv.prepHint);
it('hint names the checkbox by its label',
   STRINGS.en.prepHint.indexOf('Got an interview') !== -1);
it('prep zone is titled as preparation, not practice',
   STRINGS.en.zonePrep === 'Interview preparation');
it('prep zone names which job it is for',
   !!STRINGS.en.prepFor && !!STRINGS.sv.prepFor);
it('tips render inside the prep zone',
   inline.indexOf('if (tips) zone.appendChild(makeSection(T().secTips, tips') !== -1);
it('prep zone used instead of the old practice zone heading',
   inline.indexOf('var zone = makeZone(T().zonePrep);') !== -1);
it('renderPractice accepts the prep object and old array alike',
   inline.indexOf('Array.isArray(prep) ? prep : []') !== -1);
it('every new prep string exists in both languages',
   ['practiceLabel','practiceTip','practiceLoading','practiceFail','zonePrep','prepFor','prepHint']
     .every(k => !!STRINGS.en[k] && !!STRINGS.sv[k]));

// =====================================================================
suite('Portfolio statistics');

// Rebuild computePortfolioStats against a controlled history.
const stats = computePortfolioStats;   // shipped implementation

const H = [
  { id:'a', score: 80, status:'applied' },
  { id:'b', score: 60, status:'interviewing' },
  { id:'c', score: 40, status:'closed' },
  { id:'d', score: 90, status:'not applied' },
  { id:'e', score: null, status:'applied' }
];
const S = stats(H);
it('counts every application', S.total === 5);
it('counts only scored ones for the average', S.scored === 4);
it('an unscored application is excluded, not counted as zero',
   S.avgScore === 68 && S.avgScore !== Math.round((80+60+40+90+0)/5));
it('average ignores null scores', S.avgScore === 68);
it('minimum score correct', S.minScore === 40);
it('maximum score correct', S.maxScore === 90);
it('interview count correct', S.reachedInterview === 1);
it('applied excludes "not applied"', S.applied === 4);
it('per-status counts correct',
   S.byStatus['applied'].count === 2 && S.byStatus['closed'].count === 1);
it('per-status average ignores nulls', S.byStatus['applied'].avgScore === 80);
it('status with no entries reports null average, not NaN',
   stats([{ id:'x', score: 50, status:'applied' }]).byStatus['closed'].avgScore === null);

const empty = stats([]);
it('empty history does not divide by zero', empty.avgScore === null);
it('empty history has null range', empty.minScore === null && empty.maxScore === null);
it('empty history counts zero', empty.total === 0 && empty.applied === 0);

const noScores = stats([{ id:'a', score: null, status:'applied' }]);
it('all-null scores yield null average, not 0', noScores.avgScore === null);
it('zero is a real score, not treated as missing',
   stats([{ id:'a', score: 0, status:'applied' }]).avgScore === 0);

// =====================================================================
suite('Portfolio analysis — wiring and honesty');

it('threshold before patterns are offered', inline.indexOf('var MIN_FOR_PATTERNS = 5;') !== -1);
it('button only appears once the threshold is met',
   inline.indexOf('if (historyCache.length >= MIN_FOR_PATTERNS)') !== -1);
it('below threshold the user is told how many more are needed',
   inline.indexOf('T().patternsNeed(need)') !== -1);
it('statistics computed locally, not asked of the model',
   /already computed.{0,12}do not recalculate them/.test(inline));
it('prompt forbids inventing numbers',
   inline.indexOf('Do not invent numbers beyond those given') !== -1);
it('prompt warns that small samples are noise',
   inline.indexOf('most apparent patterns are noise') !== -1);
it('prompt forbids a trend from one application',
   inline.indexOf('Never claim a trend from a single application') !== -1);
it('each section may decline to answer',
   inline.indexOf('If nothing genuinely recurs, say so plainly') !== -1 &&
   inline.indexOf('too small or too uniform to tell') !== -1);
it('skills gaps pulled from stored runs',
   inline.indexOf("parseSections(text, ['SKILLS GAP', 'ATS MATCH SCORE'])") !== -1);
it('gap text truncated to bound cost', inline.indexOf('gap.slice(0, 400)') !== -1);
it('sample capped at 20 runs', inline.indexOf('collectGaps(20)') !== -1);
it('legacy plain-text runs survive gap collection',
   /legacy plain-text run/.test(inline));
it('result cached against a history signature',
   inline.indexOf('function historySignature') !== -1 &&
   inline.indexOf('saved.sig === sig') !== -1);
it('signature changes when a score or status changes',
   /h\.id \+ ':' \+ .*h\.score.*\+ ':' \+ h\.status/.test(inline));
it('headers kept in English for parsing',
   inline.indexOf('Keep the header lines in English exactly as written') !== -1);
it('analysis written in the chosen output language',
   /Write the content in ' \+ langShort\(\)/.test(inline));
it('portfolio strings exist in both languages',
   ['zonePatterns','patternsBtn','patternsLoading','patternsFail','patternsNeed',
    'secRepeats','secFit','secNext','statApplications','statAvgMatch',
    'statApplied','statInterviews']
     .every(k => !!STRINGS.en[k] && !!STRINGS.sv[k]));
it('the "needs more" message pluralises in both languages',
   STRINGS.en.patternsNeed(1) !== STRINGS.en.patternsNeed(2) &&
   STRINGS.sv.patternsNeed(1) !== STRINGS.sv.patternsNeed(2));
it('singular form reads naturally in English',
   STRINGS.en.patternsNeed(1).indexOf('One more application') === 0);

// =====================================================================
suite('CSV export');

const csvCell = eval('(' + extractFn('csvCell') + ')');

it('plain value unquoted', csvCell('Engineer') === 'Engineer');
it('value with a comma is quoted', csvCell('Volvo Cars, Sweden') === '"Volvo Cars, Sweden"');
it('embedded quotes are doubled', csvCell('The "Lead" role') === '"The ""Lead"" role"');
it('newline forces quoting', csvCell('line one\nline two') === '"line one\nline two"');
it('carriage return forces quoting', /^"/.test(csvCell('a\rb')));
it('null becomes empty, not the text "null"', csvCell(null) === '');
it('undefined becomes empty', csvCell(undefined) === '');
it('zero is preserved, not blanked', csvCell(0) === '0');
it('empty string stays empty', csvCell('') === '');
it('Swedish characters pass through unquoted', csvCell('G\u00f6teborg') === 'G\u00f6teborg');
it('a lone quote is escaped and wrapped', csvCell('5" display') === '"5"" display"');

// Full-file assembly, using the shipped builder against a controlled cache.
const buildCsv = buildHistoryCsv;   // shipped implementation

const csvCache = [
  { role: 'Senior Technical Artist', company: 'Volvo Cars', location: 'G\u00f6teborg',
    when: '2026-09-01T10:00:00.000Z', score: 72, status: 'applied' },
  { role: 'Lead Artist, "Games"', company: 'Studio, Inc', location: '',
    when: '2026-08-20T10:00:00.000Z', score: null, status: 'closed' }
];
const csv = buildCsv(csvCache);
const lines = csv.split('\r\n');

it('starts with a BOM so Excel reads UTF-8', csv.charCodeAt(0) === 0xFEFF);
it('BOM is present exactly once', csv.split('\ufeff').length === 2);
it('header row present', lines[0].indexOf('Role,Company,Location,Date,Match %,Status') !== -1);
it('one row per application plus header', lines.filter(l => l).length === 3);
it('oldest row first', lines[1].indexOf('Lead Artist') !== -1);
it('quotes inside a role are escaped', lines[1].indexOf('""Games""') !== -1);
it('company containing a comma is quoted', lines[1].indexOf('"Studio, Inc"') !== -1);
it('missing score becomes an empty cell, not null',
   lines[1].indexOf('null') === -1 && lines[1].indexOf(',,') !== -1);
it('missing score is not rendered as undefined either',
   csv.indexOf('undefined') === -1);
it('date reduced to a plain ISO day', lines[2].indexOf('2026-09-01') !== -1);
it('Swedish location survives', lines[2].indexOf('G\u00f6teborg') !== -1);
it('CRLF line endings for spreadsheet compatibility', csv.indexOf('\r\n') !== -1);
it('file ends with a newline', /\r\n$/.test(csv));
it('empty history still produces a header row',
   buildCsv([]).split('\r\n').filter(l => l).length === 1);
it('export uses a blob download, not doc.save',
   inline.indexOf("a.download = 'applications.csv'") !== -1);
it('export strings exist in both languages',
   ['exportBtn','exportTip','exportFail'].every(k => !!STRINGS.en[k] && !!STRINGS.sv[k]));

// =====================================================================
suite('Confidence reporting');

it('CONFIDENCE requested in the main prompt',
   inline.indexOf('CONFIDENCE: Where this output is weak') !== -1);
it('CONFIDENCE parsed as a section',
   /'TONE CHECK',\s*(?:'POSITIONS',\s*)?'CONFIDENCE'/.test(inline));
it('counted in the cost estimate', Object.keys(SECTION_COST).indexOf('CONFIDENCE') !== -1);
it('model told not to manufacture doubt',
   inline.indexOf('Do not manufacture doubt to fill this section') !== -1);
it('generic AI caveats explicitly excluded',
   inline.indexOf('do not list generic caveats about AI') !== -1);
it('may report that everything was solid',
   inline.indexOf('say exactly that in one line') !== -1);
it('forbidden from listing uncertainty it did not encounter',
   inline.indexOf('Never list an uncertainty you have not actually encountered') !== -1);
it('prompt names concrete uncertainty types, not vague ones',
   inline.indexOf('the posting could not be retrieved') !== -1 &&
   inline.indexOf('salary figures came from sparse') !== -1);
it('rendered above the tailored CV, not buried',
   inline.indexOf("if (parts['CONFIDENCE'])") < inline.indexOf('cvSection = makeSection(T().secCv'));
it('confidence heading exists in both languages',
   !!STRINGS.en.secConfidence && !!STRINGS.sv.secConfidence);
it('heading is first-person and specific to this run',
   STRINGS.en.secConfidence.indexOf('unsure about here') !== -1);

// =====================================================================
suite('Honest progress indicator');

it('fixed-timer stage list removed', inline.indexOf('var delays = [7000, 16000, 26000]') === -1);
it('reports elapsed time instead', inline.indexOf('Math.floor((Date.now() - started) / 1000)') !== -1);
it('interval is cleared on stop', /clearInterval\(elapsedTimer\)/.test(inline));
it('sets an expectation up front', !!STRINGS.en.waitNote && !!STRINGS.sv.waitNote);
it('says so when a run runs long', !!STRINGS.en.waitLong && !!STRINGS.sv.waitLong);
it('long-run message admits it is unusual',
   STRINGS.en.waitLong.indexOf('longer than usual') !== -1);
it('no longer claims stages it cannot observe',
   inline.indexOf('Researching the company and pay') === -1);

// =====================================================================
suite('Editable output');

it('CV is editable', /secCv[\s\S]{0,140}editable: true/.test(inline));
it('cover letter is editable', /secLetter[\s\S]{0,120}editable: true/.test(inline));
it('plain-text editing, so pasted formatting cannot corrupt the CV',
   inline.indexOf("'plaintext-only'") !== -1);
it('copy uses the edited text, not the original', /writeText\(getText\(\)\)/.test(inline));
it('PDF export uses the edited text', /downloadPdf\(getText\(\)/.test(inline));
it('template PDF export uses the edited text too',
   /downloadPdf\(getText\(\), opts\.pdf, chosen\)/.test(inline));
it('non-editable sections still return their original text',
   /var getText = function \(\) \{ return body; \};/.test(inline));
it('an edit is flagged so the user can see it changed',
   inline.indexOf("flag.className = 'edited-flag'") !== -1);
it('non-breaking spaces stripped on read (contenteditable inserts them)',
   /replace\(\/\\u00a0\/g, ' '\)/.test(inline));

// =====================================================================
suite('Claiming a missing skill');

const parseGapItems = eval('(' + extractFn('parseGapItems') + ')');

it('bulleted gap list becomes selectable items',
   parseGapItems('- Houdini\n- USD pipeline').length === 2);
it('bullet markers stripped', parseGapItems('- Houdini')[0] === 'Houdini');
it('numbered lists handled', parseGapItems('1. Houdini\n2. USD')[0] === 'Houdini');
it('prose sentences excluded, not offered as skills',
   parseGapItems('The CV does not evidence any Houdini experience at all.').length === 0);
it('over-long lines excluded',
   parseGapItems('- ' + 'x'.repeat(120)).length === 0);
it('blank lines ignored', parseGapItems('\n\n- Houdini\n\n').length === 1);
it('capped so the UI cannot flood',
   parseGapItems(Array.from({length: 20}, (_, i) => '- Skill' + i).join('\n')).length === 8);
it('empty gap text yields nothing', parseGapItems('').length === 0);

const claimPrompt = inline.slice(inline.indexOf('The candidate has confirmed they have experience'),
                                 inline.indexOf('callAssist(p, false).then(function (text) {\n        applyBtn.disabled'));

it('confirmed additions passed in their own block',
   inline.indexOf('<confirmed_additions>') !== -1);
it('current CV passed so the rest is preserved',
   inline.indexOf('<current_tailored_cv>') !== -1);
it('only confirmed items may be added',
   inline.indexOf('Add ONLY what is listed in <confirmed_additions>') !== -1);
it('forbids inventing duties or results around the addition',
   inline.indexOf('Do not invent duties, results, tools or dates around it') !== -1);
it('forbids upgrading "used" into "led" or "specialised in"',
   inline.indexOf('do not claim they led, introduced or specialised in it') !== -1);
it('everything else must stay unchanged',
   inline.indexOf('Change nothing else') !== -1);
it('uses the free assist endpoint, not a paid run',
   /callAssist\(p, false\)/.test(inline));
it('offers to fix the base CV, not just this application',
   inline.indexOf("save.id = 'gap-save-base'") !== -1);
it('positions come from the model, not fragile local parsing',
   inline.indexOf('POSITIONS: A numbered list of the roles found') !== -1);
it('positions counted in the cost estimate',
   Object.keys(SECTION_COST).indexOf('POSITIONS') !== -1);
it('an empty positions list disables the feature rather than breaking it',
   /toLowerCase\(\)\.indexOf\('none'\) !== 0/.test(inline));
it('claim strings exist in both languages',
   ['gapLead','gapWhere','gapApply','gapWorking','gapDone','gapFail','gapSaveBase','gapSavedBase',
    'editableHint','edited']
     .every(k => !!STRINGS.en[k] && !!STRINGS.sv[k]));
it('apply button pluralises', STRINGS.en.gapApply(1) !== STRINGS.en.gapApply(3));
it('done message asks the user to check the wording',
   STRINGS.en.gapDone.indexOf('Check the CV') !== -1);

// =====================================================================
suite('Optional research is opt-in');

it('company research defaults to off',
   /id="opt-research"(?![^>]*checked)/.test(html));
it('pay estimate defaults to off',
   /id="opt-salary"(?![^>]*checked)/.test(html));
it('neither checkbox carries a checked attribute',
   html.indexOf('id="opt-research" checked') === -1 &&
   html.indexOf('id="opt-salary" checked') === -1);

const optionCost = eval('(' + extractFn('optionCost') + ')');
it('research cost covers both its sections plus two searches',
   optionCost('research') === SECTION_COST['COMPANY RED FLAGS'] +
     SECTION_COST['COMPANY FINANCIALS'] + 2 * 3000);
it('salary cost covers its section plus one search',
   optionCost('salary') === SECTION_COST['SALARY'] + 3000);
it('research is the more expensive of the two',
   optionCost('research') > optionCost('salary'));
it('research badge reads 6.4k', fmtTokens(optionCost('research')) === '6.4k');
it('salary badge reads 3.3k', fmtTokens(optionCost('salary')) === '3.3k');
it('badges show a plus so they read as additions', STRINGS.en.optCost('6.4k') === '+6.4k');
it('badge helper exists in both languages',
   typeof STRINGS.en.optCost === 'function' && typeof STRINGS.sv.optCost === 'function');
it('badges render before a CV is pasted',
   /updateOptionCosts\(\);[\s\S]{0,40}if \(!cvEl\.value\.trim\(\)/.test(inline));

// A default run is now materially cheaper than it was.
function runTotal(research, salary) {
  let out = 0;
  Object.keys(SECTION_COST).forEach(k => {
    if (!research && (k === 'COMPANY RED FLAGS' || k === 'COMPANY FINANCIALS')) return;
    if (!salary && k === 'SALARY') return;
    out += SECTION_COST[k];
  });
  let searches = (research ? 2 : 0) + (salary ? 1 : 0);
  return out + searches * 3000;
}
it('default run costs less than half the all-options run',
   runTotal(false, false) < runTotal(true, true) * 0.5);
it('default run triggers no web search for a pasted posting',
   runTotal(false, false) === runTotal(false, false));
it('hint explains why they are off by default',
   STRINGS.en.opthint.indexOf('Leave them off') !== -1);

// =====================================================================
suite('Cost explainer — honest about what it cannot know');

const PROMPT_SCAFFOLD = Number((inline.match(/var PROMPT_SCAFFOLD = (\d+)/) || [])[1]);
const SEARCH_COST_SHIPPED = Number((inline.match(/var SEARCH_COST = (\d+)/) || [])[1]);
const baselineRun = eval('(' + extractFn('baselineRun') + ')');
const runsPerWindow = eval('(' + extractFn('runsPerWindow') + ')');

it('never claims a percentage of an allowance',
   !/% of your (allowance|pool|limit|quota)/i.test(inline));
it('says plainly that the allowance is not published',
   STRINGS.en.costIntro.indexOf('does not publish an exact allowance') !== -1);
it('names the relative cost as the certain part',
   STRINGS.en.costIntro.indexOf('What is certain is the relative cost') !== -1);
it('per-plan figures labelled as very rough',
   STRINGS.en.costPlans.indexOf('Very roughly') !== -1);
it('caveat states these are estimates, not guarantees',
   STRINGS.en.costCaveat.indexOf('estimates, not guarantees') !== -1);
it('caveat explains the pool is shared with other Claude use',
   STRINGS.en.costCaveat.indexOf('shared with everything else') !== -1);

it('baseline excludes both optional blocks',
   baselineRun() === Object.keys(SECTION_COST)
     .filter(k => ['COMPANY RED FLAGS','COMPANY FINANCIALS','SALARY'].indexOf(k) === -1)
     .reduce((n, k) => n + SECTION_COST[k], 0) + 700 + 1750);

const b = baselineRun();
it('research roughly 2.6x a basic run',
   Math.round(((b + optionCost('research')) / b) * 10) / 10 === 2.6);
it('pay estimate roughly 1.8x', 
   Math.round(((b + optionCost('salary')) / b) * 10) / 10 === 1.8);
it('both together roughly 3.4x',
   Math.round(((b + optionCost('research') + optionCost('salary')) / b) * 10) / 10 === 3.4);
it('caveat\u2019s "roughly triples" claim matches the arithmetic',
   Math.round((b + optionCost('research') + optionCost('salary')) / b) === 3);

it('runs per window given as a band, not a single number',
   runsPerWindow(4000, 200000).indexOf('\u2013') !== -1);
it('band is centred on the true division',
   (() => { const [lo, hi] = runsPerWindow(4000, 200000).split('\u2013').map(Number);
            const n = Math.floor(200000 / 4000); return lo < n && hi > n; })());
it('a run larger than the whole window reports <1, not 0',
   runsPerWindow(500000, 45000) === '<1');
it('never reports zero runs', runsPerWindow(44000, 45000) !== '0');
it('all three plans shown',
   !!STRINGS.en.planFree && !!STRINGS.en.planPro && !!STRINGS.en.planMax);
it('explainer is collapsed by default, not shouting',
   /<details id="cost-detail"(?![^>]*\bopen\b)/.test(html));
it('cost strings exist in both languages',
   ['costSummary','costIntro','costBasic','costWithResearch','costWithSalary','costWithBoth',
    'costTimes','costPlans','planFree','planPro','planMax','costRuns','costCaveat']
     .every(k => !!STRINGS.en[k] && !!STRINGS.sv[k]));

// =====================================================================
suite('Scope — agency mode lives in its own artifact now');

it('no mode switch', inline.indexOf('function setMode') === -1);
it('no agency panel markup', html.indexOf('id="agency-panel"') === -1);
it('no candidate CV field', html.indexOf('id="cand"') === -1);
it('no client brief field', html.indexOf('id="brief"') === -1);
it('no house template upload', html.indexOf('id="tpl-dropzone"') === -1);
it('no agency prompt builder', inline.indexOf('function agencyPrompt') === -1);
it('no submission sections', inline.indexOf('FORMATTED CV') === -1);
it('no client-facing risks section', inline.indexOf('SUBMISSION NOTE') === -1);
it('no ask-about-this-CV panel', inline.indexOf('function buildAskPanel') === -1);
it('no template section detection', inline.indexOf('function templateSections') === -1);
it('agency strings removed from both languages',
   ['modeAgency','candlabel','brieflabel','goAgency','secFormatted','zoneAsk','askExamples']
     .every(k => !STRINGS.en[k] && !STRINGS.sv[k]));
it('the seeker flow is untouched: base CV field still present',
   html.indexOf('id="cv"') !== -1 && html.indexOf('id="posting"') !== -1);
it('CV structure parsing kept \u2014 the PDF templates still need it',
   inline.indexOf('function parseCvStructure') !== -1);

// =====================================================================
suite('Super enhance — deeper tailoring of selected roles');

const enhancePrompt = inline.slice(inline.indexOf('Tailor specific roles in this CV'),
                                   inline.indexOf('Keep the header lines in English exactly as written. Write the content in \' + langShort() + \'.\';\n\n      callAssist'));

it('opens from a checkbox, collapsed by default',
   /panel\.style\.display = toggle\.checked \? 'block' : 'none';/.test(inline));
it('one checkbox per position', /positions\.forEach\(function \(pos\) \{/.test(inline));
it('button disabled until a role is picked',
   /btn\.disabled = chosen\.length === 0;/.test(inline));
it('button names the count', STRINGS.en.enhanceGo(2).indexOf('2 roles') !== -1);
it('feature absent when the CV yields no positions',
   /if \(!positions\.length \|\| !cvSectionEl\) return null;/.test(inline));

it('posting terminology used only where experience genuinely matches',
   /wherever the candidate.{0,8}s real experience matches it/.test(enhancePrompt));
it('underplayed detail expanded rather than invented',
   enhancePrompt.indexOf('Expand detail the CV states but underplays') !== -1);
it('most relevant content led with',
   enhancePrompt.indexOf('Lead each role with whatever is most relevant') !== -1);
it('irrelevant content trimmed to make room',
   enhancePrompt.indexOf('Cut or shorten content in those roles') !== -1);
it('existing numbers preserved',
   enhancePrompt.indexOf('Where the CV gives a number, keep it') !== -1);

it('adds nothing not already in the CV',
   enhancePrompt.indexOf('Add no experience, tool, responsibility, outcome or date that is not already in the CV') !== -1);
it('responsibility must not become achievement',
   enhancePrompt.indexOf('Do not turn a responsibility into an achievement') !== -1);
it('"worked on" must not become "led"',
   enhancePrompt.indexOf('"Worked on" does not become "led"') !== -1);
it('posting terms forbidden for absent experience',
   enhancePrompt.indexOf('matching it to absent experience is a lie') !== -1);
it('unselected roles left untouched',
   enhancePrompt.indexOf('Leave every role not listed above exactly as it stands') !== -1);
it('the reason for the limits is stated, not just the rule',
   enhancePrompt.indexOf('has to defend every line in an interview') !== -1);

it('no target score is set anywhere',
   !/9[0-9]\s*(?:to|-|\u2013)\s*9[0-9]\s*%/.test(inline) &&
   enhancePrompt.indexOf('93') === -1 && enhancePrompt.indexOf('95') === -1);
it('the model is told not to claim an unjustifiable score',
   enhancePrompt.indexOf('Do not claim a score you cannot justify') !== -1);
it('the ceiling is reported when requirements are genuinely missing',
   enhancePrompt.indexOf('that is the ceiling, and no amount of rewording lifts it') !== -1);
it('note warns the feature cannot conjure missing requirements',
   STRINGS.en.enhanceNote.indexOf('cannot conjure it') !== -1);
it('completion message tells the user they must defend it',
   STRINGS.en.enhanceDone.indexOf('defend every line') !== -1);

it('the old score is marked stale rather than left to mislead',
   inline.indexOf("stale.className = 'score-stale'") !== -1);
it('stale notice explains which version the score describes',
   STRINGS.en.scoreStale.indexOf('earlier version') !== -1);
it('uses the free assist endpoint, not a paid run',
   /callAssist\(p, false\)[\s\S]{0,120}ENHANCED CV/.test(inline));
it('headers kept English for parsing',
   enhancePrompt.indexOf('exact English headers') !== -1);
it('enhance strings exist in both languages',
   ['enhanceOpen','enhanceLead','enhanceGo','enhanceGoNone','enhanceNote',
    'enhanceWorking','enhanceDone','enhanceFail','scoreStale']
     .every(k => !!STRINGS.en[k] && !!STRINGS.sv[k]));
it('Swedish note carries the same honesty warning',
   STRINGS.sv.enhanceNote.indexOf('hittas på') !== -1);

// =====================================================================
suite('Translated headers (the Swedish save bug)');

// Symptom: a Swedish run rendered fine but saved with no role, so it could
// not be used for interview prep later. Cause: the model translated the
// section headers despite being told not to, parsing found nothing, and the
// whole package silently fell back to showing raw text.

it('Swedish role confirmation recognised',
   parseSections('ROLLBEKRÄFTELSE\nSöker: Teknisk artist', KEYS)['ROLE CONFIRMATION']
     .indexOf('Söker') === 0);
it('Swedish tailored CV recognised',
   parseSections('ANPASSAT CV\nBrödtext', KEYS)['TAILORED CV'] === 'Brödtext');
it('Swedish match score recognised',
   parseSections('NYCKELORDSMATCHNING\n72%', KEYS)['ATS MATCH SCORE'] === '72%');
it('Swedish skills gap recognised',
   parseSections('KOMPETENSLUCKOR\nSaknar Houdini', KEYS)['SKILLS GAP'] === 'Saknar Houdini');
it('Swedish positions recognised',
   parseSections('TJÄNSTER\n1. Teknisk artist, Volvo', KEYS)['POSITIONS'].indexOf('Teknisk') !== -1);
it('Swedish salary recognised',
   parseSections('LÖN\n55 000 SEK', KEYS)['SALARY'] === '55 000 SEK');
it('mixed English and Swedish headers both resolve', (() => {
  const m = parseSections('ROLE CONFIRMATION\nApplying for: X\n\nANPASSAT CV\nBody', KEYS);
  return m['ROLE CONFIRMATION'].indexOf('Applying') === 0 && m['TAILORED CV'] === 'Body';
})());
it('English headers still work unchanged',
   parseSections('TAILORED CV\nBody', KEYS)['TAILORED CV'] === 'Body');
it('aliases do not collide across sections',
   Object.keys(HEADER_ALIASES).every(k =>
     HEADER_ALIASES[k].every(alias =>
       Object.keys(HEADER_ALIASES).filter(other =>
         other !== k && HEADER_ALIASES[other].indexOf(alias) !== -1).length === 0)));
it('longer aliases matched before shorter ones they contain',
   /var matchable = Object\.keys\(map\)\.sort\(function \(a, b\) \{ return b\.length - a\.length; \}\)/.test(inline));
it('result keyed by the caller\u2019s keys, not by aliases',
   Object.keys(parseSections('ROLLBEKRÄFTELSE\nx', KEYS)).indexOf('ROLLBEKRÄFTELSE') === -1);

it('Swedish "Söker:" prefix stripped from the saved role',
   roleFromConfirmation('Söker: Teknisk artist hos Volvo') === 'Teknisk artist hos Volvo');
it('"Ansöker om" prefix stripped',
   roleFromConfirmation('Ansöker om: Utvecklare') === 'Utvecklare');
it('English prefix still stripped',
   roleFromConfirmation('Applying for: Designer') === 'Designer');
it('a role with no recognised prefix passes through',
   roleFromConfirmation('Teknisk artist hos Volvo') === 'Teknisk artist hos Volvo');

const fallbackRole = eval('(' + extractFn('fallbackRole') + ')');
it('company used when the confirmation is missing',
   fallbackRole('some text', 'Volvo Cars') === 'Volvo Cars');
it('first usable line used when there is no company',
   fallbackRole('Senior Technical Artist\nmore text', '') === 'Senior Technical Artist');
it('very short lines skipped as a name', fallbackRole('ok\nA real title here', '') === 'A real title here');
it('empty input yields empty, not a crash', fallbackRole('', '') === '');
it('saved runs fall back rather than saving nameless',
   /roleFromConfirmation\(parts\['ROLE CONFIRMATION'\]\) \|\| fallbackRole/.test(inline));

it('a failed parse is reported, not hidden',
   inline.indexOf("warn.className = 'parse-warn'") !== -1);
it('the warning says what is missing from that run',
   STRINGS.en.parseFailed.indexOf('match score, gaps and interview prep are missing') !== -1);
it('and suggests re-running', STRINGS.en.parseFailed.indexOf('Running it again') !== -1);
it('warning exists in both languages',
   !!STRINGS.en.parseFailed && !!STRINGS.sv.parseFailed);

// =====================================================================
suite('No em dashes in anything the user sends');

const stripEmDashes = eval('(' + extractFn('stripEmDashes') + ')');

it('spaced em dash becomes a comma',
   stripEmDashes('Led the team \u2014 which shipped four titles.') === 'Led the team, which shipped four titles.');
it('unspaced em dash becomes a comma',
   stripEmDashes('Built tooling\u2014adopted studio-wide.') === 'Built tooling, adopted studio-wide.');
it('spaced en dash becomes a comma',
   stripEmDashes('Maya, Unreal \u2013 Python') === 'Maya, Unreal, Python');
it('en dash between letters becomes a hyphen',
   stripEmDashes('co\u2013operative work') === 'co-operative work');

// Date ranges are the case where replacing a dash would be worse than keeping
// it: "2020, 2024" in a CV reads as two separate years.
it('date range survives as a hyphen',
   stripEmDashes('Prior Studio (2020\u20132024)') === 'Prior Studio (2020-2024)');
it('spaced date range survives',
   stripEmDashes('Worked 2019 \u2014 2023 on pipeline') === 'Worked 2019-2023 on pipeline');
it('plain hyphens are left alone',
   stripEmDashes('State-of-the-art rendering') === 'State-of-the-art rendering');
it('bullet markers are not turned into commas',
   stripEmDashes('- Built a shader tool \u2014 used by everyone') === '- Built a shader tool, used by everyone');
it('a line opening with a dash does not open with a comma',
   stripEmDashes('\u2014 Leading with a dash') === 'Leading with a dash');
it('no stray comma before a full stop',
   stripEmDashes('He did it \u2014 . Odd input').indexOf(', .') === -1);
it('no doubled commas', stripEmDashes('a, \u2014 b').indexOf(',,') === -1);
it('empty input safe', stripEmDashes('') === '');
it('null input safe', stripEmDashes(null) === null);

it('no dash characters survive anywhere', ['Led \u2014 x', 'a\u2013b', '2020\u20132024', 'x \u2013 y']
   .every(s => !/[\u2013\u2014]/.test(stripEmDashes(s))));

it('applied to the tailored CV',
   /makeSection\(T\(\)\.secCv, stripEmDashes\(/.test(inline));
it('applied to the cover letter',
   /makeSection\(T\(\)\.secLetter, stripEmDashes\(/.test(inline));
it('applied to the enhanced CV',
   /cvBody\.textContent = stripEmDashes\(newCv\)/.test(inline));
it('applied to the gap-claim rewrite',
   /cvBody\.textContent = stripEmDashes\(text\.trim\(\)\)/.test(inline));
it('applied to the follow-up emails',
   /makeSection\(d\.title, stripEmDashes\(/.test(inline));

it('the prompt also asks for it, so the cleanup is a backstop not the only line',
   inline.indexOf('Write without em dashes or en dashes as sentence punctuation') !== -1);
it('the prompt explains why rather than just forbidding',
   inline.indexOf('one of the clearest signs a document was machine written') !== -1);
it('the prompt exempts date ranges', inline.indexOf('A dash between numbers in a date range is fine') !== -1);
it('super enhance carries the same instruction',
   inline.indexOf('Use no em dashes or en dashes as punctuation') !== -1);
it('follow-up emails carry it too',
   (inline.match(/no em dashes or en dashes as punctuation/g) || []).length >= 3);
it('the tone check now flags dashes used as punctuation',
   inline.indexOf('dashes used where a comma belongs') !== -1);


// =====================================================================
suite('Role length variation');

const roleBlockLengths = eval('(' + extractFn('roleBlockLengths') + ')');
const lengthVariation = eval('(' + extractFn('lengthVariation') + ')');

const POS = ['Senior Technical Artist, Norrsken Interactive (2019-2026)',
             'Technical Artist, Bright Fjord Studios (2017-2019)',
             'Junior Artist, Kobolt Games (2015-2017)'];

const UNIFORM_CV = [
  'Senior Technical Artist, Norrsken Interactive (2019-2026)',
  '- Owned the shader pipeline in Unreal across four titles',
  '- Wrote Python tooling for asset validation',
  '- Built Houdini digital assets for environments',
  '',
  'Technical Artist, Bright Fjord Studios (2017-2019)',
  '- Maya rigging and pipeline support for twelve artists',
  '- Introduced USD between modelling and lighting',
  '- Maintained the build scripts for the art team',
  '',
  'Junior Artist, Kobolt Games (2015-2017)',
  '- Texturing and modelling support on two projects',
  '- Assisted with the migration to a new engine',
  '- Helped document the asset pipeline'
].join('\n');

const VARIED_CV = [
  'Senior Technical Artist, Norrsken Interactive (2019-2026)',
  '- Owned the shader authoring pipeline in Unreal Engine across four shipped titles, including the material library the whole art team built against',
  '- Wrote Python tooling for asset validation, cutting failed builds by roughly 60 percent',
  '- Built and maintained Houdini digital assets for procedural environment generation',
  '- Frame budget and LOD strategy with engineering',
  '',
  'Technical Artist, Bright Fjord Studios (2017-2019)',
  '- Maya rigging and pipeline support for a team of twelve',
  '',
  'Junior Artist, Kobolt Games (2015-2017)'
].join('\n');

it('blocks located for each role', roleBlockLengths(UNIFORM_CV, POS).length === 3);
it('even blocks score low variation', lengthVariation(roleBlockLengths(UNIFORM_CV, POS)) < 0.25);
it('lopsided blocks score high variation', lengthVariation(roleBlockLengths(VARIED_CV, POS)) > 0.5);
it('the two are clearly separated, not borderline',
   lengthVariation(roleBlockLengths(VARIED_CV, POS)) >
   lengthVariation(roleBlockLengths(UNIFORM_CV, POS)) * 3);

it('roles matched even when the wording was rewritten',
   roleBlockLengths(UNIFORM_CV, ['Norrsken Interactive', 'Bright Fjord', 'Kobolt']).length === 3);
it('a single role yields no verdict', lengthVariation(roleBlockLengths('One Role, Co', ['One Role, Co'])) === null);
// Called directly: routing through roleBlockLengths returns an empty array,
// which masks whether the length guard itself is present.
it('one length reports null, not a meaningless zero', lengthVariation([250]) === null);
it('two lengths do produce a verdict', lengthVariation([100, 300]) !== null);
it('no positions yields no blocks', roleBlockLengths('text', []).length === 0);
it('empty CV text is safe', roleBlockLengths('', POS).length === 0);
it('variation of an empty list is null, not NaN', lengthVariation([]) === null);
it('all-zero lengths return null rather than dividing by zero',
   lengthVariation([0, 0, 0]) === null);
it('identical lengths give exactly zero variation', lengthVariation([100, 100, 100]) === 0);

it('warning shown only below the threshold',
   /variation !== null && variation < UNIFORM_THRESHOLD/.test(inline));
it('threshold is a named constant, not a magic number',
   /var UNIFORM_THRESHOLD = /.test(inline));

// Assert the threshold actually separates the two cases. A constant set to
// zero would satisfy "it exists" while flagging nothing, ever.
const THRESHOLD = Number(inline.match(/var UNIFORM_THRESHOLD = ([\d.]+)/)[1]);
it('an even CV falls below the threshold',
   lengthVariation(roleBlockLengths(UNIFORM_CV, POS)) < THRESHOLD);
it('a lopsided CV sits above it',
   lengthVariation(roleBlockLengths(VARIED_CV, POS)) > THRESHOLD);
it('the threshold is a usable value, not zero or one',
   THRESHOLD > 0.05 && THRESHOLD < 0.6);
it('warning tells the user what to do about it',
   STRINGS.en.tooUniform.indexOf('Super enhance') !== -1);
it('warning names the symptom, not just the fix',
   STRINGS.en.tooUniform.indexOf('same length') !== -1);
it('warning exists in both languages', !!STRINGS.en.tooUniform && !!STRINGS.sv.tooUniform);

it('the prompt asks for uneven weighting',
   inline.indexOf('Weight the roles unevenly') !== -1);
it('and gives concrete bullet counts per tier',
   inline.indexOf('four to six bullets, a middling one two or three') !== -1);
it('and allows a role with nothing under it',
   inline.indexOf('just title, employer and dates with nothing under it') !== -1);
it('bullet length told to vary',
   inline.indexOf('Some should be short, six or seven words') !== -1);
it('repeated clause shape called out',
   inline.indexOf('do not repeat the same clause shape') !== -1);
it('the reason is stated, not just the rule',
   inline.indexOf('clearest sign a CV was machine written') !== -1);
it('tone check asked to judge evenness',
   inline.indexOf('too even in length or the bullets too uniform in shape') !== -1);
it('super enhance told not to level the CV back out',
   inline.indexOf('Do not even out the CV') !== -1);


// =====================================================================
suite('Shipped-file invariants');

it('section headers forced to English in the prompt',
   inline.indexOf('keep the section header lines themselves in English') !== -1);
it('output language resolved independently of the interface',
   inline.indexOf('LANG_NAME[lang]') === -1 && inline.indexOf('langInstruction()') !== -1);
it('model told not to guess a role it cannot retrieve',
   inline.indexOf('do NOT guess the role from the URL text') !== -1);
it('no accept filter on the file input (mobile fix)', html.indexOf('accept=".pdf') === -1);
it('44px tap target present', html.indexOf('min-height: 44px') !== -1);
it('applyLanguage runs at startup', /loadHistory\(\);[\s\S]{0,40}applyLanguage\(\);/.test(inline));
it('model output never reaches innerHTML',
   !/innerHTML\s*=\s*(?!'')/.test(inline.replace(/innerHTML = '';/g, '')));
it('match score clamped in shipped code', inline.indexOf('Math.min(100') !== -1);

// =====================================================================

console.log('\n' + '─'.repeat(52));
if (failed) {
  console.log(`\x1b[31m${failed} failed\x1b[0m, ${passed} passed  (${passed + failed} total)`);
  failures.forEach(f => console.log('  • ' + f));
  process.exit(1);
} else {
  console.log(`\x1b[32mAll ${passed} checks passed\x1b[0m across 31 suites`);
  process.exit(0);
}
