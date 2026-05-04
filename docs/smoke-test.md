# Smoke Test

Use this checklist to verify the public npm package from a clean folder.

## Published Package

```bash
npm view @k08200/decision-lab version
npm view @k08200/decision-lab bin --json
```

Expected result:

- the version prints successfully
- the binary map includes `decision-lab`

## CLI Launch

```bash
npm exec --yes --package @k08200/decision-lab@latest -- decision-lab list-types
```

Expected result:

```text
general
investment
business
finance
```

## Disposable Demo

Run this outside the source repo:

```bash
cd /private/tmp
npx @k08200/decision-lab demo decision-lab-demo
cd decision-lab-demo
test -f outputs/run/memo.md
```

## Private Workspace

```bash
cd /private/tmp
npx @k08200/decision-lab private-workspace smoke-decisions --owner "Smoke Tester"
cd smoke-decisions
npx @k08200/decision-lab decide "Should we change pricing?" --type business --slug pricing
test -f decisions/active/pricing/run/memo.md
```

## Local UI Launch

```bash
npx @k08200/decision-lab serve decisions --as-of 2026-08-01 --token local-dev-token --actor "Smoke Tester"
```

Expected result:

- the server prints a local URL
- the process can be stopped with `Ctrl+C`

## Source Repo Release Check

Inside the source checkout, run:

```bash
npm run release:check
```

Expected result:

- syntax checks pass
- tests pass
- doctor passes
- privacy check passes
- npm dry-run succeeds
- security audit reports no moderate-or-higher vulnerabilities
