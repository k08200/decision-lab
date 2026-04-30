# CLI Reference

## Workspace

```bash
node bin/decision-lab.js init
node bin/decision-lab.js demo outputs/demo
node bin/decision-lab.js private-workspace ../my-private-decisions --owner "Your Name"
node bin/decision-lab.js config --out .decision-lab.json
node bin/decision-lab.js catalog --out outputs/catalog.md
node bin/decision-lab.js privacy-check --out outputs/privacy.md
```

Creates local folders for decisions, research, and outputs.

`demo` creates a sanitized sample workspace with a decision record, memo, audit, weekly pack, and calendar file.

`config` writes the default local settings file for owner, directories, quality gate thresholds, and stale decision age.

`private-workspace` creates a separate private folder for real decisions, raw research, local config, and private outputs.

`privacy-check` scans tracked files for private workspace paths and obvious secrets before publishing.

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
node bin/decision-lab.js import-evidence decisions/drafts/aapl.json research/evidence.csv --report outputs/evidence-import.md
node bin/decision-lab.js extract-evidence examples/evidence/customer_qbr_notes.md --out research/evidence/customer-qbr.json --report outputs/evidence-extract.md
node bin/decision-lab.js extract-evidence examples/evidence/customer_research_page.html --out research/evidence/customer-page.json --report outputs/html-evidence.md
node bin/decision-lab.js import-evidence decisions/drafts/aapl.json examples/evidence/customer_qbr_notes.md --report outputs/evidence-import.md
node bin/decision-lab.js source raw-notes/customer-qbr.md --title "Customer QBR" --out research/sources/customer-qbr.md
node bin/decision-lab.js source-evidence decisions/drafts/aapl.json research/sources/customer-qbr.md --claim "Claim text"
node bin/decision-lab.js suggest skeptic decisions/drafts/aapl.json --prompt-out outputs/prompts/aapl-skeptic-patch.md
node bin/decision-lab.js suggest skeptic decisions/drafts/aapl.json --response outputs/llm/aapl-skeptic.md --out outputs/patches/aapl.patch.json --review outputs/patches/aapl-review.md
OPENAI_API_KEY=... node bin/decision-lab.js ai-suggest skeptic decisions/drafts/aapl.json --model gpt-5.2 --out outputs/patches/aapl.openai.patch.json --review outputs/patches/aapl.openai-review.md --raw outputs/patches/aapl.openai.raw.json
node bin/decision-lab.js patch decisions/drafts/aapl.json proposed-edits.json
node bin/decision-lab.js set decisions/drafts/aapl.json recommendation.confidence 0.62
node bin/decision-lab.js migrate decisions/old/aapl.json --report outputs/migrations/aapl.md
node bin/decision-lab.js snapshot decisions/active/aapl.json --label before-change
```

`patch` accepts JSON patch operations with `add`, `replace`, and `remove`.

`suggest` creates a patch-specific role prompt and parses an LLM response into a reviewable JSON Patch file.

`ai-suggest` calls OpenAI with `OPENAI_API_KEY`, asks the chosen role for JSON Patch operations, and can save the patch, review table, and raw response separately. It does not apply the patch.

`extract-evidence` parses CSV, TSV, JSON, Markdown, text notes, saved HTML pages, PDFs, XLSX spreadsheets, or live HTTP(S) URLs into normalized evidence JSON and can write an extraction report with source URLs.

`import-evidence` attaches evidence rows from CSV, TSV, JSON, Markdown, text, saved HTML, PDF, XLSX, or live HTTP(S) URL sources and can write an import report.

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
node bin/decision-lab.js serve decisions --as-of 2026-08-01 --token local-dev-token --actor "Your Name"
node bin/decision-lab.js openapi --out outputs/openapi.json
node bin/decision-lab.js audit-log decisions --out outputs/audit-log.md
node bin/decision-lab.js export decisions --format csv --out outputs/decisions.csv
node bin/decision-lab.js manifest decisions --out outputs/manifest.md
node bin/decision-lab.js backup decisions --out outputs/decision-lab-backup.json --report outputs/backup.md
node bin/decision-lab.js verify-backup outputs/decision-lab-backup.json --report outputs/backup-verify.md
node bin/decision-lab.js taxonomy decisions --out outputs/taxonomy.md
node bin/decision-lab.js calibration decisions
node bin/decision-lab.js outcomes decisions
node bin/decision-lab.js principles decisions
node bin/decision-lab.js themes decisions
node bin/decision-lab.js commitments decisions --as-of 2026-08-01 --horizon 14
node bin/decision-lab.js dependencies decisions
node bin/decision-lab.js lessons decisions
node bin/decision-lab.js risks decisions
node bin/decision-lab.js risk-heatmap decisions
node bin/decision-lab.js assumptions decisions
node bin/decision-lab.js assumption-tests decisions
node bin/decision-lab.js sources decisions
node bin/decision-lab.js evidence-scorecard decisions
node bin/decision-lab.js signals decisions --as-of 2026-08-01
node bin/decision-lab.js questions decisions
node bin/decision-lab.js hypotheses decisions
node bin/decision-lab.js red-team decisions
node bin/decision-lab.js scenarios decisions
node bin/decision-lab.js sensitivities decisions
node bin/decision-lab.js guardrails decisions
node bin/decision-lab.js owners decisions --as-of 2026-08-01
node bin/decision-lab.js briefing decisions --as-of 2026-08-01
node bin/decision-lab.js executive decisions --as-of 2026-08-01
node bin/decision-lab.js playbook decisions --as-of 2026-08-01
node bin/decision-lab.js scorecard decisions --as-of 2026-08-01
node bin/decision-lab.js triage decisions --as-of 2026-08-01
node bin/decision-lab.js monthly decisions --as-of 2026-08-01
node bin/decision-lab.js next decisions --as-of 2026-08-01
node bin/decision-lab.js prioritize decisions --as-of 2026-08-01
node bin/decision-lab.js calendar decisions --as-of 2026-08-01 --horizon 30
node bin/decision-lab.js ics decisions --as-of 2026-08-01 --out outputs/calendar.ics
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

`backup` writes a verifiable JSON bundle with file contents, SHA256 hashes, decision validation status, and a summary. `verify-backup` checks the bundle before storage or restore. `restore` rebuilds the files into a chosen destination and rejects unsafe paths unless the bundle verifies cleanly.

`openapi` writes the API contract for the local server. `serve --token` enables bearer or `x-api-key` auth for API routes, while `audit-log` renders append-only create/save mutation events.

`serve` runs a local product UI on `127.0.0.1:8787` by default. It supports decision creation, JSON editing, validated saves, memo previews, report tabs, and portfolio filters.
