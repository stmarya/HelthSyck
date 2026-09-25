# Command Center deployment checklist

## Before merge

- [ ] `npm ci` completes from `healthsync/`.
- [ ] `npm run test:release --workspace=apps/command-center` is green.
- [ ] `npm run typecheck --workspace=apps/command-center` is green.
- [ ] `npm run lint --workspace=apps/command-center` is green with zero warnings.
- [ ] `npm run build --workspace=apps/command-center` is green.
- [ ] Authorization tests cover Command Center, Admin, hospital operator, pharmacist, driver, and ambulance roles.
- [ ] Browser E2E covers login, overview, alert acknowledgement, live map, referral, hospital capacity, and communication states.

## Staging configuration

- [ ] `VITE_MAP_PROVIDER` is not `simulator`.
- [ ] Map style/token and `VITE_ROUTING_URL` respond successfully.
- [ ] `/health/auth`, `/health/ambulance`, `/health/hospital`, `/health/pharmacy`, and `/health/realtime` return valid JSON health payloads.
- [ ] Realtime WebSocket `/ws` authenticates and reconnects after network loss.
- [ ] TURN credentials are short-lived and injected through the deployment secret manager.
- [ ] Emergency alert delivery, acknowledgement, and audit trail are verified end-to-end.
- [ ] Live ambulance location is fresh, scoped by authorization, and becomes stale when updates stop.

## Production safety

- [ ] Simulator mode is disabled by deployment policy.
- [ ] No API keys or TURN credentials are committed to the repository.
- [ ] Error tracking, uptime monitoring, and alert escalation are enabled.
- [ ] Rollback image/tag is available before deployment.

## Release decision

The Command Center is deployable only when the automated release gate is green and every staging item above is checked. A static UI audit or a successful build alone is not production evidence.
