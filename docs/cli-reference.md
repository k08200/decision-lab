# CLI Reference

## Workspace

```bash
node bin/decision-lab.js init
```

Creates local folders for decisions, research, and outputs.

## Create

```bash
node bin/decision-lab.js ask "Should I buy AAPL now?"
node bin/decision-lab.js new investment
```

`ask` creates a filled bot-generated draft from a rough question. `new` creates a blank template.

## Run

```bash
node bin/decision-lab.js run decisions/drafts/aapl.json --out-dir outputs/runs/aapl
node bin/decision-lab.js pipeline "Should we change pricing?" --type business --slug pricing
```

`run` generates artifacts from an existing record. `pipeline` creates the record and generates artifacts in one step.

## Inspect

```bash
node bin/decision-lab.js validate examples/business/enterprise_pricing_change.json
node bin/decision-lab.js audit examples/business/enterprise_pricing_change.json
node bin/decision-lab.js health examples/business/enterprise_pricing_change.json
node bin/decision-lab.js compare examples/business/enterprise_pricing_change.json
```

## Improve

```bash
node bin/decision-lab.js evidence decisions/drafts/aapl.json --claim "Claim text" --source "Source name" --strength strong
node bin/decision-lab.js source raw-notes/customer-qbr.md --title "Customer QBR" --out research/sources/customer-qbr.md
node bin/decision-lab.js source-evidence decisions/drafts/aapl.json research/sources/customer-qbr.md --claim "Claim text"
node bin/decision-lab.js patch decisions/drafts/aapl.json proposed-edits.json
node bin/decision-lab.js set decisions/drafts/aapl.json recommendation.confidence 0.62
```

`patch` accepts JSON patch operations with `add`, `replace`, and `remove`.

## Render

```bash
node bin/decision-lab.js render examples/business/enterprise_pricing_change.json
node bin/decision-lab.js brief examples/business/enterprise_pricing_change.json
node bin/decision-lab.js review-plan examples/business/enterprise_pricing_change.json
```

## Prompt

```bash
node bin/decision-lab.js prompt skeptic examples/investment/nvidia_add_position.json
node bin/decision-lab.js prompt all examples/business/enterprise_pricing_change.json --out-dir outputs/prompts/pricing
```

## Ledger And Review

```bash
node bin/decision-lab.js ledger decisions
node bin/decision-lab.js dashboard decisions --out outputs/dashboard.html
node bin/decision-lab.js export decisions --format csv --out outputs/decisions.csv
node bin/decision-lab.js calibration decisions
node bin/decision-lab.js due decisions --as-of 2026-08-01
node bin/decision-lab.js search decisions --query pricing
node bin/decision-lab.js doctor
node bin/decision-lab.js promote decisions/drafts/pricing.json decided
node bin/decision-lab.js review decisions/active/pricing.json --out outputs/memos/pricing-review.md
node bin/decision-lab.js close decisions/active/pricing.json --outcome "Pilot completed." --lesson "Report earlier."
```
