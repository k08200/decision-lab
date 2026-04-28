# Decision Lab

Decision Lab is a schema-first framework for investment, finance, and management decisions.

It is not a prompt pile. It is a decision operating system:

1. State the decision.
2. Make the thesis explicit.
3. Attach evidence and assumptions.
4. Force counterarguments.
5. Score quality and risk.
6. Render a decision memo.
7. Define what would change your mind later.

## Quick Start

```bash
npm test
node bin/decision-lab.js new investment > my-decision.json
node bin/decision-lab.js validate examples/investment/nvidia_add_position.json
node bin/decision-lab.js render examples/business/enterprise_pricing_change.json
node bin/decision-lab.js render examples/finance/hiring_runway_tradeoff.json
node bin/decision-lab.js prompt skeptic examples/investment/nvidia_add_position.json
```

## Commands

```bash
decision-lab new <general|investment|business|finance>
decision-lab validate <file.json>
decision-lab score <file.json>
decision-lab render <file.json> [--out memo.md]
decision-lab prompt <analyst|skeptic|cfo|ceo|recorder> <file.json>
decision-lab list-prompts
```

## Repository Shape

```text
bin/                  CLI entrypoint
src/                  decision validation, scoring, rendering
schemas/              JSON schemas for decision records
prompts/              role prompts for LLM-assisted reasoning
examples/             realistic sample decisions
test/                 Node test runner tests
docs/                 framework notes
```

## Decision Types

`general` is the shared base for any meaningful decision.

`investment` adds:

- asset, ticker, time horizon, position action
- upside thesis and downside thesis
- valuation, catalysts, risk controls

`business` adds:

- strategic goal, stakeholders, operating constraints
- options, financial impact, execution risk
- owner, review cadence, reversible/irreversible classification

`finance` adds:

- financial hypothesis, model driver, runway impact
- base/upside/downside case
- sensitivity checks and guardrails

## Workflow

Use this in two modes.

First, as a solo thinking tool:

```bash
node bin/decision-lab.js new business > pricing.json
# edit pricing.json
node bin/decision-lab.js score pricing.json
node bin/decision-lab.js render pricing.json --out pricing.memo.md
```

Second, as an LLM prompt harness:

```bash
node bin/decision-lab.js prompt analyst pricing.json
node bin/decision-lab.js prompt skeptic pricing.json
node bin/decision-lab.js prompt cfo pricing.json
node bin/decision-lab.js prompt recorder pricing.json
```

The generated prompts tell the model to fill missing evidence, challenge weak claims, and produce structured updates rather than vague advice.

## Philosophy

The framework is designed to fight three failure modes:

- confident but unsupported recommendations
- decisions that never state their assumptions
- no postmortem loop, so judgment never improves

Every decision should answer:

- What must be true?
- Why might this be wrong?
- What evidence would change my mind?
- How will I know later whether this was a good decision?
