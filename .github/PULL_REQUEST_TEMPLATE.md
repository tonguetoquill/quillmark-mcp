## Summary

<!-- 2-4 sentences: what changed and why. Readers should understand the intent without reading the diff. -->

## What changed

<!-- Bullets describing the concrete changes, grouped by area (server / scripts / docs / tests / devops). -->

-
-
-

## Why

<!-- Root cause / motivation. If this fixes a bug or closes an issue, link it: "Closes #123". -->

## Test plan

- [ ] `npm test` passes locally (host unit tests)
- [ ] `npm run test:docker` passes locally (six-layer harness) — required for server/primitives/adapter changes
- [ ] Live client smoke test run (say which client + version)
- [ ] For client-validation PRs: `docs/STATUS.md` flipped to ✅ with evidence

## Breaking changes

<!-- None / describe. The default Claude Code endpoint contract (port 8080, 3 tools) must never break without a major version bump. -->

## Related

<!-- Linked issues, prior PRs, upstream bugs. -->

## Checklist

- [ ] I've read [`CONTRIBUTING.md`](../blob/main/CONTRIBUTING.md)
- [ ] I've updated `CHANGELOG.md` under `[Unreleased]`
- [ ] I've updated `docs/STATUS.md` if this change validates a new client stack
- [ ] I've updated the relevant `docs/clients/<client>.md` if this change affects that client's setup
- [ ] Commit author is me (no co-author trailers from AI tooling)
