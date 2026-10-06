# HealthSync Command Center — Feature & Simulation Specification

## 1. Executive assessment

The current Command Center already has a useful visual shell and a browser-side `SimulationEngine`, but it is still an event demo rather than an operational control plane. The engine emits events for doctor status, consultation, medicine order, emergency, ambulance request, blood request, referral, hospital capacity, and location; however, several events only reach the activity feed and do not create durable operational state.

### Capability matrix

| Capability | Current implementation | Risk | Required improvement |
| --- | --- | --- | --- |
| Live map | SVG map with seeded Jakarta entities and jittered coordinates | Looks live but is not connected to a transport or GPS source | Add `LocationUpdate` event contract, freshness/accuracy metadata, stale marker state, replay mode, and map projection store |
| Doctor availability | Status events update a local doctor list | Consultation sessions are not created or closed | Add session lifecycle: `scheduled → waiting → in_progress → completed/failed` |
| Teleconsultation | Consultation event is feed-only | No queue, patient/doctor assignment, duration timer, or SLA | Add consultation store and active-session panel |
| Pharmacy logistics | Medicine order is feed-only | No order ID, line items, payment/fulfilment state, or driver tracking | Add order state machine and delivery projection |
| Emergency | Modal + toast; seed patient may be selected randomly | No vitals, acknowledgement, escalation, idempotent dispatch, or case state | Add emergency case state machine and immutable event history |
| Auto-dispatch | Button only displays a toast | No ambulance reservation or state update from the button | Add dispatch command, nearest-vehicle scoring, reservation TTL, and audit log |
| Blood request | Event appears in feed | No request state, stock reservation, expiry, or fulfilment | Add blood inventory projection and request lifecycle |
| Referral | Button displays a toast | No booking, rejection, ETA, or receiving-hospital confirmation | Add referral workflow and hospital acceptance contract |
| Hospital resources | Capacity updates work locally | Blood stock and specialist roster are not first-class UI resources | Add resource snapshot with freshness, source, and confidence |
| Real-time reliability | Singleton in-memory event emitter | Refresh/navigation loses projection history; multiple tabs are isolated | Add transport adapter and replayable event log |

## 2. Target architecture

```text
[REST/WebSocket/SSE adapter]
          |
          v
[Event envelope validator + deduplicator]
          |
          v
[Command Center event bus]
     |              |
     v              v
[Operational store] [Immutable audit/event log]
     |
     +--> [Map projection]
     +--> [Emergency projection]
     +--> [Doctor & teleconsult projection]
     +--> [Logistics projection]
     +--> [Hospital resource projection]
     +--> [Referral projection]
          |
          v
[React UI: left work queue | center map | right response panel | bottom feed]
```

### Runtime modes

1. **Simulation mode** — deterministic, seeded, replayable, safe for demos and UAT.
2. **Shadow mode** — real events are read-only beside simulated events; useful for pilot validation.
3. **Production mode** — simulation is disabled by default and only enabled by explicit operator permission.

The UI must always show a mode badge: `SIMULATION`, `SHADOW`, or `LIVE`. Simulated data must never be presented as real patient data.

### Event envelope

Every event uses the same envelope so the simulator and production adapter can share UI code:

```json
{
  "id": "evt-20260924-000001",
  "type": "emergency.vitals_changed",
  "version": 1,
  "occurredAt": "2026-09-24T14:15:00.000Z",
  "source": "simulation",
  "mode": "SIMULATION",
  "correlationId": "case-emg-001",
  "causationId": "evt-20260924-000000",
  "payload": {}
}
```

Required platform guarantees:

- `id` is unique and idempotent.
- `correlationId` groups one operational case.
- Consumers can replay events in order.
- Out-of-order events are rejected or buffered using `occurredAt` and sequence number.
- Every operator command creates an audit event.

## 3. UI/UX structure

### Desktop war-room layout

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Mode + connection + time │ search │ pause/replay │ user                 │
├───────────────┬──────────────────────────────────┬──────────────────────┤
│ LEFT WORK      │ CENTER MAP / OPERATIONS          │ RIGHT RESPONSE       │
│ QUEUE          │                                  │ PANEL                │
│               │  GPS markers, routes, clusters,  │  Emergency queue      │
│ • Emergencies │  geofence, ETA, stale markers    │  active case detail   │
│ • Teleconsult │                                  │  one-click actions    │
│ • Logistics   │  toggle: patient/ambulance/      │  hospital resources   │
│ • Referrals   │  driver/hospital/pharmacy        │  blood + beds + duty  │
│               │                                  │  quick referral       │
├───────────────┴──────────────────────────────────┴──────────────────────┤
│ Activity feed / audit trail / replay timeline                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Interaction principles

- Emergency cases stay pinned until acknowledged and have a visible SLA timer.
- Critical actions use explicit labels: `Hubungi Pasien`, `Hubungi Keluarga`, `Dispatch Ambulans`, `Booking IGD`.
- A destructive/irreversible command requires confirmation and shows the target, operator, and reason.
- Stale data is visible with text (`Tidak diperbarui 28 dtk`) rather than color alone.
- Every panel has loading, empty, stale, error, and retry states.
- A simulation action must show its generated event and correlation ID so QA can reproduce it.

### Key panels

**Left work queue**

- Sort: severity, SLA, newest, nearest hospital.
- Filters: emergency, teleconsultation, logistics, referral, blood request.
- Each row shows case ID, patient alias, severity, age of last update, and owner.

**Center map**

- Marker shape identifies entity; color identifies status; label identifies entity ID.
- Ambulance marker shows ETA and route state.
- A stale marker becomes hollow after 15 seconds and hidden only after an explicit threshold.
- Clicking a marker opens a compact summary; `Open case` opens the right panel.

**Right response panel**

- Emergency detail: latest vitals, trend, location accuracy, family contact, consent/privacy flag.
- Dispatch recommendation: distance, ETA, equipment, crew capability, reservation expiry.
- Hospital panel: IGD/ICU/ward/OR, blood stock, duty specialist, last update, source.
- Referral button is disabled if the source is stale or the receiving facility has not acknowledged.

## 4. Emergency state machine

```text
STABLE
  └─ vitals_cross_threshold ─> DEGRADING
                                  └─ critical_threshold ─> CRITICAL_ALERT
                                                             ├─ acknowledge ─> ACKNOWLEDGED
                                                             ├─ timeout ─────> ESCALATED
                                                             └─ false_positive -> RESOLVED
ACKNOWLEDGED
  └─ contact_patient ─> CONTACTING
  └─ dispatch_confirmed -> DISPATCHING
DISPATCHING
  ├─ ambulance_reserved -> EN_ROUTE
  ├─ no_vehicle -> ESCALATED
  └─ cancel_with_reason -> CANCELLED
EN_ROUTE
  ├─ arrived -> ON_SCENE
  ├─ location_stale -> ESCALATED
  └─ cancel_with_reason -> CANCELLED
ON_SCENE
  └─ patient_loaded -> TRANSPORTING
TRANSPORTING
  ├─ hospital_accepted -> ARRIVED_AT_HOSPITAL
  ├─ route_failure -> ESCALATED
  └─ cancel_with_reason -> CANCELLED
ARRIVED_AT_HOSPITAL
  ├─ triage_complete -> ADMITTED
  └─ handover_failed -> ESCALATED
ADMITTED / RESOLVED / CANCELLED / ESCALATED = terminal or supervisory states
```

### Step-by-step technical flow

1. Simulator changes patient vitals and emits `emergency.vitals_changed`.
2. Rule engine evaluates threshold profile and emits one idempotent `emergency.detected` event.
3. Emergency projection creates a case with severity, SLA deadline, and correlation ID.
4. UI opens a non-dismissible critical card, plays an accessible alert, and focuses the case.
5. Operator acknowledges; command emits `emergency.acknowledged`.
6. Dispatcher service scores ambulances by distance, capability, availability, and current assignment.
7. Operator confirms or accepts recommendation; command reserves a unit with TTL.
8. Ambulance changes `STANDBY → RESERVED → EN_ROUTE → ON_SCENE → TRANSPORTING`.
9. Hospital resource projection ranks facilities using live capacity, blood compatibility, specialist coverage, and ETA.
10. Operator sends a referral request; receiving hospital must explicitly accept it.
11. Arrival and handover are recorded; case becomes `ADMITTED` only after receiving confirmation.
12. The full timeline remains searchable and replayable.

## 5. Product backlog / improvement order

### P0 — required before calling the simulator operational

- Replace feed-only event handlers with operational projections.
- Add vitals and deterministic emergency scenarios.
- Implement dispatch and referral state machines, not toast-only actions.
- Add event envelope, IDs, correlation, deduplication, and replay.
- Add simulation mode badge and hard separation from production data.
- Add automated tests for emergency transitions and idempotent commands.

### P1 — required for UAT

- Add logistics order lifecycle and driver assignment.
- Add teleconsultation queue, active timer, and doctor workload.
- Add hospital blood/bed/specialist resource panel with freshness state.
- Add stale GPS detection and location accuracy.
- Add scenario controls: pause, speed, trigger event, reset, replay.

### P2 — scale and governance

- WebSocket/SSE transport adapter.
- Multi-operator ownership and escalation policy.
- Historical analytics and SLA reports.
- RBAC for dispatch, referral booking, and emergency override.

## 6. Acceptance criteria

- A seeded heart-attack scenario produces the same event sequence for the same seed.
- One emergency case creates exactly one ambulance reservation even if the command is clicked twice.
- A failed refresh or disconnected transport never leaves a pending command in `loading` forever.
- Hospital capacity, blood stock, and specialist availability show source and freshness.
- The operator can replay a case from detection to admission without using real patient data.
- `npm run typecheck`, `npm run build`, and simulation unit tests pass in CI.
