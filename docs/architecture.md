# Architecture

Decision Lab is intentionally small, local-first, and dependency-free.

## Modules

- `bin/decision-lab.js`: CLI entrypoint and command routing
- `src/templates.js`: blank schema-compatible record templates
- `src/decision-core.js`: validation, scoring, audits, role prompts, and Markdown rendering
- `src/decision-agent.js`: local bot workflow, pipeline artifacts, ledger, and close-out review
- `src/decision-tools.js`: source notes, evidence attachment, JSON patching, due reviews, search, calibration, doctor, and health summaries
- `src/decision-export.js`: dashboard and CSV/JSON export

## Data Flow

```text
rough question
  -> ask/pipeline
  -> decision.json
  -> validate/audit/compare
  -> prompts for role review
  -> evidence/patch/set updates
  -> source notes/search/due reviews
  -> memo/brief/review-plan/dashboard/export
  -> close
  -> calibration
```

## Design Rules

- Records are plain JSON.
- Outputs are generated artifacts.
- Prompts must propose edits to records, not replace records.
- Validation should fail loudly when the record shape is incomplete.
- Scoring should reward evidence quality, counterarguments, assumptions, option scoring, and review loops.
- The system should work without network access or external services.
