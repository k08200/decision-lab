# Personal Decision Operating System

Decision Lab is designed to become a personal operating system for judgment, not a single bot.

## Layers

1. Record layer: JSON decision files are the source of truth.
2. Reasoning layer: role prompts critique and improve the record.
3. Audit layer: validation, quality score, option scorecard, and warnings.
4. Memo layer: Markdown outputs for reading and sharing.
5. Review layer: outcomes and lessons update future judgment.

## Suggested Workflow

```bash
node bin/decision-lab.js init
node bin/decision-lab.js pipeline "Should we change enterprise pricing?" --type business --slug pricing
node bin/decision-lab.js new business --out decisions/drafts/pricing.json
node bin/decision-lab.js prompt all decisions/drafts/pricing.json --out-dir outputs/prompts/pricing
node bin/decision-lab.js audit decisions/drafts/pricing.json
node bin/decision-lab.js compare decisions/drafts/pricing.json
node bin/decision-lab.js render decisions/drafts/pricing.json --out outputs/memos/pricing.md
node bin/decision-lab.js review-plan decisions/drafts/pricing.json --out outputs/memos/pricing-review.md
```

## File Lifecycle

- `decisions/drafts`: incomplete records
- `decisions/active`: decisions being executed or monitored
- `decisions/reviewed`: completed records with outcomes and lessons
- `research/sources`: supporting transcripts, notes, references, and source extracts
- `research/models`: valuation, finance, sensitivity, or planning models
- `outputs`: generated memos, briefs, reviews, and prompts

## Bot Layer

The repository is intentionally schema-first so the bot can:

- create a record from a rough question
- ask role agents to propose edits
- merge accepted edits back into JSON
- fetch or attach evidence
- block recommendations that fail the quality bar
- remind you to review the decision
- build a personal judgment ledger over time

The local bot layer already creates records, full artifact runs, prompt chains, ledgers, and close-out reviews. External LLM or data integrations should plug into that layer without replacing the record as the source of truth.
