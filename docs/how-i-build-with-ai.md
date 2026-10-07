# How I build with AI

This is the process behind the tools in this repository. My background is product development and engineering project leadership in automotive. What I bring is knowing what a tool has to do, what the user will hate, and when something is not finished. Claude does the coding.

## The loop

**1. Start from a real problem.** Job Tailor started with my own job applications. CV Screen grew out of the other side of the same problem: consultancies screening candidates and reformatting their CVs into a house template.

**2. Build the smallest useful thing.** The first version took a CV and a posting and returned a tailored CV. Everything else came later, one feature at a time.

**3. Use it on real inputs, not demo inputs.** Real postings from Volvo, Saab and LinkedIn, real PDFs, a phone instead of a laptop, Swedish instead of English. Almost every serious bug came from this step, not from planning.

**4. Report bugs precisely.** "It tailored my CV for Senior Technical Artist when I applied for Group Design Leader" is a bug report the AI can act on. "It's wrong" is not.

**5. Make the product decisions myself.** The AI will happily build whatever is asked. Deciding what should not be built is the job. Examples from this project:

- The job posting decides the output language. Not the CV, and not a Swedish school name with an accented letter in it.
- Company research and salary estimates are off by default, and each shows its token cost before you run it.
- "Super enhance" has no target score. Chasing a number would push the model to invent experience.
- The screening tool never removes a candidate on its own. A person picks the shortlist.
- The candidate-representation mode was taken out of Job Tailor once CV Screen existed, so each tool has one job.

**6. Ask for tests, then test the tests.** Each fix comes with a check that would have caught it. The suites run the real functions from the shipped files, so they test what users actually get.

**7. Mutation testing.** Break the code on purpose, one change at a time, and confirm a test fails. Between this and reviewing the tests themselves, I found tests that passed for the wrong reason, tests that checked a copy of the code instead of the code, and one case where a crashing suite reported a perfect score. All three are now guarded against.

**8. Fix the writing, not just the code.** I didn't want output that reads as AI-written. The tools vary how much detail each role gets, avoid stock phrases, and strip the punctuation habits that give AI text away.

## What I learned

- AI is fast at writing code and slow at noticing what's missing. The human job is noticing.
- A test that passes is not evidence until you've seen it fail.
- Honesty has to be designed in. Left alone, a model asked to improve a CV will improve the person. Every prompt here has explicit limits on what it may add.
- Scope creep is free to build and expensive to maintain. Removing a feature was sometimes the best change.

## Numbers

| | Job Tailor | CV Screen | Beta server |
| --- | --- | --- | --- |
| Automated checks | 454 | 233 | 41 |
| Mutations caught | 34 of 34 | 30 of 30 | |
