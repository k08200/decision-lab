# Decision Agent System

The bot layer is intentionally local-first. It does not require an API key to create useful structure.

## Commands

`ask` turns a rough question into a valid decision record.

```bash
node bin/decision-lab.js ask "Should I buy AAPL now?" --out decisions/drafts/aapl.json
```

`inbox` turns a plain text list of questions into multiple decision drafts.

```bash
node bin/decision-lab.js inbox inbox.txt --out-dir decisions/drafts
```

`run` takes an existing record and generates the full artifact set.

```bash
node bin/decision-lab.js run decisions/drafts/aapl.json --out-dir outputs/runs/aapl
```

`pipeline` creates the record and runs the full workflow in one command.

```bash
node bin/decision-lab.js pipeline "Should we change enterprise pricing?" --type business --slug pricing
```

`ledger` scans decision records and creates a portfolio view of judgment.

```bash
node bin/decision-lab.js ledger decisions --out outputs/ledger.md
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

`due`, `search`, `review`, and `promote` keep the system operational as records accumulate.

```bash
node bin/decision-lab.js due decisions --as-of 2026-08-01
node bin/decision-lab.js search decisions --query platform
node bin/decision-lab.js review decisions/active/pricing.json --out outputs/memos/pricing-review.md
node bin/decision-lab.js promote decisions/drafts/pricing.json decided
```

`risks`, `assumptions`, `sources`, and `monthly` turn individual records into portfolio-level operating reports.

```bash
node bin/decision-lab.js risks decisions --out outputs/risks.md
node bin/decision-lab.js assumptions decisions --out outputs/assumptions.md
node bin/decision-lab.js sources decisions --out outputs/sources.md
node bin/decision-lab.js monthly decisions --as-of 2026-08-01 --out outputs/monthly.md
```

`pack` writes the full operating report set in one directory.

```bash
node bin/decision-lab.js pack decisions --as-of 2026-08-01 --out-dir outputs/packs/2026-08-01
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
- creates a schema-valid decision record
- creates batches of decision drafts from inbox files
- chooses a staged default when uncertainty is material
- generates option scores
- creates role prompts for analyst, skeptic, CFO, CEO, operator, risk, and recorder
- creates audit, memo, brief, comparison, review plan, and agent report
- applies JSON patch edits safely
- attaches evidence without breaking the record shape
- normalizes source notes and links them as evidence
- tracks calibration across reviewed decisions
- lists due reviews and searches the decision ledger
- produces review worksheets and status promotion updates
- aggregates risk, assumption, and source registers
- creates monthly operating review packs
- writes full operating packs for recurring review
- renders a standalone HTML dashboard
- exports decision summaries to CSV or JSON

## What The Bot Does Not Do

- it does not fabricate market data, financial metrics, or customer evidence
- it does not treat prompts as the source of truth
- it does not let confidence outrun evidence

The JSON decision record remains the source of truth.
