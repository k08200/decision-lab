# Changelog

## 1.0.0

Initial complete release of Decision Lab.

### Added

- Schema-first decision records for general, investment, business, and finance decisions
- Local bot workflow with `ask`, `run`, and `pipeline`
- Role prompt chain for analyst, skeptic, CFO, CEO, operator, risk, and recorder
- Validation, scoring, audit, health, option comparison, memo, brief, and review-plan commands
- Evidence attachment, JSON patch application, field updates, calibration reports, and doctor checks
- Standalone HTML dashboard and CSV/JSON export
- Example decision records and generated workflow structure
- CI, issue template, PR template, roadmap, contribution guide, CLI reference, schema guide, and playbooks

### Notes

- The JSON decision record is the source of truth.
- External LLMs or data providers should integrate by proposing JSON-compatible edits, not by replacing the record.
