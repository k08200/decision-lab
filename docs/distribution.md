# Distribution

Decision Lab should be distributed as a local-first npm CLI before any hosted SaaS launch.

## Current Distribution Status

| Item | Status |
| --- | --- |
| GitHub repository | ready |
| GitHub releases | ready |
| npm package metadata | ready |
| npm package name `decision-lab` | available as of 2026-05-03 |
| npm login on this machine | not logged in as of 2026-05-03 |
| hosted SaaS deployment | not recommended yet |

The package name check returned `E404 Not Found` for `npm view decision-lab`, which means the public package name is currently unclaimed or not visible to this account.

`npm whoami` returned `E401 Unauthorized`, so publishing needs an npm login first.

## Recommended Launch Path

1. Keep the GitHub repo public.
2. Publish the npm CLI.
3. Let users run a disposable demo with `npx decision-lab demo`.
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
npm view decision-lab version
npx decision-lab demo decision-lab-demo
cd decision-lab-demo
less outputs/run/memo.md
```

## User Install Paths

Disposable demo:

```bash
npx decision-lab demo decision-lab-demo
```

Private local workspace:

```bash
npx decision-lab private-workspace my-private-decisions --owner "Your Name"
cd my-private-decisions
npx decision-lab decide "Should we change enterprise pricing this quarter?" --type business --slug pricing
```

Pinned version:

```bash
npx decision-lab@2.69.0 demo decision-lab-demo
```

GitHub fallback before npm publish:

```bash
npx github:k08200/decision-lab demo decision-lab-demo
```

## If The Name Becomes Unavailable

If `decision-lab` is taken before publication, use a scoped package:

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
    "decision-lab": "./bin/decision-lab.js"
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
npm deprecate decision-lab@2.69.0 "Use 2.69.1 or newer."
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
