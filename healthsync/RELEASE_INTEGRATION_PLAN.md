# HealthSync monorepo integration plan

This branch is the only approved staging point for combining the current `main` baseline with the Command Center, Admin, Doctor/Mobile, and Pharmacy changes.

## Current baseline

- `main` already contains Pharmacy App work and deployment/migration hardening.
- Command Center release work is still distributed across PRs #4, #8, #9, #10, and #11.
- Admin readiness work is distributed across PRs #1, #2, and #5.
- Doctor/Mobile readiness work is in PR #6.

Do not merge those PRs directly to `main` in parallel.

## Required merge order

1. Rebase the final Command Center chain onto this branch: #4 → #8 → #9 → #10 → #11.
2. Resolve and validate shared files before continuing:
   - `healthsync/package.json`
   - `healthsync/package-lock.json`
   - `healthsync/.github/workflows/ci.yml`
   - `healthsync/infra/docker/docker-compose.dev.yml`
   - `healthsync/infra/k8s/**`
   - shared middleware and API contract files
3. Rebase the final Admin readiness result from #5 onto this branch. Do not merge #1, #2, and #5 independently.
4. Rebase Doctor/Mobile #6 onto this branch after Command Center and Admin are integrated.
5. Reconcile Pharmacy App changes already present on `main` with the final shared contracts.
6. Run the complete monorepo gate.
7. Open one release PR from this branch to `main` only after the gate is green.

## Shared-file acceptance rules

- Regenerate `healthsync/package-lock.json` only after all workspace `package.json` files are final.
- Keep `apps/pharmacy` in the root workspaces if it remains part of the release.
- Remove invalid or unused dependency declarations; `npm ci` must pass from `healthsync/`.
- Keep one authoritative CI workflow. It must not use `continue-on-error` for lint, typecheck, test, or build failures.
- Pin production image references to an immutable commit SHA or release tag.
- Never deploy Kubernetes placeholder secrets.
- Keep Command Center simulator mode explicit and reject it for production deployment.

## Release gate

```text
npm ci
npm run build --workspace=packages/shared
npm run typecheck --workspaces --if-present
npm run lint --workspaces --if-present
npm run build --workspaces --if-present
npm test --workspaces --if-present
flutter analyze
flutter test
flutter build apk --release
kubectl apply --dry-run=client -f infra/k8s/
```

Additionally validate:

- Command Center `test:release`.
- Admin typecheck/lint/build.
- Cross-tenant authorization tests.
- Realtime WebSocket authentication and reconnect.
- Live map provider and routing configuration.
- WebRTC/TURN call flow.
- Emergency alert and audit trail.
- Database migrations on a clean and existing database.

## Deployment decision

The integration branch is not deployable until every release-gate command is green and staging proves the end-to-end operational flows. A successful frontend build alone is not sufficient evidence.
