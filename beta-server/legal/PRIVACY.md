# Privacy notice — DRAFT

**This is a starting draft, not legal advice.** Have it reviewed before you take
money. It describes what the software actually does, which is the hard part;
a lawyer can then get the wording right.

Replace every `[SQUARE BRACKET]` before publishing.

---

## Who is responsible

[YOUR NAME / COMPANY], [ADDRESS], [EMAIL] is the data controller for this
service.

## What this service does with your CV

Your CV and the job posting you paste are sent to our server, forwarded to
Anthropic's Claude API to generate your application materials, and the result is
returned to your browser.

**They are not stored.** They exist in memory for the few seconds the request
takes and are then discarded. They are not written to any database, any file, or
any log.

## What is stored on the server

Only this, for each licence key:

- A SHA-256 hash of the key (not the key itself)
- How many credits remain
- How many have been used
- The date the key was issued and the date it was last used

There is no account, no name, no email address and no password associated with a
licence key on our side.

We also log the number of tokens each request consumed, for cost tracking. Token
counts contain no personal data.

## What is stored in your browser

Your saved CV, your application history, your interview preparation and your
settings are stored in your own browser using `localStorage`. They never leave
your device except as part of a request you trigger, and they are not readable by
us.

Clearing your browser data for this site deletes all of it permanently. We hold
no copy and cannot restore it.

## Processors

- **Anthropic** — processes the CV and job posting to generate output.
  See Anthropic's privacy policy and commercial terms.
  [CONFIRM YOUR DATA PROCESSING AGREEMENT WITH ANTHROPIC IS IN PLACE]
- **[HOSTING PROVIDER]** — runs the server.
  [CONFIRM DPA AND SERVER REGION]

## Lawful basis

[LIKELY: performance of a contract, since processing your CV is the service you
paid for. CONFIRM WITH A LAWYER.]

## Your rights

Under GDPR you may request access to, correction of, or deletion of your personal
data, and may lodge a complaint with a supervisory authority
(in Sweden, Integritetsskyddsmyndigheten, IMY).

In practice, because we do not store your CV, there is very little for us to
give you or delete. If you want your credit record removed, email [EMAIL] with
your licence key and we will delete it.

## International transfers

Anthropic processes data in [CONFIRM REGION]. [ADD TRANSFER MECHANISM IF
DATA LEAVES THE EU/EEA — SCCs OR AN ADEQUACY DECISION.]

## Retention

- CV and job posting: not retained
- Credit records: until you ask for deletion, or [N] months after the last use
- Server logs (token counts, error codes): [N] days

## Changes

Last updated [DATE]. Material changes will be posted here.
