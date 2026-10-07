# Job Tailor — paid beta

A licence-gated, credit-metered version of the tool, built to hold as little of
your customers' data as possible.

## The design, in one paragraph

Your Anthropic API key lives only on the server. Customers get a licence key
worth a number of credits. Their CV is sent to the server, forwarded to Claude,
and the result is returned — then it is gone. It is never written to disk, never
written to a log, and never stored in a database. Their CV, application history
and settings live in their own browser. The server's only persistent state is a
list of hashed licence keys and credit balances.

That is a deliberate choice. Storing CVs would make you the custodian of hundreds
of people's employment histories, with everything GDPR attaches to that. This
design avoids most of it.

## Running it

```bash
cp .env.example .env      # add your Anthropic API key
npm start                 # no dependencies to install
```

Then open http://localhost:3000

## Issuing keys

```bash
npm run keys new 20            # issue a key with 20 credits
npm run keys balance JT-XXXX-… # check remaining
npm run keys topup JT-XXXX-… 20
npm run keys revoke JT-XXXX-…
npm run keys stats             # totals across all keys
```

Keys are shown once. Only the hash is stored, so a lost key cannot be recovered —
issue a new one and revoke the old.

## Tests

```bash
npm test
```

41 checks covering credit accounting, licence gating, rate limiting, and the
privacy guarantees. The privacy suite asserts that no CV text reaches logs or
disk, and includes a guard that fails if the log capture is empty — otherwise
those assertions would pass vacuously.

## Deploying

Any Node host works. Railway and Render are the quickest:

1. Push to a private GitHub repo
2. Create a web service from the repo
3. Set `ANTHROPIC_API_KEY` in the environment
4. Add a persistent volume mounted at `/data` and set `DATA_DIR=/data`

**The volume matters.** Without it, `data/credits.json` lives on ephemeral disk
and every credit balance is wiped on redeploy.

Choose an EU region if your customers are in the EU. It is one dropdown now and
an awkward conversation later.

## Taking payment

Use a merchant of record — Paddle or Lemon Squeezy — rather than Stripe directly.
They become the legal seller, which makes VAT across 27 member states their
problem rather than yours. EU digital sales owe the customer's country's VAT from
the very first sale, with no registration threshold. The fee is roughly 5% + 50¢
against Stripe's ~1.5–3%, and below roughly $20k/year that premium costs about
the same as doing the compliance yourself.

For the beta the flow is deliberately manual:

1. Customer buys through your merchant-of-record checkout
2. You run `npm run keys new 20`
3. You email them the key

Twenty customers is a handful of minutes a week. Automate it once you know the
product sells.

## Before you take a single payment

- [ ] **Settle the employment IP question.** If this was built on work time or
      relates to your employer's business, your contract may assign it to them.
      Get written confirmation. This is the one that can undo everything else.
- [ ] Privacy notice published — see `legal/PRIVACY.md`
- [ ] Terms published — see `legal/TERMS.md`
- [ ] Both reviewed by someone qualified. The withdrawal-rights and liability
      clauses in particular.
- [ ] Data processing agreement with Anthropic confirmed
- [ ] Data processing agreement with your host confirmed, EU region chosen
- [ ] A billing alert on your Anthropic account, so a runaway cannot run far
- [ ] Decided what happens to unused credits if you stop running the service
- [ ] Checked what your accountant needs from you — the merchant of record
      handles VAT, but the income is still income

## Costs

A full run with company research and salary lookup is roughly 14k tokens
including web search results. At current Sonnet pricing that is on the order of
€0.05–0.10 per run, so a 20-credit pack costs you a couple of euros to serve.
Price accordingly, and watch real usage during the beta rather than trusting
this estimate.

## What this is not

- Not multi-instance. The JSON credit store assumes one server process. Move to
  SQLite or Postgres before running more than one.
- Not a subscription system. Credits only. That is intentional: a flat monthly
  fee means one heavy user can cost more than they pay.
- Not automated fulfilment. You issue keys by hand.

## Third-party licences

The frontend uses pdf.js, mammoth.js and jsPDF from CDN, all open source under
their own licences. Your own code is your own; if you distribute this, honour
their attribution requirements.
