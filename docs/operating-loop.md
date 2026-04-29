# Operating Loop

Decision Lab is most useful when it is run as a cadence, not as a one-off prompt.

## Daily Triage

Use this when decisions are actively moving.

```bash
node bin/decision-lab.js next decisions --as-of 2026-08-01 --out outputs/next.md
node bin/decision-lab.js prioritize decisions --as-of 2026-08-01 --out outputs/priorities.md
node bin/decision-lab.js status decisions --as-of 2026-08-01 --out outputs/status.md
node bin/decision-lab.js stale decisions --days 14 --as-of 2026-08-01 --out outputs/stale.md
node bin/decision-lab.js debt decisions --days 14 --as-of 2026-08-01 --out outputs/debt.md
node bin/decision-lab.js agenda decisions --as-of 2026-08-01 --horizon 14 --out outputs/agenda.md
node bin/decision-lab.js questions decisions --out outputs/questions.md
node bin/decision-lab.js guardrails decisions --out outputs/guardrails.md
node bin/decision-lab.js review-pack decisions --as-of 2026-08-01 --out-dir outputs/reviews/2026-08-01
```

Daily questions:

- Which decision is blocked by missing evidence?
- Which decision has a deadline before the evidence is good enough?
- Which high-impact risk has no owner?
- Which stale record needs to be promoted, closed, or deleted from active attention?
- Which debt item would compound fastest if ignored for another week?
- Which open question or weak evidence item is blocking the next judgment?
- Which guardrail says this decision should stop, narrow, or reverse?

## Before Committing

Use this before buying, hiring, changing pricing, shipping a strategy, or approving spend.

```bash
node bin/decision-lab.js checklist decisions/active/pricing.json --out outputs/checklists/pricing.md
node bin/decision-lab.js research-plan decisions/active/pricing.json --out outputs/research/pricing.md
node bin/decision-lab.js premortem decisions/active/pricing.json --out outputs/premortems/pricing.md
node bin/decision-lab.js gate decisions/active --min-score 0.85 --operational --out outputs/gate.md
```

Commit only when:

- the recommendation has an explicit runner-up
- the strongest opposing case is visible
- the most fragile assumption has a test
- the risk trigger is observable
- the review date is scheduled

## Weekly Review

Use this to operate the whole decision portfolio.

```bash
node bin/decision-lab.js ledger decisions --out outputs/ledger.md
node bin/decision-lab.js risks decisions --out outputs/risks.md
node bin/decision-lab.js assumptions decisions --out outputs/assumptions.md
node bin/decision-lab.js timeline decisions --out outputs/timeline.md
node bin/decision-lab.js dashboard decisions --out outputs/dashboard.html
```

Weekly questions:

- Which decision has the worst evidence-to-confidence mismatch?
- Which assumptions repeat across multiple decisions?
- Which decision should be split into a smaller reversible pilot?
- Which reviewed decision changed how future decisions should be framed?

## Monthly Operating Pack

Use this to create a durable review folder.

```bash
node bin/decision-lab.js pack decisions --as-of 2026-08-01 --out-dir outputs/packs/2026-08-01
```

The pack includes ledger, dashboard, exports, calibration, due reviews, risks, assumptions, sources, monthly review, next actions, priorities, timeline, and doctor checks.

## After Outcome

Use this when the decision has played out enough to learn from it.

```bash
node bin/decision-lab.js review decisions/active/pricing.json --out outputs/reviews/pricing.md
node bin/decision-lab.js close decisions/active/pricing.json --outcome "Pilot completed." --lesson "Finance reporting needed earlier."
node bin/decision-lab.js calibration decisions --out outputs/calibration.md
node bin/decision-lab.js archive-plan decisions --destination decisions/archive --out outputs/archive-plan.md
```

The goal is not to prove the decision was right. The goal is to make the next similar decision sharper.
