# Decision Lab

Decision Lab is a schema-first personal decision operating system for investment, finance, and management judgment.

It is not a prompt pile. It is a way to turn a vague question into a durable decision record:

1. Frame the decision.
2. State the thesis.
3. Compare options.
4. Attach evidence.
5. Register assumptions.
6. Force counterarguments.
7. Score the decision.
8. Render a memo.
9. Review the outcome later.

## Quick Start

```bash
npm test
npm run verify
node bin/decision-lab.js ask "Should I buy AAPL now?" --out decisions/drafts/aapl.json
node bin/decision-lab.js pipeline "Should we change enterprise pricing?" --type business --slug pricing
node bin/decision-lab.js new investment --out decisions/drafts/nvda.json
node bin/decision-lab.js validate examples/investment/nvidia_add_position.json
node bin/decision-lab.js audit examples/business/enterprise_pricing_change.json
node bin/decision-lab.js evidence examples/business/enterprise_pricing_change.json --claim "Pipeline data refreshed" --source "CRM export" --strength strong --out /tmp/pricing.json
node bin/decision-lab.js doctor
node bin/decision-lab.js migrate decisions/old/aapl.json --report outputs/migration-aapl.md
node bin/decision-lab.js dashboard examples --out outputs/dashboard.html
node bin/decision-lab.js export examples --format csv --out outputs/decisions.csv
node bin/decision-lab.js compare examples/finance/hiring_runway_tradeoff.json
node bin/decision-lab.js diff decisions/snapshots/pricing-before.json decisions/active/pricing.json --out outputs/diffs/pricing.md
node bin/decision-lab.js graph examples/business/enterprise_pricing_change.json --out outputs/graphs/pricing.md
node bin/decision-lab.js render examples/business/enterprise_pricing_change.json --out outputs/memos/pricing.md
node bin/decision-lab.js prompt all examples/business/enterprise_pricing_change.json --out-dir outputs/prompts/pricing
```

## Commands

```bash
decision-lab init [directory]
decision-lab ask [question...] [--type type] [--owner name] [--out file.json]
decision-lab inbox <questions.txt> [--type type] [--owner name] [--out-dir decisions/drafts]
decision-lab run <file.json> [--out-dir directory]
decision-lab pipeline [question...] [--type type] [--owner name] [--slug name] [--out-dir directory]
decision-lab new <general|investment|business|finance> [--out file.json]
decision-lab validate <file.json>
decision-lab score <file.json>
decision-lab audit <file.json>
decision-lab health <file.json>
decision-lab compare <file.json>
decision-lab diff <before.json> <after.json> [--out diff.md]
decision-lab graph <file.json> [--out graph.md]
decision-lab evidence <file.json> --claim text --source text [--strength weak|medium|strong] [--out file.json]
decision-lab source <source-file> [--title text] [--kind text] [--out source.md]
decision-lab source-evidence <file.json> <source-file> --claim text [--strength weak|medium|strong] [--out file.json]
decision-lab patch <file.json> <patch.json> [--out file.json]
decision-lab set <file.json> <path> <json-value> [--out file.json]
decision-lab migrate <file.json> [--out file.json] [--report report.md]
decision-lab render <file.json> [--out memo.md]
decision-lab brief <file.json> [--out brief.md]
decision-lab review-plan <file.json> [--out review.md]
decision-lab ledger [directory] [--out ledger.md]
decision-lab dashboard [directory] [--out dashboard.html]
decision-lab export [directory] [--format json|csv] [--out file]
decision-lab calibration [directory] [--out report.md]
decision-lab risks [directory] [--out report.md]
decision-lab assumptions [directory] [--out report.md]
decision-lab sources [directory] [--out report.md]
decision-lab monthly [directory] [--as-of YYYY-MM-DD] [--out report.md]
decision-lab pack [directory] [--as-of YYYY-MM-DD] [--out-dir outputs/packs/YYYY-MM-DD]
decision-lab due [directory] [--as-of YYYY-MM-DD] [--out report.md]
decision-lab search [directory] --query text [--out report.md]
decision-lab doctor [directory] [--out report.md]
decision-lab gate [directory] [--min-score 0.75] [--operational] [--out report.md]
decision-lab stale [directory] [--days 30] [--as-of YYYY-MM-DD] [--out report.md]
decision-lab promote <file.json> <draft|researching|decided|reviewed> [--out file.json]
decision-lab review <file.json> [--out worksheet.md]
decision-lab close <file.json> --outcome text [--lesson text] [--out file.json]
decision-lab prompt <analyst|skeptic|cfo|ceo|operator|risk|recorder|all> <file.json> [--out file.md|--out-dir prompts]
decision-lab list-types
decision-lab list-prompts
```

## Repository Shape

```text
bin/                  CLI entrypoint
src/                  validation, scoring, audits, bot workflow, rendering, prompt generation
schemas/              JSON schemas for decision records
prompts/              reusable role prompts
examples/             complete investment, business, and finance records
docs/                 operating system, playbooks, and framework notes
decisions/            local decision records created by `init`
research/             sources and financial/model artifacts created by `init`
outputs/              rendered memos, briefs, reviews, and prompts
test/                 Node test runner tests
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the module map and data flow.

## Decision Types

`general` is the shared base for any meaningful decision.

`investment` adds asset, portfolio context, valuation, catalysts, and risk controls.

`business` adds strategic goal, stakeholders, financial impact, execution plan, pilot design, and operating cadence.

`finance` adds financial hypothesis, model driver, runway/planning horizon, scenarios, sensitivity checks, and guardrails.

## Core Record

Every mature record should include:

- `decision_frame`: reversibility, urgency, default action, desired outcome, constraints, non-goals
- `hypotheses`: thesis statements with assumptions, evidence, counterarguments, and disconfirming signals
- `options`: possible actions
- `decision_criteria`: weighted criteria
- `option_scores`: score each option against each criterion
- `assumption_register`: the assumptions most likely to break the conclusion
- `post_decision_review`: metrics and questions for judgment improvement

## Role Chain

Use the same record with multiple roles:

- `analyst`: strengthens the thesis and identifies missing evidence
- `skeptic`: breaks the thesis and finds hidden assumptions
- `cfo`: translates the decision into financial impact and opportunity cost
- `ceo`: judges strategy, timing, and long-term compounding value
- `operator`: turns the decision into pilots, owners, milestones, and kill criteria
- `risk`: maps fragile assumptions, correlated downside, and early-warning indicators
- `recorder`: writes the final auditable memo

## Bot Workflow

Use `ask` when you have only a rough question:

```bash
node bin/decision-lab.js ask "Should I buy AAPL now?" --out decisions/drafts/aapl.json
```

Use `run` when a decision JSON already exists:

```bash
node bin/decision-lab.js run decisions/drafts/aapl.json --out-dir outputs/runs/aapl
```

Use `pipeline` to do both at once:

```bash
node bin/decision-lab.js pipeline "Should we hire two engineers despite runway pressure?" --type finance --slug hiring-runway
```

Use `inbox` when you have several rough questions:

```bash
node bin/decision-lab.js inbox inbox.txt --out-dir decisions/drafts
```

The pipeline writes:

- `decision.json`
- `run/audit.json`
- `run/compare.md`
- `run/memo.md`
- `run/brief.md`
- `run/review-plan.md`
- `run/agent-report.md`
- `run/prompts/*.md`

## Improve Records

Attach evidence:

```bash
node bin/decision-lab.js evidence decisions/drafts/aapl.json \
  --claim "Latest 10-Q shows services margin resilience." \
  --source "Company filing" \
  --strength strong \
  --source-type primary \
  --recency current
```

Normalize a source note and link it as evidence:

```bash
node bin/decision-lab.js source raw-notes/customer-qbr.md --title "Customer QBR" --out research/sources/customer-qbr.md
node bin/decision-lab.js source-evidence decisions/drafts/aapl.json research/sources/customer-qbr.md \
  --claim "Customer notes support the core hypothesis." \
  --strength medium
```

Apply JSON patches proposed by role prompts or another agent:

```bash
node bin/decision-lab.js patch decisions/drafts/aapl.json proposed-edits.json
```

Set a single field:

```bash
node bin/decision-lab.js set decisions/drafts/aapl.json recommendation.confidence 0.62
```

Track judgment over time:

```bash
node bin/decision-lab.js calibration decisions --out outputs/calibration.md
node bin/decision-lab.js doctor
```

Generate a local dashboard or export:

```bash
node bin/decision-lab.js dashboard decisions --out outputs/dashboard.html
node bin/decision-lab.js export decisions --format csv --out outputs/decisions.csv
node bin/decision-lab.js export decisions --format json --out outputs/decisions.json
```

Find due reviews and search the ledger:

```bash
node bin/decision-lab.js due decisions --as-of 2026-08-01
node bin/decision-lab.js search decisions --query platform
node bin/decision-lab.js review decisions/active/pricing.json --out outputs/memos/pricing-review-worksheet.md
node bin/decision-lab.js promote decisions/drafts/pricing.json decided
```

Review decision portfolios:

```bash
node bin/decision-lab.js risks decisions --out outputs/risks.md
node bin/decision-lab.js assumptions decisions --out outputs/assumptions.md
node bin/decision-lab.js sources decisions --out outputs/sources.md
node bin/decision-lab.js monthly decisions --as-of 2026-08-01 --out outputs/monthly.md
node bin/decision-lab.js pack decisions --as-of 2026-08-01 --out-dir outputs/packs/2026-08-01
```

Enforce quality and find neglected records:

```bash
node bin/decision-lab.js gate decisions --min-score 0.85 --operational
node bin/decision-lab.js stale decisions --days 30 --as-of 2026-08-01
```

Visualize a record as a Mermaid graph:

```bash
node bin/decision-lab.js graph decisions/active/pricing.json --out outputs/graphs/pricing.md
```

Compare two versions of a record:

```bash
node bin/decision-lab.js diff decisions/snapshots/pricing-before.json decisions/active/pricing.json --out outputs/diffs/pricing.md
```

Upgrade older records into the current operating schema:

```bash
node bin/decision-lab.js migrate decisions/old/pricing.json --report outputs/migrations/pricing.md
node bin/decision-lab.js migrate decisions/old/pricing.json --out decisions/active/pricing.json --date 2026-04-29
```

## Philosophy

Good judgment is not just a better answer. It is a better loop.

Decision Lab is built to fight:

- confident but unsupported recommendations
- decisions that never state their assumptions
- hidden downside that appears only after commitment
- no postmortem loop, so judgment never compounds

The record should always answer:

- What must be true?
- What is the strongest opposing case?
- What evidence would change my mind?
- Which option wins under explicit criteria?
- How will I know later whether this was a good decision?
