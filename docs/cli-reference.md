# CLI Reference

## Workspace

```bash
node bin/decision-lab.js init
node bin/decision-lab.js config --out .decision-lab.json
node bin/decision-lab.js catalog --out outputs/catalog.md
```

Creates local folders for decisions, research, and outputs.

`config` writes the default local settings file for owner, directories, quality gate thresholds, and stale decision age.

## Create

```bash
node bin/decision-lab.js ask "Should I buy AAPL now?"
node bin/decision-lab.js inbox inbox.txt --out-dir decisions/drafts
node bin/decision-lab.js new investment
```

`ask` creates a filled bot-generated draft from a rough question. `new` creates a blank template.

## Run

```bash
node bin/decision-lab.js run decisions/drafts/aapl.json --out-dir outputs/runs/aapl
node bin/decision-lab.js pipeline "Should we change pricing?" --type business --slug pricing
```

`run` generates memo, brief, audit, health, option comparison, checklist, premortem, research plan, graph, review plan, agent report, and role prompts from an existing record. `pipeline` creates the record and generates artifacts in one step.

## Inspect

```bash
node bin/decision-lab.js validate examples/business/enterprise_pricing_change.json
node bin/decision-lab.js audit examples/business/enterprise_pricing_change.json
node bin/decision-lab.js health examples/business/enterprise_pricing_change.json
node bin/decision-lab.js checklist examples/business/enterprise_pricing_change.json
node bin/decision-lab.js compare examples/business/enterprise_pricing_change.json
node bin/decision-lab.js diff decisions/snapshots/pricing-before.json decisions/active/pricing.json
node bin/decision-lab.js graph examples/business/enterprise_pricing_change.json --out outputs/graphs/pricing.md
node bin/decision-lab.js premortem examples/business/enterprise_pricing_change.json --out outputs/premortems/pricing.md
node bin/decision-lab.js research-plan examples/business/enterprise_pricing_change.json --out outputs/research/pricing.md
```

`diff` compares two record versions across status, recommendation, confidence, score, and core register counts.

`graph` renders a Mermaid map of the decision, recommendation, hypotheses, options, evidence, assumptions, and risks.

`premortem` turns recorded risks, assumptions, counterarguments, and change-my-mind conditions into a pre-commit failure review.

`research-plan` converts weak evidence, open questions, assumptions, and disconfirming signals into concrete research tasks.

## Improve

```bash
node bin/decision-lab.js evidence decisions/drafts/aapl.json --claim "Claim text" --source "Source name" --strength strong
node bin/decision-lab.js source raw-notes/customer-qbr.md --title "Customer QBR" --out research/sources/customer-qbr.md
node bin/decision-lab.js source-evidence decisions/drafts/aapl.json research/sources/customer-qbr.md --claim "Claim text"
node bin/decision-lab.js patch decisions/drafts/aapl.json proposed-edits.json
node bin/decision-lab.js set decisions/drafts/aapl.json recommendation.confidence 0.62
node bin/decision-lab.js migrate decisions/old/aapl.json --report outputs/migrations/aapl.md
node bin/decision-lab.js snapshot decisions/active/aapl.json --label before-change
```

`patch` accepts JSON patch operations with `add`, `replace`, and `remove`.

`migrate` upgrades older or partial decision records into the current schema while preserving meaningful existing fields.

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
node bin/decision-lab.js status decisions --as-of 2026-08-01
node bin/decision-lab.js dashboard decisions --out outputs/dashboard.html
node bin/decision-lab.js export decisions --format csv --out outputs/decisions.csv
node bin/decision-lab.js manifest decisions --out outputs/manifest.md
node bin/decision-lab.js calibration decisions
node bin/decision-lab.js lessons decisions
node bin/decision-lab.js risks decisions
node bin/decision-lab.js risk-heatmap decisions
node bin/decision-lab.js assumptions decisions
node bin/decision-lab.js assumption-tests decisions
node bin/decision-lab.js sources decisions
node bin/decision-lab.js evidence-scorecard decisions
node bin/decision-lab.js questions decisions
node bin/decision-lab.js hypotheses decisions
node bin/decision-lab.js guardrails decisions
node bin/decision-lab.js owners decisions --as-of 2026-08-01
node bin/decision-lab.js briefing decisions --as-of 2026-08-01
node bin/decision-lab.js scorecard decisions --as-of 2026-08-01
node bin/decision-lab.js triage decisions --as-of 2026-08-01
node bin/decision-lab.js monthly decisions --as-of 2026-08-01
node bin/decision-lab.js next decisions --as-of 2026-08-01
node bin/decision-lab.js prioritize decisions --as-of 2026-08-01
node bin/decision-lab.js agenda decisions --as-of 2026-08-01 --horizon 14
node bin/decision-lab.js timeline decisions
node bin/decision-lab.js pack decisions --as-of 2026-08-01 --out-dir outputs/packs/2026-08-01
node bin/decision-lab.js weekly decisions --as-of 2026-08-01 --out-dir outputs/weekly/2026-08-01
node bin/decision-lab.js due decisions --as-of 2026-08-01
node bin/decision-lab.js review-pack decisions --as-of 2026-08-01 --out-dir outputs/reviews/2026-08-01
node bin/decision-lab.js search decisions --query pricing
node bin/decision-lab.js doctor
node bin/decision-lab.js gate decisions --min-score 0.85 --operational
node bin/decision-lab.js stale decisions --days 30 --as-of 2026-08-01
node bin/decision-lab.js debt decisions --days 30 --as-of 2026-08-01
node bin/decision-lab.js archive-plan decisions --destination decisions/archive
node bin/decision-lab.js promote decisions/drafts/pricing.json decided
node bin/decision-lab.js review decisions/active/pricing.json --out outputs/memos/pricing-review.md
node bin/decision-lab.js close decisions/active/pricing.json --outcome "Pilot completed." --lesson "Report earlier."
```
