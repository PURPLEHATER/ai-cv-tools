#!/usr/bin/env node
/**
 * CV screen — test suite.
 *
 * Extracts the real functions from cv-screen-artifact.html and runs them.
 * The shared parsing and PDF logic is lifted verbatim from the job-seeker
 * artifact, so this suite checks it survived extraction intact as well as
 * covering the business-specific behaviour.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'cv-screen-artifact.html');
const html = fs.readFileSync(FILE, 'utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/g).pop()
  .replace(/^<script>/, '').replace(/<\/script>$/, '');

function extractFn(name) {
  const start = inline.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('Function not found: ' + name);
  let i = inline.indexOf('{', start), depth = 0, end = -1;
  for (let k = i; k < inline.length; k++) {
    if (inline[k] === '{') depth++;
    else if (inline[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return inline.slice(start, end + 1);
}

function extractObject(declStart) {
  const s = inline.indexOf(declStart);
  let i = inline.indexOf('{', s), depth = 0, end = -1;
  for (let k = i; k < inline.length; k++) {
    if (inline[k] === '{') depth++;
    else if (inline[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return inline.slice(i, end + 1);
}

const HEADING_WORDS = eval(inline.match(/var HEADING_WORDS = [^;]+;/)[0]
  .replace('var HEADING_WORDS = ', '').replace(/;$/, ''));
const looksLikeHeading = eval('(' + extractFn('looksLikeHeading') + ')');
const looksLikeBullet = eval('(' + extractFn('looksLikeBullet') + ')');
const stripBullet = eval('(' + extractFn('stripBullet') + ')');
const looksLikeContact = eval('(' + extractFn('looksLikeContact') + ')');
const parseCvStructure = eval('(' + extractFn('parseCvStructure') + ')');
const templateSections = eval('(' + extractFn('templateSections') + ')');
const parseSections = eval('(' + extractFn('parseSections') + ')');
const scoreFromText = eval('(' + extractFn('scoreFromText') + ')');
const fmtTokens = eval('(' + extractFn('fmtTokens') + ')');
const TEMPLATES = eval('(' + extractObject('var TEMPLATES = {') + ')');
const STRINGS = eval('(' + extractObject('var STRINGS = {') + ')');

const KEYS = ['FORMATTED CV', 'SUBMISSION NOTE', 'FIT', 'GLOSSARY', 'RISKS', 'CONFIDENCE'];

let passed = 0, failed = 0;
const failures = [];
let current = '';
function suite(n) { current = n; console.log('\n\x1b[1m' + n + '\x1b[0m'); }
function it(n, c) {
  if (c) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + n); }
  else { failed++; failures.push(current + ' → ' + n); console.log('  \x1b[31m✗ ' + n + '\x1b[0m'); }
}

// =====================================================================
suite('Scope — nothing from the job-seeker tool leaked in');

it('no salary research', inline.indexOf('SALARY') === -1);
it('no company research', inline.indexOf('COMPANY RED FLAGS') === -1);
it('no interview preparation', inline.indexOf('INTERVIEW') === -1);
it('no cover letter', inline.indexOf('COVER LETTER') === -1);
it('no application history', inline.indexOf('historyCache') === -1);
it('no portfolio analysis', inline.indexOf('computePortfolioStats') === -1);
it('no CSV export', inline.indexOf('buildHistoryCsv') === -1);
it('no web search tool', inline.indexOf('web_search') === -1);
it('the only mode switch is one-vs-batch, not seeker-vs-agency',
   inline.indexOf('setMode') !== -1 && inline.indexOf("'seeker'") === -1);
it('still materially smaller than the seeker artifact',
   html.split('\n').length < 2600);

// =====================================================================
suite('Shared logic survived extraction');

it('ALL CAPS heading detected', looksLikeHeading('EXPERIENCE'));
it('sentence is not a heading', !looksLikeHeading('Led a team of nine engineers.'));
it('ALL CAPS sentence is not a heading', !looksLikeHeading('LED A TEAM OF NINE.'));
it('long line starting with a heading word is not a heading',
   !looksLikeHeading('Professional Experience across three studios building pipelines'));
it('bullet detected', looksLikeBullet('- Built a tool'));
it('bullet marker stripped', stripBullet('\u2022  Built a tool') === 'Built a tool');
it('email detected as contact', looksLikeContact('jane@example.com'));
it('prose not detected as contact', !looksLikeContact('Experienced technical artist with a decade of work'));

const cv = parseCvStructure(`Jane Doe
jane@example.com

EXPERIENCE
Senior Technical Artist, Prior Studio (2020-2024)
- Built a shader tool

EDUCATION
BA Computer Graphics`);
it('name extracted', cv.name === 'Jane Doe');
it('contact captured', cv.contact.length === 1);
it('two headings found', cv.blocks.filter(b => b.type === 'heading').length === 2);
it('bullet found', cv.blocks.filter(b => b.type === 'bullet').length === 1);
it('job title kept as text, not heading',
   cv.blocks.some(b => b.type === 'text' && b.text.indexOf('Senior Technical Artist,') === 0));

it('score parsed', scoreFromText('78%') === 78);
it('score clamped', scoreFromText('150%') === 100);
it('no score returns null', scoreFromText('no number here') === null);
it('token formatting', fmtTokens(13700) === '13.7k' && fmtTokens(999) === '999');
it('three PDF templates present', Object.keys(TEMPLATES).length === 3);
it('templates differ meaningfully', TEMPLATES.compact.margin < TEMPLATES.classic.margin);

// =====================================================================
suite('Template parsing');

const secs = templateSections(`ACME CONSULTING

Candidate profile
[Name]

Key skills
- [Skill]

Assignment history
[Client, role, dates]

Education
[Degree]`);
it('house headings found', secs.indexOf('Key skills') !== -1 && secs.indexOf('Assignment history') !== -1);
it('order preserved', secs.indexOf('Key skills') < secs.indexOf('Education'));
it('placeholders excluded', secs.every(s => s.indexOf('[') === -1));
it('bullets excluded', secs.every(s => s.indexOf('- ') !== 0));
it('long lines are not treated as template headings',
   templateSections('Candidate profile\nThis is a long sentence of body copy that should never be read as a section heading').length === 1);
it('a wordy line is excluded even without punctuation',
   templateSections('Assignment history across many different client engagements over time').length === 0);
// Few words but long ones: the only input the character guard actually
// decides, since the five-word rule already rejects most long lines.
it('a long line of few long words is not a heading',
   templateSections('Internationalisation Localisation Standardisation Documentation').length === 0);
it('the Swedish equivalent is also excluded',
   templateSections('Professionell Kompetensutveckling Och Vidareutbildning').length === 0);
it('a short heading of the same shape is still accepted',
   templateSections('Kompetenser').length === 1);
it('empty template safe', templateSections('').length === 0);
it('duplicates collapsed', templateSections('Education\nfoo\nEducation\nbar').length === 1);

// =====================================================================
suite('Section parsing');

const out = parseSections(`FORMATTED CV
Jane Doe
Senior technical artist

SUBMISSION NOTE
Strong fit for the brief.

FIT
78%
Meets: real-time pipelines, Maya

GLOSSARY
USD \u2014 a scene format for moving 3D data between tools.

RISKS
No Houdini experience, which the brief requires.

CONFIDENCE
Dates unclear for one role.`, KEYS);

it('all six sections parse', KEYS.every(k => out[k].length > 0));
it('CV does not bleed into the note', out['FORMATTED CV'].indexOf('Strong fit') === -1);
it('glossary isolated from risks', out['GLOSSARY'].indexOf('No Houdini') === -1);
it('risks isolated from confidence', out['RISKS'].indexOf('Dates unclear') === -1);
it('fit score reads correctly', scoreFromText(out['FIT']) === 78);
it('lowercase headers still parse',
   parseSections('formatted cv\nBody.', KEYS)['FORMATTED CV'] === 'Body.');
it('trailing colon consumed',
   parseSections('RISKS:\nSome risk.', KEYS)['RISKS'] === 'Some risk.');
it('header phrase mid-sentence does not split',
   parseSections('SUBMISSION NOTE\nWe should discuss the risks with the client.\n\nRISKS\nReal risk.', KEYS)['SUBMISSION NOTE']
     .indexOf('risks') !== -1);
it('missing section stays empty', parseSections('RISKS\nx', KEYS)['GLOSSARY'] === '');
it('no headers at all leaves everything empty (UI falls back)',
   KEYS.every(k => parseSections('just prose', KEYS)[k] === ''));

// =====================================================================
suite('Prompt discipline');

const prompt = inline.slice(inline.indexOf('function buildPrompt'), inline.indexOf('// ---------- Ask panel'));

it('template in its own tagged block', prompt.indexOf('<house_template>') !== -1);
it('candidate CV and brief separated',
   prompt.indexOf('<candidate_cv>') !== -1 && prompt.indexOf('<role_brief>') !== -1);
it('target role defined by the brief only',
   prompt.indexOf('defined ONLY by <role_brief>') !== -1);
it('CV titles marked as history', /history, not the target role/.test(prompt));
it('template example text must not leak through',
   prompt.indexOf('never carry template example text through') !== -1);
it('empty template sections omitted, not invented',
   prompt.indexOf('omit that section rather than inventing content') !== -1);
it('no-template case handled', prompt.indexOf('No house template was supplied') !== -1);
it('forbids inflating seniority', prompt.indexOf('do not inflate seniority') !== -1);
it('forbids duties as achievements',
   prompt.indexOf('restate a responsibility as an achievement') !== -1);
it('glossary written for a non-specialist',
   prompt.indexOf('someone who does not work in this field') !== -1);
it('glossary skips obvious terms', prompt.indexOf('skip terms any reader would know') !== -1);
it('glossary flags ambiguity rather than guessing',
   prompt.indexOf('say so rather than guessing') !== -1);
it('risks framed for the consultant',
   prompt.indexOf('before the client asks') !== -1);
it('confidence must not manufacture doubt',
   prompt.indexOf('Do not manufacture doubt') !== -1);
it('headers kept English for parsing',
   prompt.indexOf('Keep the header lines in English exactly as written') !== -1);
it('output language follows the interface', /LANG_NAME\[lang\]/.test(prompt));

// =====================================================================
suite('Ask about this CV');

const ask = inline.slice(inline.indexOf('A consultant is screening a candidate'),
                         inline.indexOf('Answer in under 80 words'));
it('answers only from the CV', ask.indexOf('Answer using ONLY what the CV states') !== -1);
it('must cite the supporting line', ask.indexOf('point to the specific line') !== -1);
it('"the CV does not say" allowed', ask.indexOf('the CV does not say') !== -1);
it('framed as better than a guess', ask.indexOf('far more valuable than a guess') !== -1);
it('no inference from job title', ask.indexOf('Do not infer experience from a job title') !== -1);
it('no qualification assumed from a degree', ask.indexOf('Do not assume a qualification from a degree subject') !== -1);
it('names what would settle it', ask.indexOf('name what would settle it') !== -1);
it('CV captured before fields are cleared',
   inline.indexOf('lastCandidateCv = cand;') < inline.indexOf("candEl.value = '';"));
it('disabled with no CV loaded', /if \(!q \|\| !lastCandidateCv\) return;/.test(inline));
it('answers capped short', inline.indexOf('Answer in under 80 words') !== -1);

// =====================================================================
suite('Interface behaviour');

it('formatted CV is editable', /secFormatted[\s\S]{0,140}editable: true/.test(inline));
it('client note is editable', /secNote[\s\S]{0,80}editable: true/.test(inline));
it('plain-text editing only', inline.indexOf("'plaintext-only'") !== -1);
it('copy uses edited text', /writeText\(getText\(\)\)/.test(inline));
it('PDF uses edited text', /downloadPdf\(getText\(\)/.test(inline));
it('progress reports elapsed time, not fake stages',
   inline.indexOf('Math.floor((Date.now() - started) / 1000)') !== -1);
it('no fixed-timer stage list', inline.indexOf('var delays = [') === -1);
it('timer cleared on stop', /clearInterval\(timer\)/.test(inline));
it('file input has no accept filter (mobile fix retained)',
   html.indexOf('accept=".pdf') === -1);
it('44px tap targets retained', html.indexOf('min-height: 44px') !== -1);
it('template persists in the browser', inline.indexOf("window.storage.set('cs-template'") !== -1);
// Both artifacts may be open for the same user, so every key is namespaced.
const storageKeys = [...inline.matchAll(/window\.storage\.(?:get|set|delete)\('([^']+)'/g)].map(m => m[1]);
it('storage keys found at all', storageKeys.length > 0);
it('every storage key namespaced so the two tools cannot collide',
   storageKeys.every(k => k.indexOf('cs-') === 0));
it('language persists separately', inline.indexOf("window.storage.set('cs-lang'") !== -1);
it('glossary hidden when there is nothing to explain',
   /GLOSSARY'\]\.toLowerCase\(\)\.indexOf\('nothing that needs explaining'\) !== 0/.test(inline));
it('model output never reaches innerHTML',
   !/innerHTML\s*=\s*(?!'')/.test(inline.replace(/innerHTML = '';/g, '')));

// =====================================================================
suite('Batch screening — cost and reading');

const batchPrompt = inline.slice(inline.indexOf('Score each CV below against the brief'),
                                 inline.indexOf('Output one line per CV'));

it('CVs are batched, not sent one per call', inline.indexOf('var BATCH_SIZE =') !== -1);
it('each CV capped for the ranking pass', inline.indexOf('SCREEN_CHAR_CAP') !== -1);
it('cap is generous enough for a normal CV',
   Number(inline.match(/SCREEN_CHAR_CAP = (\d+)/)[1]) >= 5000);
it('cost shown before anything runs', inline.indexOf('function updateBatchCost') !== -1);
it('cost covers screening and tailoring separately',
   STRINGS.en.batchCost(100, '250k', 10, '24k').indexOf('250k') !== -1 &&
   STRINGS.en.batchCost(100, '250k', 10, '24k').indexOf('24k') !== -1);
it('cost is labelled as an estimate',
   STRINGS.en.batchCost(1, 'a', 1, 'b').indexOf('Rough estimates') !== -1);
it('files read sequentially so 100 PDFs cannot stall the tab',
   /next\(i \+ 1\)/.test(inline));
it('unreadable files are counted, not silently dropped',
   !!STRINGS.en.batchUnreadable && inline.indexOf('failed++') !== -1);
it('non-CV file types reported as skipped', !!STRINGS.en.batchSkipped);
it('reading progress reported', !!STRINGS.en.batchReading);

// =====================================================================
suite('Batch screening — scoring discipline');

it('scores only on evidence against the brief',
   batchPrompt.indexOf('Score only on evidence in the CV against the requirements') !== -1);
// These must assert the prohibition, not merely that the phrase appears —
// "Consider how well written the CV is" contains the same words.
it('writing quality explicitly excluded from scoring',
   /Do not score on[^']*how well written the CV is/.test(batchPrompt));
it('employer names explicitly excluded',
   /Do not score on[^']*which employers are named/.test(batchPrompt));
it('place of study explicitly excluded',
   /Do not score on[^']*where someone studied/.test(batchPrompt));
it('career length explicitly excluded',
   /Do not score on[^']*how long they have worked/.test(batchPrompt));
it('missing evidence framed as missing, not as a judgement of the person',
   batchPrompt.indexOf('not a negative judgement of the candidate') !== -1);
it('every CV gets a stated reason', batchPrompt.indexOf('why is under 15 words') !== -1);
it('every CV gets a stated concern', batchPrompt.indexOf('concern is under 15 words') !== -1);
it('output format is strict and parseable',
   batchPrompt.indexOf('id | score | why | concern') !== -1);

const parseScreenLines = eval('(' + extractFn('parseScreenLines') + ')');
const fakeBatch = [{ name: 'a.pdf', text: 'x' }, { name: 'b.pdf', text: 'y' }];
const parsed = parseScreenLines('1 | 82 | Meets Maya and Unreal | No Houdini\n2 | 41 | Some pipeline work | No real-time experience', fakeBatch);
it('two rows parsed', parsed.length === 2);
it('score read correctly', parsed[0].score === 82);
it('reason read correctly', parsed[0].why === 'Meets Maya and Unreal');
it('concern read correctly', parsed[0].concern === 'No Houdini');
it('filename carried through', parsed[0].name === 'a.pdf');
it('malformed lines skipped, not crashed',
   parseScreenLines('garbage\n1 | 50 | ok | none', fakeBatch).length === 1);
it('out-of-range ids ignored',
   parseScreenLines('9 | 50 | ok | none', fakeBatch).length === 0);
it('scores clamped to 100',
   parseScreenLines('1 | 250 | ok | none', fakeBatch)[0].score === 100);
it('non-numeric score rejected rather than becoming NaN',
   parseScreenLines('1 | high | ok | none', fakeBatch).length === 0);
it('empty response yields nothing, not a crash',
   parseScreenLines('', fakeBatch).length === 0);

// =====================================================================
suite('Batch screening — human oversight');

// Assert against the ranking function specifically: there are two forEach
// sites over rows, and finding either one is not proof the ranking is whole.
const renderRankingSrc = inline.slice(inline.indexOf('function renderRanking'),
                                      inline.indexOf('function tailorSelected'));
it('nothing is rejected: the ranking iterates every row',
   /rows\.forEach\(function \(r, i\) \{/.test(renderRankingSrc));
it('the ranking loop is not sliced to the shortlist',
   !/rows\.slice\([^)]*\)\.forEach/.test(renderRankingSrc));
it('shortlist size only pre-ticks, never filters',
   renderRankingSrc.indexOf('if (i < n) selected[r.name] = true;') !== -1);
it('no candidate cap anywhere \u2014 a truncated list would hide people silently',
   inline.indexOf('rows.slice(0, 20)') === -1);
it('deck tables paginate rather than truncate',
   (inline.match(/autoPage: true/g) || []).length === 4);
it('no deck table has pagination switched off',
   inline.indexOf('autoPage: false') === -1);
it('shortlist is a default selection, not a filter',
   /if \(i < n\) selected\[r\.name\] = true;/.test(inline));
it('the user can change the selection',
   inline.indexOf("cb.addEventListener('change'") !== -1);
it('oversight notice shown before the button',
   html.indexOf('id="oversight"') < html.indexOf('id="go-batch"'));
it('notice states the tool does not decide',
   STRINGS.en.oversightTitle.indexOf('does not decide') !== -1);
it('notice explains a low score may mean unmentioned, not unable',
   STRINGS.en.oversightBody.indexOf('not mentioned rather than') !== -1);
it('notice names the EU high-risk classification',
   STRINGS.en.oversightBody.indexOf('high-risk') !== -1);
it('notice says a person stays responsible',
   STRINGS.en.oversightBody.indexOf('person must remain responsible') !== -1);
it('notice urges reading borderline CVs',
   STRINGS.en.oversightBody.indexOf('near your cut-off') !== -1);
it('Swedish notice carries the same warnings',
   STRINGS.sv.oversightBody.indexOf('högrisk') !== -1 &&
   STRINGS.sv.oversightBody.indexOf('ansvarig') !== -1);
it('ranked lead explains the selection can be changed',
   STRINGS.en.rankedLead(100, 10).indexOf('change the selection') !== -1);
it('shortlist size is adjustable', html.indexOf('id="shortlist-size"') !== -1);

// =====================================================================
suite('Batch screening — tailoring pass');

it('tailoring reuses the single-candidate prompt',
   /callClaude\(buildPrompt\(cand\.text, brief\)/.test(inline));
it('runs sequentially, not all at once', /return run\(i \+ 1\)/.test(inline));
it('one failure does not stop the rest',
   /\.catch\(function \(\) \{[\s\S]{0,200}return run\(i \+ 1\)/.test(inline));
it('progress reported during tailoring',
   inline.indexOf('T().batchTailoring') !== -1);
it('each result keeps its filename and score',
   /cand\.name \+ '  \\u00b7  ' \+ cand\.score/.test(inline));
it('PDF filename derived from the candidate file',
   /cand\.name\.replace\(\/\\\.\(pdf\|docx\)\$\/i, ''\)/.test(inline));
it('tailoring is a separate step, never automatic after screening',
   !/screenBatch\(brief\)[\s\S]{0,400}tailorSelected/.test(inline));
it('tailoring fires only from a click',
   /tailorBtn\.addEventListener\('click'[\s\S]{0,220}tailorSelected\(chosen/.test(inline));
it('the screening result says nothing has been tailored yet',
   STRINGS.en.stepOneDone.indexOf('Nothing has been tailored yet') !== -1);
it('step two is labelled optional',
   STRINGS.en.stepTwo.indexOf('optional') !== -1);
it('step two says only ticked CVs are tailored',
   STRINGS.en.stepTwo.indexOf('Only the ticked CVs') !== -1);
it('cost of tailoring shown before the click',
   STRINGS.en.tailorNote(10, '24k').indexOf('24k') !== -1);
it('and states nothing is spent until pressed',
   STRINGS.en.tailorNote(10, '24k').indexOf('Nothing is spent until you press it') !== -1);
it('note updates with the selection count',
   STRINGS.en.tailorNote(3, '7.2k').indexOf('for 3') !== -1);
it('empty selection has its own message', !!STRINGS.en.tailorNone);
it('button disabled with nothing ticked',
   /tailorBtn\.disabled = count === 0;/.test(inline));
it('step strings exist in both languages',
   ['stepOneDone','stepTwo','tailorNone'].every(k => !!STRINGS.en[k] && !!STRINGS.sv[k]));
it('Swedish step two also says optional',
   STRINGS.sv.stepTwo.indexOf('frivilligt') !== -1);
it('batch strings exist in both languages',
   ['batchlabel','batchprompt','oversightTitle','oversightBody','goBatch','batchCost',
    'zoneRanked','zoneTailored','rankedLead','tailorSelected','tailorNote',
    'batchLoaded','batchReading','batchScreening','batchTailoring']
     .every(k => !!STRINGS.en[k] && !!STRINGS.sv[k]));

// =====================================================================
suite('Requirements matrix');

const parseCoverage = eval('(' + extractFn('parseCoverage') + ')');
const reqPrompt = inline.slice(inline.indexOf('Read this role brief and list its hard requirements'),
                               inline.indexOf('No numbering, no commentary'));

it('requirements extracted from the brief, not the CVs',
   reqPrompt.indexOf('<role_brief>') !== -1 && reqPrompt.indexOf('<candidate_cv>') === -1);
it('capped at ten columns', reqPrompt.indexOf('at most 10 lines') !== -1);
it('labels kept short enough for column headers',
   reqPrompt.indexOf('short label of 1-3 words') !== -1);
it('uses the brief\u2019s own wording', reqPrompt.indexOf('exactly as the brief names it') !== -1);
it('only concrete, checkable requirements',
   reqPrompt.indexOf('only concrete, checkable requirements') !== -1);
it('unverifiable soft requirements excluded',
   /Skip soft requirements like[^']*team player/.test(reqPrompt));
it('and the reason is stated', reqPrompt.indexOf('cannot be verified from a CV') !== -1);
it('handles a brief with no concrete requirements',
   reqPrompt.indexOf('output "none"') !== -1);
it('matrix suppressed when there are no requirements',
   /if \(!requirements\.length\) return null;/.test(inline));

it('coverage letters parsed in order',
   parseCoverage('MAN', 3).join('') === 'MAN');
it('lowercase accepted', parseCoverage('man', 3).join('') === 'MAN');
it('separators tolerated', parseCoverage('M-A-N', 3).join('') === 'MAN');
it('short response padded with not-evidenced, never left blank',
   parseCoverage('MA', 4).join('') === 'MANN');
it('long response truncated to the column count',
   parseCoverage('MANMAN', 3).join('') === 'MAN');
it('junk letters ignored', parseCoverage('MXAZN', 3).join('') === 'MAN');
it('empty coverage becomes all not-evidenced, not an error',
   parseCoverage('', 3).join('') === 'NNN');
it('undefined coverage handled', parseCoverage(undefined, 2).join('') === 'NN');

const screenPrompt = inline.slice(inline.indexOf('Score each CV below against the brief'),
                                  inline.indexOf('Output one line per CV'));
it('coverage requested with one letter per requirement',
   screenPrompt.indexOf('one letter per requirement above, in the same order') !== -1);
it('adjacency defined as genuinely transferable',
   screenPrompt.indexOf('close enough that this person could do the work') !== -1);
it('adjacency examples given', screenPrompt.indexOf('a neighbouring language') !== -1);
it('adjacency use restrained', screenPrompt.indexOf('Use A sparingly') !== -1);
it('same-field experience explicitly not adjacency',
   screenPrompt.indexOf('same broad field is not adjacency') !== -1);
it('every adjacency must be justified',
   screenPrompt.indexOf('adjacent explains every A you gave') !== -1);
it('coverage only requested when requirements exist',
   /requirements\.length\s*\?\s*'id \| score \| why \| concern \| coverage \| adjacent/.test(inline));

it('coverage and adjacency parsed into the row',
   /coverage: parts\[4\]/.test(inline) && /adjacent: parts\[5\]/.test(inline));
it('cells carry a letter, so colour is not the only signal',
   /td\.textContent = state;/.test(inline));
it('cells carry an accessible label',
   /td\.setAttribute\('aria-label'/.test(inline));
it('adjacency reasoning shown below the table, not hidden in a colour',
   inline.indexOf('T().matrixWhyAdjacent') !== -1);
it('lead text calls amber a judgement, not a fact',
   STRINGS.en.matrixLead.indexOf('judgement about transferable experience, not a fact') !== -1);
it('Swedish lead carries the same caution',
   STRINGS.sv.matrixLead.indexOf('bedömning') !== -1);
it('table scrolls horizontally for ten columns',
   html.indexOf('matrix-scroll') !== -1 && /overflow-x: auto/.test(html));
it('candidate column stays visible while scrolling',
   /\.matrix-name \{[\s\S]{0,80}position: sticky/.test(html));
it('matrix rows ordered by score',
   /renderMatrix\(rows\.slice\(\)\.sort/.test(inline));
it('matrix strings exist in both languages',
   ['zoneMatrix','matrixLead','matrixCandidate','matrixWhyAdjacent','legMet','legAdjacent','legMissing']
     .every(k => !!STRINGS.en[k] && !!STRINGS.sv[k]));

// =====================================================================
suite('PowerPoint export');

const parseGlossary = eval('(' + extractFn('parseGlossary') + ')');
const glossPrompt = inline.slice(inline.indexOf('A recruiter with no technical background'),
                                 inline.indexOf('At most 20 lines'));

it('pptxgenjs loaded', html.indexOf('pptxgen.bundle.js') !== -1);
it('export offered on the screening result, before tailoring',
   inline.indexOf('T().deckExport') < inline.indexOf('T().tailorSelected'));
it('deck cost stated before the click',
   STRINGS.en.deckExportNote.indexOf('2k tokens') !== -1);
it('glossary is the only paid part of the export',
   STRINGS.en.deckExportNote.indexOf('the rest is free') !== -1);
it('glossary generated once and reused',
   /if \(batchGlossary\) return Promise\.resolve\(batchGlossary\);/.test(inline));

it('glossary written for a non-technical reader',
   glossPrompt.indexOf('no technical background') !== -1);
it('requirements covered first', glossPrompt.indexOf('Cover every requirement first') !== -1);
it('explanations must avoid further jargon',
   glossPrompt.indexOf('free of other jargon') !== -1);
it('nested jargon must itself be explained',
   glossPrompt.indexOf('explain that word too on its own line') !== -1);
it('obvious terms skipped', glossPrompt.indexOf('Skip terms a general reader would know') !== -1);
it('uncertainty stated rather than guessed',
   glossPrompt.indexOf('say so in the explanation rather than guessing') !== -1);
it('each term explains why it matters for this role',
   glossPrompt.indexOf('why it matters for this role') !== -1);

const gl = parseGlossary('ISO 26262 :: The automotive functional safety standard :: Required for in-vehicle displays\nASIL :: A risk rating inside ISO 26262 :: Shows real safety constraint experience');
it('glossary lines parsed', gl.length === 2);
it('term extracted', gl[0].term === 'ISO 26262');
it('explanation extracted', gl[0].what === 'The automotive functional safety standard');
it('relevance extracted', gl[0].why === 'Required for in-vehicle displays');
it('missing third field tolerated',
   parseGlossary('Maya :: 3D software')[0].why === '');
it('malformed lines dropped', parseGlossary('no separator here').length === 0);
it('leading bullets stripped', parseGlossary('- USD :: a format :: matters')[0].term === 'USD');
it('capped at 20 entries',
   parseGlossary(Array.from({length: 30}, (_, i) => 'T' + i + ' :: x :: y').join('\n')).length === 20);
it('empty glossary safe', parseGlossary('').length === 0);

it('matrix split so columns stay legible', /var per = 6;/.test(inline));
it('cells labelled in words, not just coloured',
   /T\(\)\['leg' \+ \(st === 'M'/.test(inline));
it('adjacency reasoning gets its own slide',
   inline.indexOf('T().deckAdjacent') !== -1);
it('every screened candidate appears, none filtered',
   STRINGS.en.deckRankingSub.indexOf('Everyone screened is listed') !== -1);
it('title slide carries the caution',
   STRINGS.en.deckCaution.indexOf('not an assessment of the people') !== -1);
it('method slide explains what was ignored in scoring',
   STRINGS.en.deckMethodPoints.join(' ').indexOf('how well the CV was written') !== -1);
it('method slide states a missing requirement is not a missing skill',
   STRINGS.en.deckMethodPoints.join(' ').indexOf('does not mean the candidate lacks the skill') !== -1);
it('method slide names the amber judgements as least certain',
   STRINGS.en.deckMethodPoints.join(' ').indexOf('least certain part') !== -1);
it('method slide carries the EU high-risk note',
   STRINGS.en.deckMethodPoints.join(' ').indexOf('high-risk') !== -1);
it('slides marked confidential', inline.indexOf('CONFIDENTIAL') !== -1 && inline.indexOf('candidate data') !== -1);
it('same number of method points in both languages',
   STRINGS.en.deckMethodPoints.length === STRINGS.sv.deckMethodPoints.length);
it('deck strings exist in both languages',
   ['deckExport','deckTitle','deckSubtitle','deckCaution','deckRanking','deckMatrix',
    'deckAdjacent','deckGlossary','deckMethod','deckTerm','deckMeans','deckWhy','deckFilename']
     .every(k => !!STRINGS.en[k] && !!STRINGS.sv[k]));
it('Swedish method points carry the same high-risk warning',
   STRINGS.sv.deckMethodPoints.join(' ').indexOf('högrisk') !== -1);

// =====================================================================
suite('Translations');

const en = Object.keys(STRINGS.en).sort();
const sv = Object.keys(STRINGS.sv).sort();
it('every English string has a Swedish counterpart',
   en.filter(k => sv.indexOf(k) === -1).length === 0);
it('no orphan Swedish strings', sv.filter(k => en.indexOf(k) === -1).length === 0);
it('types match', en.every(k => typeof STRINGS.en[k] === typeof STRINGS.sv[k]));
it('no blank strings',
   ['en','sv'].every(L => Object.keys(STRINGS[L])
     .every(k => typeof STRINGS[L][k] !== 'string' || STRINGS[L][k].trim())));
it('no long string left untranslated',
   en.filter(k => typeof STRINGS.en[k] === 'string' &&
     STRINGS.en[k] === STRINGS.sv[k] && STRINGS.en[k].length > 12).length === 0);
it('example questions present in both', 
   STRINGS.en.askExamples.length === STRINGS.sv.askExamples.length);
it('template note honest about branding in both',
   STRINGS.en.tplnote.indexOf('fonts and logos are not reproduced') !== -1 &&
   STRINGS.sv.tplnote.indexOf('typsnitt och logotyper') !== -1);
it('touch-specific strings present',
   !!STRINGS.en.candphTouch && !!STRINGS.sv.candphTouch);

// =====================================================================
console.log('\n' + '─'.repeat(52));
if (failed) {
  console.log(`\x1b[31m${failed} failed\x1b[0m, ${passed} passed  (${passed + failed} total)`);
  failures.forEach(f => console.log('  • ' + f));
  process.exit(1);
} else {
  console.log(`\x1b[32mAll ${passed} checks passed\x1b[0m across 13 suites`);
  process.exit(0);
}
