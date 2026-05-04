# Distribution

Decision Lab should be distributed as a local-first npm CLI before any hosted SaaS launch.

## Current Distribution Status

| Item | Status |
| --- | --- |
| GitHub repository | ready |
| GitHub releases | ready |
| npm package metadata | ready |
| npm package name `decision-lab` | blocked by npm similarity policy |
| npm package name `@k08200/decision-lab` | published |
| npm public install path | `npx @k08200/decision-lab` |
| hosted SaaS deployment | not recommended yet |

The unscoped package name `decision-lab` is blocked by npm because it is too similar to an existing package named `decisionlab`. The scoped package `@k08200/decision-lab` is the canonical public distribution.

## Recommended Launch Path

1. Keep the GitHub repo public.
2. Publish the npm CLI.
3. Let users run a disposable demo with `npx @k08200/decision-lab demo`.
4. Ask design partners to use private local workspaces.
5. Only consider hosted SaaS after repeated demand for team collaboration, approvals, and shared web access.

## Pre-Publish Checklist

Run:

```bash
npm run release:check
```

This runs:

- syntax checks
- test suite
- doctor checks
- privacy check
- package dry-run
- security audit
- npm publish dry-run

The publish dry-run uses the project-local `.npm-cache` so it does not depend on a broken global npm cache.

## Publish Command

Login first:

```bash
npm login
npm whoami
```

Then publish:

```bash
npm publish --access public --cache .npm-cache
```

After publishing, verify:

```bash
npm view @k08200/decision-lab version
npm exec --yes --package @k08200/decision-lab@latest -- decision-lab list-types
npx @k08200/decision-lab demo decision-lab-demo
cd decision-lab-demo
less outputs/run/memo.md
```

## User Install Paths

Disposable demo:

```bash
npx @k08200/decision-lab demo decision-lab-demo
```

Private local workspace:

```bash
npx @k08200/decision-lab private-workspace my-private-decisions --owner "Your Name"
cd my-private-decisions
npx @k08200/decision-lab decide "Should we change enterprise pricing this quarter?" --type business --slug pricing
```

Pinned version:

```bash
npx @k08200/decision-lab@2.70.1 demo decision-lab-demo
```

GitHub fallback if npm is unavailable:

```bash
npx github:k08200/decision-lab demo decision-lab-demo
```

## If The Name Becomes Unavailable

The scoped package is the canonical npm distribution:

```json
{
  "name": "@k08200/decision-lab",
  "publishConfig": {
    "access": "public"
  }
}
```

The CLI binary can still remain:

```json
{
  "bin": {
    "decision-lab": "bin/decision-lab.js"
  }
}
```

Then users run:

```bash
npx @k08200/decision-lab demo decision-lab-demo
```

## Rollback And Deprecation

Avoid unpublishing unless the package contains secrets or legally sensitive material.

For a bad release, publish a fixed patch version and deprecate the bad version:

```bash
npm deprecate @k08200/decision-lab@2.70.1 "Use 2.70.2 or newer."
```

If private data is accidentally published:

1. Treat it as exposed.
2. Rotate secrets immediately.
3. Contact npm support if removal is required.
4. Create a clean release after confirming the package tarball is safe.

## Why Not Hosted SaaS Yet

Hosted SaaS requires:

- persistent database
- account model
- organization model
- RBAC
- billing
- deployment pipeline
- support operations
- observability
- legal/privacy operations

Decision Lab is strong enough to distribute as a local-first product now. Hosted SaaS should wait until design partners prove that team collaboration is the actual pull.
