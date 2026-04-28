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
node bin/decision-lab.js compare examples/business/enterprise_pricing_change.json
```

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
node bin/decision-lab.js close decisions/active/pricing.json --outcome "Pilot completed." --lesson "Report earlier."
```
