# Schema Guide

Decision records are JSON files. The schema is intentionally explicit so that humans, CLI tools, and future agents can all inspect the same source of truth.

## Required Core Sections

- `decision_frame`: class, reversibility, urgency, default action, desired outcome, constraints, non-goals
- `recommendation`: decision, selected option, summary, confidence, deadline, review date
- `hypotheses`: thesis statements with evidence, assumptions, counterarguments, and disconfirming signals
- `options`: possible actions
- `evidence`: claims, sources, source type, recency, strength, notes
- `assumption_register`: fragile assumptions and tests
- `risks`: risks, triggers, mitigation
- `decision_criteria`: weighted criteria
- `option_scores`: scores for each option and criterion
- `post_decision_review`: success metrics, expected signals, failure signals, questions, outcome, lessons

## Type Extensions

Investment records add:

- `asset`
- `portfolio_context`
- `valuation`
- `catalysts`
- `risk_controls`

Business records add:

- `strategic_goal`
- `stakeholders`
- `constraints`
- `financial_impact`
- `execution_plan`
- `operating_cadence`

Finance records add:

- `financial_hypothesis`
- `model_driver`
- `planning_horizon`
- `base_case`
- `upside_case`
- `downside_case`
- `sensitivity_checks`
- `financial_guardrails`

## Compatibility

When adding fields, prefer additive changes. If a change breaks older records, update:

- schemas
- templates
- examples
- validation
- tests
- docs
