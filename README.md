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
node bin/decision-lab.js ask "Should I buy AAPL now?" --out decisions/drafts/aapl.json
node bin/decision-lab.js pipeline "Should we change enterprise pricing?" --type business --slug pricing
node bin/decision-lab.js new investment --out decisions/drafts/nvda.json
node bin/decision-lab.js validate examples/investment/nvidia_add_position.json
node bin/decision-lab.js audit examples/business/enterprise_pricing_change.json
node bin/decision-lab.js compare examples/finance/hiring_runway_tradeoff.json
node bin/decision-lab.js render examples/business/enterprise_pricing_change.json --out outputs/memos/pricing.md
node bin/decision-lab.js prompt all examples/business/enterprise_pricing_change.json --out-dir outputs/prompts/pricing
```

## Commands

```bash
decision-lab init [directory]
decision-lab ask [question...] [--type type] [--owner name] [--out file.json]
decision-lab run <file.json> [--out-dir directory]
decision-lab pipeline [question...] [--type type] [--owner name] [--slug name] [--out-dir directory]
decision-lab new <general|investment|business|finance> [--out file.json]
decision-lab validate <file.json>
decision-lab score <file.json>
decision-lab audit <file.json>
decision-lab compare <file.json>
decision-lab render <file.json> [--out memo.md]
decision-lab brief <file.json> [--out brief.md]
decision-lab review-plan <file.json> [--out review.md]
decision-lab ledger [directory] [--out ledger.md]
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

The pipeline writes:

- `decision.json`
- `run/audit.json`
- `run/compare.md`
- `run/memo.md`
- `run/brief.md`
- `run/review-plan.md`
- `run/agent-report.md`
- `run/prompts/*.md`

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
