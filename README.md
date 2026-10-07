# AI CV Tools

Two browser tools for CV work, built by John Mawdsley in 2026 by directing Claude (Anthropic) through a long series of design, build, test and fix cycles. I set the requirements, made the product decisions, reported bugs from real use and decided what shipped. Claude wrote the code and the tests to my specification.

This repository is here as a record of that work.

## What is in it

| Folder | What it is |
| --- | --- |
| `job-tailor/` | **Job Tailor**, for job seekers. Takes your CV and a job posting and returns a tailored CV, a cover letter, an ATS match score, a skills gap analysis, interview preparation and optional company and salary research. |
| `cv-screen/` | **CV Screen**, for consultancies and recruiters. Screens a batch of CVs against a brief, builds a requirements matrix (met, adjacent, not evidenced), tailors shortlisted CVs into a company template and exports a PowerPoint for non-technical stakeholders. |
| `beta-server/` | A small Node.js backend for a paid beta: licence keys, credits, rate limiting, no CV logging. |
| `test-data/` | Thirteen fictional CVs and two fictional job postings used for testing. None of these people exist. |

Each tool is a single self-contained HTML file. Open it as a Claude artifact and it runs with no install.

## Job Tailor features

- Drag and drop a CV as PDF or Word, paste a job posting or link
- Role confirmation step, so the tool says which job it thinks you are applying for before it writes anything (added after it once tailored a CV to the wrong Volvo role)
- Tailored CV with uneven detail across roles, so it reads like a person wrote it rather than a template
- "Super enhance" for chosen positions, with hard limits: it adds nothing that is not in the original CV and never upgrades "worked on" to "led"
- Skills gap with an option to claim a skill you do have and link it to the position where you used it
- Cover letter, PDF export with templates
- Optional company research and salary estimate, off by default, each showing an estimated token cost before you run it
- Practice interview questions per job
- Application history with CSV export and pattern analysis once you have five or more applications
- English and Swedish interface. Output language follows the job posting, not the CV
- A confidence section that says what the tool is unsure of

## CV Screen features

- Upload a company CV template, a brief and a batch of CVs
- Screens in batches of five, ranks candidates and shows a colour-coded requirements matrix
- Missing evidence is reported as missing evidence, not as a judgement of the candidate
- Nobody is filtered out automatically. The human picks the shortlist, and tailoring is a separate step that only runs on the people they choose
- Glossary for tool names and abbreviations, and an "ask the CV" panel that only answers from what the CV states
- PowerPoint export with the matrix and a plain-language glossary
- EU AI Act notice: CV screening is a high-risk use, so the tool is built as decision support with a human in the loop

## Testing

I wanted evidence the tools worked, not just a demo, so testing became part of the brief.

- **Job Tailor:** 454 checks across 31 suites
- **CV Screen:** 233 checks across 13 suites
- **Beta server:** 41 checks

The test suites pull the real functions out of the shipped HTML files and run them, so they test the code users get rather than a copy of it.

On top of that, **mutation testing** deliberately breaks the code one piece at a time (for example: let the score go above 100, drop a candidate from the export, let the prompt inflate seniority) and checks that the tests notice. Current results:

- Job Tailor: 34 caught, 0 missed, 1 equivalent
- CV Screen: 30 caught, 0 missed

The mutation runners refuse to run if the normal suite is failing, because a crashing suite would otherwise report a false 100%.

### Running the tests

Requires Node.js 18 or later.

```
cd job-tailor && node test-suite.js && node mutation-test.js
cd cv-screen  && node cv-screen-test.js && node cv-screen-mutation.js
cd beta-server && node test/backend.test.js
```

## Bugs found and fixed along the way

A selection, because the fixes say more about the process than the feature list does:

- Section headers followed by a colon or dash leaked into the content. Then lowercase headers broke parsing. Then ordinary sentences starting with "Salary" were read as headers. Fixed with a line-anchored, case-insensitive pattern that needs the header to stand alone.
- The tool tailored a CV to the wrong role at the same company. Fixed with an explicit role confirmation step.
- PDF export produced a blank page on some browsers. Fixed with a different download method and guards.
- Swedish names with accented letters switched the output language to Swedish. The posting now decides the language.
- Swedish section headers stopped applications saving. Fixed with header aliases, a fallback role name and a visible warning if parsing fails.
- The PowerPoint export silently stopped at 20 candidates. Removed the cap and added pagination, plus a mutation test so it cannot come back.

## Tech stack

Vanilla JavaScript, HTML and CSS. pdf.js and mammoth for reading CVs, jsPDF for PDF export, PptxGenJS for PowerPoint. The Claude API for the language work. Node.js with no framework for the beta server.

## Licence

Copyright 2026 John Mawdsley. All rights reserved. See `LICENSE`.
