# Decision Agent System

The bot layer is intentionally local-first. It does not require an API key to create useful structure.

## Commands

`ask` turns a rough question into a valid decision record.

```bash
node bin/decision-lab.js ask "Should I buy AAPL now?" --out decisions/drafts/aapl.json
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
node bin/decision-lab.js patch decisions/drafts/aapl.json proposed-edits.json
node bin/decision-lab.js set decisions/drafts/aapl.json recommendation.confidence 0.62
```

`doctor` checks repository wiring and example decision validity.

```bash
node bin/decision-lab.js doctor
```

`close` marks a decision as reviewed and records the outcome.

```bash
node bin/decision-lab.js close decisions/active/pricing.json --outcome "Pilot completed." --lesson "Finance reporting needed earlier."
```

## What The Bot Does

- infers decision type from the question
- creates a schema-valid decision record
- chooses a staged default when uncertainty is material
- generates option scores
- creates role prompts for analyst, skeptic, CFO, CEO, operator, risk, and recorder
- creates audit, memo, brief, comparison, review plan, and agent report
- applies JSON patch edits safely
- attaches evidence without breaking the record shape
- tracks calibration across reviewed decisions

## What The Bot Does Not Do

- it does not fabricate market data, financial metrics, or customer evidence
- it does not treat prompts as the source of truth
- it does not let confidence outrun evidence

The JSON decision record remains the source of truth.
