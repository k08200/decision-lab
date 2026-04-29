# Decision Agent System

The bot layer is intentionally local-first. It does not require an API key to create useful structure.

## Commands

`config` writes local defaults for owner, directories, quality gate thresholds, and stale decision age.

```bash
node bin/decision-lab.js config --out .decision-lab.json
```

`ask` turns a rough question into a valid decision record.

```bash
node bin/decision-lab.js ask "Should I buy AAPL now?" --out decisions/drafts/aapl.json
```

`inbox` turns a plain text list of questions into multiple decision drafts.

```bash
node bin/decision-lab.js inbox inbox.txt --out-dir decisions/drafts
```

`run` takes an existing record and generates memo, brief, audit, health, option comparison, checklist, premortem, research plan, graph, review plan, agent report, and role prompts.

```bash
node bin/decision-lab.js run decisions/drafts/aapl.json --out-dir outputs/runs/aapl
```

`graph` renders a Mermaid map of a record so thesis, evidence, assumptions, and risks can be inspected visually.

```bash
node bin/decision-lab.js graph decisions/drafts/aapl.json --out outputs/graphs/aapl.md
```

`diff` compares two versions of a decision record.

```bash
node bin/decision-lab.js snapshot decisions/active/aapl.json --label before-change
node bin/decision-lab.js diff decisions/snapshots/aapl-before.json decisions/active/aapl.json --out outputs/diffs/aapl.md
```

`premortem` converts risks, fragile assumptions, and counterarguments into a pre-commit failure review.

```bash
node bin/decision-lab.js premortem decisions/active/aapl.json --out outputs/premortems/aapl.md
```

`research-plan` converts weak evidence, open questions, assumptions, and disconfirming signals into research tasks.

```bash
node bin/decision-lab.js research-plan decisions/active/aapl.json --out outputs/research/aapl.md
```

`pipeline` creates the record and runs the full workflow in one command.

```bash
node bin/decision-lab.js pipeline "Should we change enterprise pricing?" --type business --slug pricing
```

`ledger` scans decision records and creates a portfolio view of judgment.

```bash
node bin/decision-lab.js ledger decisions --out outputs/ledger.md
node bin/decision-lab.js status decisions --as-of 2026-08-01 --out outputs/status.md
```

`calibration` summarizes reviewed decisions by type and confidence bucket.

```bash
node bin/decision-lab.js calibration decisions --out outputs/calibration.md
```

`evidence`, `patch`, and `set` improve existing records without rewriting them by hand.

```bash
node bin/decision-lab.js evidence decisions/drafts/aapl.json --claim "Claim text" --source "Source"
node bin/decision-lab.js source raw-notes/customer-qbr.md --title "Customer QBR" --out research/sources/customer-qbr.md
node bin/decision-lab.js source-evidence decisions/drafts/aapl.json research/sources/customer-qbr.md --claim "Claim text"
node bin/decision-lab.js patch decisions/drafts/aapl.json proposed-edits.json
node bin/decision-lab.js set decisions/drafts/aapl.json recommendation.confidence 0.62
```

`migrate` upgrades older records into the current schema and can write a migration report.

```bash
node bin/decision-lab.js migrate decisions/old/aapl.json --report outputs/migrations/aapl.md
```

`due`, `search`, `review`, and `promote` keep the system operational as records accumulate.

```bash
node bin/decision-lab.js due decisions --as-of 2026-08-01
node bin/decision-lab.js search decisions --query platform
node bin/decision-lab.js review decisions/active/pricing.json --out outputs/memos/pricing-review.md
node bin/decision-lab.js promote decisions/drafts/pricing.json decided
```

`risks`, `assumptions`, `sources`, `owners`, `briefing`, `monthly`, `next`, `prioritize`, and `timeline` turn individual records into portfolio-level operating reports.

```bash
node bin/decision-lab.js risks decisions --out outputs/risks.md
node bin/decision-lab.js risk-heatmap decisions --out outputs/risk-heatmap.md
node bin/decision-lab.js assumptions decisions --out outputs/assumptions.md
node bin/decision-lab.js sources decisions --out outputs/sources.md
node bin/decision-lab.js evidence-scorecard decisions --out outputs/evidence-scorecard.md
node bin/decision-lab.js owners decisions --as-of 2026-08-01 --out outputs/owners.md
node bin/decision-lab.js briefing decisions --as-of 2026-08-01 --out outputs/briefing.md
node bin/decision-lab.js monthly decisions --as-of 2026-08-01 --out outputs/monthly.md
node bin/decision-lab.js next decisions --as-of 2026-08-01 --out outputs/next.md
node bin/decision-lab.js prioritize decisions --as-of 2026-08-01 --out outputs/priorities.md
node bin/decision-lab.js timeline decisions --out outputs/timeline.md
```

`pack` writes the full operating report set in one directory.

```bash
node bin/decision-lab.js pack decisions --as-of 2026-08-01 --out-dir outputs/packs/2026-08-01
```

`agenda` turns the portfolio into a near-term operating agenda.

```bash
node bin/decision-lab.js agenda decisions --as-of 2026-08-01 --horizon 14 --out outputs/agenda.md
```

`questions` shows what still has to be learned before the judgment should harden.

```bash
node bin/decision-lab.js questions decisions --out outputs/questions.md
```

`hypotheses` collects thesis statements, supporting evidence, counterarguments, and disconfirming signals.

```bash
node bin/decision-lab.js hypotheses decisions --out outputs/hypotheses.md
```

`review-pack` writes worksheets for every due review into one folder.

```bash
node bin/decision-lab.js review-pack decisions --as-of 2026-08-01 --out-dir outputs/reviews/2026-08-01
```

`scorecard` summarizes repository health in one page.

```bash
node bin/decision-lab.js scorecard decisions --as-of 2026-08-01 --out outputs/scorecard.md
```

`triage` assigns each decision to the next operating lane.

```bash
node bin/decision-lab.js triage decisions --as-of 2026-08-01 --out outputs/triage.md
```

`guardrails` keeps stop conditions, success metrics, failure signals, constraints, and change-my-mind conditions visible.

```bash
node bin/decision-lab.js guardrails decisions --out outputs/guardrails.md
```

`gate`, `stale`, and `debt` enforce quality, surface neglected records, and show accumulated decision debt.

```bash
node bin/decision-lab.js gate decisions --min-score 0.85 --operational
node bin/decision-lab.js stale decisions --days 30 --as-of 2026-08-01
node bin/decision-lab.js debt decisions --days 30 --as-of 2026-08-01 --out outputs/debt.md
node bin/decision-lab.js archive-plan decisions --destination decisions/archive --out outputs/archive-plan.md
```

`doctor` checks repository wiring and example decision validity.

```bash
node bin/decision-lab.js doctor
```

`dashboard` and `export` make the ledger usable outside the terminal.

```bash
node bin/decision-lab.js dashboard decisions --out outputs/dashboard.html
node bin/decision-lab.js export decisions --format csv --out outputs/decisions.csv
```

`close` marks a decision as reviewed and records the outcome.

```bash
node bin/decision-lab.js close decisions/active/pricing.json --outcome "Pilot completed." --lesson "Finance reporting needed earlier."
```

## What The Bot Does

- infers decision type from the question
- reads local defaults from `.decision-lab.json`
- creates a schema-valid decision record
- creates batches of decision drafts from inbox files
- chooses a staged default when uncertainty is material
- generates option scores
- creates role prompts for analyst, skeptic, CFO, CEO, operator, risk, and recorder
- creates audit, memo, brief, comparison, review plan, and agent report
- renders type-specific decision checklists
- renders Mermaid decision maps for visual inspection
- compares record versions for review and change tracking
- generates premortem reports before commitment
- creates research plans from weak evidence and open questions
- applies JSON patch edits safely
- migrates older records into the current schema
- attaches evidence without breaking the record shape
- normalizes source notes and links them as evidence
- tracks calibration across reviewed decisions
- reports outcomes and lessons from reviewed decisions
- lists due reviews and searches the decision ledger
- produces review worksheets and status promotion updates
- aggregates risk, assumption, and source registers
- groups active work and due reviews by owner
- creates monthly operating review packs
- creates portfolio-level action queues
- ranks decisions by priority signals
- creates one-page portfolio briefings
- creates integrity manifests with validation status and file hashes
- creates repository status summaries and archive plans
- creates timeline reports and point-in-time snapshots
- writes full operating packs for recurring review
- enforces quality gates and highlights stale decisions
- renders a standalone HTML dashboard
- surfaces priority, high-risk, due-review, and action-count fields in the dashboard
- exports decision summaries to CSV or JSON

## What The Bot Does Not Do

- it does not fabricate market data, financial metrics, or customer evidence
- it does not treat prompts as the source of truth
- it does not let confidence outrun evidence

The JSON decision record remains the source of truth.
