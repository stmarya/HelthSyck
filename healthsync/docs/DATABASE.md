# HealthSync — Database & API Contract

> **Canonical source for FE ↔ BE ↔ DB alignment.** This document describes the schema that is actually applied by migrations `V001`–`V012`, the JSON contract emitted by the services, and the fields that may be used by the apps. When code and this document disagree, update the implementation or this document in the same change; do not introduce a second naming convention.

## 1. Runtime architecture

- The current development and deployment manifests run the migrations against **one PostgreSQL database** shared by the services. Tables are logically owned by a service, but this repository is not currently using database-per-service isolation.
- PostgreSQL is the source of truth. Redis is used for auth/session and notification queues; Kafka is currently used by the IoT → alert pipeline.
- HTTP JSON responses are wrapped as `{ data, meta }`.
- `data` containing a PostgreSQL row uses the service's current **snake_case response fields** (`patient_id`, `created_at`, `is_available`, etc.). Request bodies are validated with the service's existing **camelCase fields** (`patientId`, `createdAt`, `isAvailable`, etc.). Frontends must not assume that response field names are camelCase.
- Pagination from `paginated()` is:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0, "timestamp": "ISO-8601" }
}
```

- Notification listing is the intentional exception inside `data`:

```json
{
  "data": {
    "notifications": [],
    "meta": { "page": 1, "limit": 20, "total": 0, "pages": 0 }
  },
  "meta": { "timestamp": "ISO-8601" }
}
```

## 2. Authoritative migrations

| Version | Scope |
|---|---|
| `V001` | PostgreSQL extensions and shared functions |
| `V002` | users, roles, refresh tokens, OTP, auth audit |
| `V003` | patients, conditions, allergies, IoT devices, vital signs |
| `V004` | doctors, consultations, messages, ratings |
| `V005` | pharmacies, drugs, inventory, prescriptions, deliveries |
| `V006` | hospitals, beds, ambulances, referrals, alerts |
| `V007` | notifications, push tokens, medical audit, consent, dev seeds |
| `V008`–`V010` | development seed/enrichment data |
| `V011` | removes recoverable/raw `patients.nik` |
| `V012` | adds `consultations.urgency` |

Migration files live in [`infra/db/migrations`](../infra/db/migrations).

## 3. Shared enums and allowed values

These are the values accepted by the DB and/or the runtime validators. Values are case-sensitive.

| Domain | Allowed values |
|---|---|
| `users.role` | `PATIENT`, `DOCTOR`, `COMMAND_CENTER`, `PHARMACIST`, `AMBULANCE_DRIVER`, `ADMIN` |
| `users.status` | `ACTIVE`, `INACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION` |
| `patients.gender` | `MALE`, `FEMALE`, `OTHER` |
| `patients.blood_type` | `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`, `UNKNOWN` |
| `vital_signs.source` | `MANUAL`, `IOT_DEVICE`, `WEARABLE` |
| `consultations.status` | `PENDING`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `EXPIRED` |
| `consultations.urgency` | `LOW`, `NORMAL`, `HIGH`, `CRITICAL` |
| `consultation_messages.message_type` | `TEXT`, `IMAGE`, `FILE`, `SYSTEM` |
| `prescriptions.status` | `ISSUED`, `SENT_TO_PHARMACY`, `CONFIRMED`, `PREPARING`, `READY`, `DELIVERING`, `DELIVERED`, `CANCELLED` |
| `prescriptions.fulfillment_type` | `PICKUP`, `DELIVERY` |
| `referrals.status` | `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `IN_TRANSIT`, `ARRIVED`, `CANCELLED` |
| `referrals.urgency_level` | `NORMAL`, `URGENT`, `CRITICAL` |
| `ambulances.status` | `OFFLINE`, `AVAILABLE`, `DISPATCHED`, `EN_ROUTE`, `AT_SCENE`, `TRANSPORTING`, `RETURNING` |
| `hospital_beds.status` | `AVAILABLE`, `OCCUPIED`, `RESERVED`, `MAINTENANCE` |
| `notifications.channel` | `PUSH`, `SMS`, `IN_APP`, `EMAIL` |
| `notifications.status` | `PENDING`, `SENT`, `DELIVERED`, `FAILED`, `READ` |
| `notifications.priority` | `CRITICAL`, `HIGH`, `NORMAL`, `LOW` |

**Removed/invalid values:** `PARAMEDIC`, `SYSTEM` as JWT roles; `DISPENSED` as a prescription status; `ROUTINE` and `EMERGENCY` as referral urgency values; `COMPLETED` as a referral status. `PATIENT_EMERGENCY` remains only a Command Center simulation event and is not a DB enum.

## 4. Table contract

### Identity and patient data

- `users`: `id`, `email`, `phone`, `password_hash`, `role`, `status`, verification flags, login timestamps.
- `patients`: `id`, `user_id`, `nik_token`, `name`, `date_of_birth`, `gender`, `blood_type`, `phone`, `address`, emergency contact fields, `profile_photo_url`, timestamps.
- `patient_conditions`: `id`, `patient_id`, `icd10_code`, `description`, `diagnosed_at`, `is_active`, `notes`, `created_at`.
- `patient_allergies`: `id`, `patient_id`, `allergen`, `reaction`, `severity`, `created_at`.
- `iot_devices`: `id`, `patient_id`, `device_id`, `device_type`, `firmware_version`, `certificate_pem`, `is_active`, `last_seen_at`, `paired_at`.
- `vital_signs`: `id`, `patient_id`, `device_id`, `heart_rate`, `spo2`, `systolic_bp`, `diastolic_bp`, `temperature`, `activity_level`, `battery_level`, `signal_strength`, `source`, `raw_payload`, `recorded_at`.

`patients.nik` is not a persisted field. APIs may accept NIK only at the creation boundary to calculate `nik_token`; Doctor App must never render or request raw NIK.

### Clinical workflow

- `doctors`: `id`, `user_id`, `str_number`, `sip_number`, `specialization`, `sub_specialization`, `hospital_id`, experience/profile fields, availability and rating fields, verification timestamps.
- `consultations`: `id`, `patient_id`, nullable `doctor_id`, `status`, `chief_complaint`, `diagnosis`, `notes`, `symptom_data`, `urgency`, `started_at`, `ended_at`, timestamps.
- `consultation_messages`: `id`, `consultation_id`, `sender_id`, `message_type`, `content`, `file_url`, `file_name`, `is_read`, `read_at`, `created_at`.
- `consultation_ratings`: `id`, `consultation_id`, `patient_id`, `doctor_id`, `rating`, `review`, `created_at`.

There is **no `scheduled_at` column** and there is no `type` column in `consultations`. Scheduling/type must not be presented as persisted fields until a migration and backend contract are added. Current patient booking creates a request with `patientId`, `chiefComplaint`, optional `symptomData`, and optional `urgency`.

### Prescription and pharmacy workflow

- `pharmacies`: identity, license, address/contact, geo coordinates, active flag, operating hours.
- `drugs`: `id`, `generic_name`, `brand_name`, `dosage_form`, `strength`, `unit`, `drug_class`, `requires_prescription`.
- `pharmacy_inventory`: `pharmacy_id`, `drug_id`, `stock_qty`, `unit_price`, `batch_number`, `expires_at`, `reorder_level`.
- `prescriptions`: `id`, `consultation_id`, `patient_id`, `doctor_id`, nullable `pharmacy_id`, `status`, `fulfillment_type`, `delivery_address`, `notes`, `issued_at`, `expires_at`, `updated_at`.
- `prescription_items`: `id`, `prescription_id`, `drug_id`, `drug_name`, `dosage`, `quantity`, `instructions`, `substitution_allowed`.
- `prescription_deliveries`: `id`, `prescription_id`, `courier_id`, `tracking_code`, `status`, pickup/estimated/delivered timestamps, recipient signature, timestamps.

There are **no `drug_code`, `frequency`, `duration`, or `medicine_name` columns** in `prescription_items`. Use `drug_id`, `drug_name`, `dosage`, `quantity`, and `instructions`.

### Hospitals, ambulance, and referral

- `hospitals`: identity/license, address/contact, geo coordinates, bed counts, `specializations`, `is_active`, `is_emt_partner`.
- `hospital_beds`: `hospital_id`, `ward`, `room_number`, `bed_number`, `status`, nullable `patient_id`, `admitted_at`.
- `ambulances`: `hospital_id`, `plate_number`, `type`, `status`, nullable `driver_id`, geo/telemetry fields, active flag, timestamps.
- `referrals`: `patient_id`, source/destination hospital, referring/receiving doctor, nullable ambulance, `status`, `reason`, `diagnosis`, `urgency_level`, required specialization, notes, rejection reason, workflow timestamps.
- `alerts`: patient/device/vital references, `level`, `status`, metric/value/threshold, message, acknowledgement and resolution fields.

### Notifications and audit

- `notifications`: `user_id`, `channel`, `status`, `title`, `body`, JSON `data`, `priority`, `reference_id`, `reference_type`, delivery/read timestamps, retry metadata.
- `push_tokens`: user, token, platform, active flag and usage timestamps.
- `medical_audit_logs`: accessor, role, patient, action, resource, request and justification metadata.
- `consent_records`: user, consent type, grant/revoke state, version and timestamps.

## 5. FE ↔ BE endpoint contract used by Doctor App

| App action | Endpoint | Request fields | Response fields used by FE |
|---|---|---|---|
| Doctor profile | `GET /v1/doctors/me` | — | `id`, `user_id`, `specialization`, `sub_specialization`, `hospital_name`, `is_available`, `email`, `phone` |
| Availability | `PATCH /v1/doctors/me/availability` | `isAvailable: boolean` | `id`, `user_id`, `is_available`, `updated_at` |
| Consultation queue | `GET /v1/consultations?status=...` | `page`, `limit`, optional `status` | raw consultation fields plus `patient_name`, `doctor_email`; pagination `meta.totalPages` |
| Accept consultation | `PUT /v1/consultations/:id/accept` | — | raw consultation row |
| Start consultation | `PUT /v1/consultations/:id/start` | — | raw consultation row |
| Complete consultation | `PUT /v1/consultations/:id/complete` | `diagnosis`, optional `notes` | raw consultation row |
| Chat messages | `GET/POST /v1/consultations/:id/messages` | `content`, `messageType`, optional `fileUrl`, `fileName` | `message_type`, `content`, `sender_email`, `created_at` |
| Patient clinical data | `GET /v1/patients/:id` | — | `date_of_birth`, `blood_type`, `conditions`, `allergies`, `devices`, no raw NIK |
| Vitals | `GET /v1/patients/:id/vitals/latest` and `/vitals` | `from`, `to`, `page`, `limit` | `heart_rate`, `spo2`, `systolic_bp`, `diastolic_bp`, `temperature`, `source`, `recorded_at` |
| Drug search | `GET /v1/drugs/search?q=...` | query `q` | `id`, `generic_name`, `brand_name`, `dosage_form`, `strength`, `unit`, `drug_class` |
| Create prescription | `POST /v1/prescriptions` | `consultationId`, `patientId`, `items[]` with `drugId`, `drugName`, `dosage`, `quantity`, `instructions`, `substitutionAllowed` | prescription row plus `items[]` |
| Prescription detail | `GET /v1/prescriptions/:id` | — | prescription snake_case fields plus item `drug_name`, `dosage`, `quantity`, `instructions`, `strength` |
| Hospitals for referral | `GET /v1/hospitals?limit=...` | `page`, `limit`, optional filters | `id`, `name`, `city`, `address`, `available_beds`, `icu_available`, `specializations` |
| Create referral | `POST /v1/referrals` | `patientId`, `toHospitalId`, `reason`, `urgencyLevel`, optional `diagnosis`, `requiredSpecialization`, `notes` | referral row |
| Send referral | `PUT /v1/referrals/:id/send` | — | referral row with `status: SENT` |
| Referral list | `GET /v1/referrals` | `page`, `limit`, optional `status`, `urgencyLevel` | `patient_name`, hospital names, `status`, `urgency_level`, workflow timestamps |
| Notifications | `GET /v1/notifications?unread=true&limit=...` | query `unread`, `page`, `limit` | `data.notifications[]` with `id`, `title`, `body`, `priority`, `reference_id`, `reference_type`, `data`, `created_at` |
| Mark notifications read | `PUT /v1/notifications/read` | `{ notificationIds: string[] }` | `data.updated` |

## 6. Workflow state machines

### Consultation

`PENDING → ACCEPTED → IN_PROGRESS → COMPLETED`

Cancellation/expiry are terminal paths from the active states where permitted. A doctor accepts only an unassigned `PENDING` consultation; the first message from an accepted consultation advances it to `IN_PROGRESS`.

### Prescription

`ISSUED → SENT_TO_PHARMACY → CONFIRMED → PREPARING → READY → DELIVERING → DELIVERED`

`CANCELLED` is terminal. Doctor App creates only `ISSUED` prescriptions for an assigned consultation in `IN_PROGRESS` or `COMPLETED`.

### Referral

`DRAFT → SENT → ACCEPTED → IN_TRANSIT → ARRIVED`

`SENT → REJECTED` and active states may be cancelled by the permitted roles.

## 7. Cross-app integration status

- Doctor App consumes consultation, patient clinical, prescription, referral, hospital, and notification services using the contracts above.
- Admin and Command Center must use the same enum sets; in particular prescription uses `SENT_TO_PHARMACY` (not `DISPENSED`) and referral uses `SENT`/`NORMAL` (not `PENDING`/`ROUTINE`).
- Kafka topic names such as `hs.consultation.created` and `hs.prescription.issued` are **not runtime contracts in the current codebase**. Do not build a consumer around them until producers and schemas are implemented. Current cross-app workflow is synchronous REST plus notification-service endpoints.
- The IoT runtime currently uses configured Kafka topics `KAFKA_TOPIC_VITALS` and `KAFKA_TOPIC_ALERTS`; those are separate from the Doctor App REST contracts.

## 8. Change checklist

Before merging a contract change:

1. Update the migration if the persisted field or enum changes.
2. Update the service Zod/schema validation and response contract.
3. Update the relevant FE parser/types and all apps that consume the field.
4. Update this file and `docs/openapi.yaml` when the public API changes.
5. Run `npm run validate:contracts`, service type-check/lint/tests, and mobile `flutter analyze`/tests in CI.
