# Changelog

## 1.7.0

### Added

- Decision diff command for comparing two versions of a record across status, recommendation, confidence, score, and register counts

## 1.6.0

### Added

- Mermaid decision graph command for visualizing hypotheses, evidence, assumptions, options, risks, and recommendations

## 1.5.0

### Added

- Schema migration command for older or partial decision records
- Migration reports that compare pre-upgrade and post-upgrade validity
- Legacy decision type aliases for investment, business, and finance records

## 1.4.0

### Added

- Decision quality gate command for CI or personal operating review
- Stale decision report for neglected records

## 1.3.0

### Added

- Inbox batch creation from plain text decision questions
- Full operating pack generation with ledger, dashboard, exports, calibration, due reviews, risk register, assumption register, source index, monthly report, and doctor report

## 1.2.0

### Added

- Portfolio-level risk register
- Portfolio-level assumption register
- Evidence source index
- Monthly decision operating review pack

## 1.1.0

### Added

- Source note normalization and source-linked evidence
- Due review reports
- Decision ledger search
- Review worksheets
- Status promotion command
- Expanded doctor checks

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
