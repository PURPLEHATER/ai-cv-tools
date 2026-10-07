# Mock CVs for testing the batch screen

Thirteen fictional candidates and a job brief. Every person, company and
project is invented.

The set is built to test the ranking rather than flatter it. Drop all
thirteen CV files in at once and paste one of the two postings as the brief.

## The two postings

**`00-posting-A-realistic.txt`** — a full job posting as it would appear on
a careers page: company blurb, benefits, application process, and the seven
hard requirements buried among soft ones ("genuine team player", "comfortable
with ambiguity") and nice-to-haves. Use this one for the real test. The
requirement extraction should pull out Unreal, Python, Houdini, HLSL, USD,
Maya and ISO 26262 — and should *not* create columns for "team player" or
"clear communicator", which cannot be checked against a CV.

**`00-posting-B-vague.txt`** — a posting with no concrete requirements at
all, only enthusiasm. This is the control. The tool should either produce
no matrix or very few columns, and should not invent requirements the
posting never stated. If it manufactures a tidy seven-column table from this,
that is a bug worth knowing about.

## What each one is there to test

| File | What it should surface |
|---|---|
| 01 Maya Lindqvist | The clear top match. If this is not near the top, something is wrong. |
| 02 Tomas Berg | **The amber case.** C++/OpenGL/GLSL where the brief wants Unreal/HLSL. Genuinely transferable, not a match. Watch which cells go amber and whether the reasoning underneath is sound. |
| 03 Priya Raman | **Strong but terse.** Four lines, no bullets, no elaboration — but hits nearly every requirement. If brevity drops her down the list, the scoring is rewarding verbosity. |
| 04 Daniel Oakes | **Verbose but weak.** Buzzword-dense, genuinely missing almost every requirement. The mirror of 03. If he outranks her, the scoring is being fooled by fluency. |
| 05 Elin Sundberg | Career changer. Real Unreal depth, no games background. Tests whether adjacent-industry experience is read fairly. |
| 06 Anders Holm | **Swedish-language CV.** Tests that a non-English CV is scored on content, not penalised for language. Also the only other ISO 26262 holder. |
| 07 Jonas Friberg | Three-year employment gap (2020–2023). Should appear as a factual observation, not a penalty. |
| 08 Sara Nilsson | Junior. Should rank low on evidence without the language becoming dismissive. |
| 09 Martin Eklund | Wrong field entirely. The floor of the ranking. |
| 10 Katrin Vogel | **Strong on paper, wrong specialism.** Excellent Houdini/USD, but film and episodic rather than real-time, and no Unreal at all. Tests whether seniority is mistaken for fit. |
| 11 Oskar Lindholm | Contractor, nine short engagements, self-taught. Tests whether job-hopping or lack of a degree leaks into the score when the brief asks for neither. |
| 12 Yusuf Demir | **Acronym-heavy.** ASIL-B, AUTOSAR, SPICE, MISRA, ADAS, HMI, UE5. This is the one to check the glossary against. |
| 13 Lars Petersson | **Unreadable.** A scanned image with no text layer. Should be reported as unreadable, not silently dropped. |

## Things worth checking in the output

- Does 03 (terse, strong) beat 04 (verbose, weak)? That is the single most
  useful signal in this set.
- Are the amber cells on 02 justified in the notes under the table, or
  asserted without reason?
- Does 06 score on its content despite being in Swedish?
- Is 07's gap described neutrally?
- Does the count of unreadable files mention 13?
- With posting A, are the columns the seven real requirements — and are the
  soft ones left out?
- With posting B, does it correctly find almost nothing rather than inventing
  structure?
- Does the glossary explain ASIL, SPICE and MISRA, and skip obvious ones?

## Cost

Thirteen CVs is roughly 25k tokens to screen — a useful rehearsal before
committing to a hundred.
