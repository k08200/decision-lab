# Contributing

This is a personal decision system, so changes should keep the workflow simple, inspectable, and schema-first.

## Local Checks

```bash
npm run check
npm test
```

## Change Guidelines

- Prefer schema-compatible additions over breaking record changes.
- Keep prompts concrete and JSON-editable.
- Add tests for new CLI commands, scoring rules, or validation rules.
- Update examples when schema behavior changes.
- Do not add external runtime dependencies unless they remove meaningful complexity.

## Quality Bar

A mature change should answer:

- What decision behavior improves?
- What record field or command owns that behavior?
- How is it tested?
- How will a future reader discover it?
