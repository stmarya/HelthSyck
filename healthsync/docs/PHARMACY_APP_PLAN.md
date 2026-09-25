# HealthSync Pharmacy App — Plan & Integration Contract

## Target product

`apps/pharmacy` is a dedicated web console for pharmacists. It is not a second
admin panel: the scope is daily pharmacy operations and the role is restricted
to `PHARMACIST`.

### V1 capabilities

1. **Dashboard operasi**
   - Resep masuk
   - Resep yang sedang diproses
   - Delivery siap diserahkan
   - Stok kritis
   - Batch yang mendekati kadaluarsa
2. **Resep masuk**
   - Filter status dan pencarian pasien/ID resep
   - Detail item obat, dosis, jumlah, dokter, dan jenis fulfillment
   - Workflow `SENT_TO_PHARMACY → CONFIRMED → PREPARING → READY`
3. **Inventori**
   - Daftar stok per obat/batch
   - Indikator stok di bawah reorder level
   - Penyesuaian stok dengan alasan wajib
4. **Delivery handoff**
   - Daftar resep `READY` dengan fulfillment `DELIVERY`
   - Daftar driver aktif
   - Pembuatan tracking code dan estimasi tiba
   - Handoff ke Driver melalui `prescription_deliveries`
5. **Operational safety**
   - Session refresh JWT
   - Role guard `PHARMACIST`
   - Error state yang terlihat; tidak memakai fallback mock untuk data operasi

## Integrasi antar aplikasi

```text
Patient App
  └─ pilih apotek + PICKUP/DELIVERY
       ↓
Prescription Service
  └─ SENT_TO_PHARMACY
       ↓
Pharmacy App
  ├─ CONFIRMED (validasi stok)
  ├─ PREPARING
  ├─ READY
  └─ DELIVERING + courier assignment
       ↓
Driver App
  ├─ GET /v1/deliveries/me
  ├─ PICKED_UP
  ├─ IN_TRANSIT
  └─ DELIVERED / complete prescription
       ↓
Patient App + Admin + Command Center
  └─ melihat status delivery dan histori resep
```

## API contract V1

### Pharmacy service (`:3008`)

- `GET /v1/pharmacies/me` — apotek yang terhubung ke akun pharmacist
- `GET /v1/pharmacies/:id/staff` — assignment apoteker (admin)
- `PUT /v1/pharmacies/:id/staff` — assign/reactivate apoteker (admin)
- `DELETE /v1/pharmacies/:id/staff/:userId` — nonaktifkan assignment (admin)
- `GET /v1/pharmacies/:id/inventory`
- `POST /v1/pharmacies/:id/inventory/adjust`
- `PUT /v1/pharmacies/:id/inventory`
- `GET /v1/drugs/search`

### Prescription service (`:3004`)

- `GET /v1/prescriptions?status=...`
- `GET /v1/prescriptions/:id`
- `PUT /v1/prescriptions/:id/confirm`
- `PUT /v1/prescriptions/:id/prepare`
- `PUT /v1/prescriptions/:id/ready`
- `GET /v1/delivery/couriers`
- `PUT /v1/prescriptions/:id/deliver`
- `GET /v1/deliveries/me`
- `PUT /v1/prescriptions/:id/delivery-status`
- `PUT /v1/prescriptions/:id/complete`

## Database changes

Migration `V011__pharmacy_staff.sql` introduces `pharmacy_staff` so access is
based on an explicit pharmacist-to-pharmacy assignment. The previous implicit
comparison between `pharmacy_id` and `users.id` is not safe and does not match
the data model.

`V012__pharmacy_driver_role.sql` separates pharmacy couriers
(`PHARMACY_DRIVER`) from emergency ambulance drivers. `V013` remaps the three
delivery seed accounts, while `V014__pharmacy_audit_logs.sql` adds the
operational audit trail.

## Definition of done

- [x] Dedicated Pharmacy frontend in `apps/pharmacy`
- [x] PHARMACIST login guard
- [x] Pharmacy context resolved from the logged-in account
- [x] Recipe queue and status actions
- [x] Inventory view and stock adjustment
- [x] Driver handoff flow
- [x] Explicit pharmacist mapping migration
- [x] Driver delivery read/update endpoints
- [x] Admin assignment workflow for pharmacists
- [x] Notification events for pharmacy, patient, and courier transitions
- [x] Pharmacy audit events for assignment and inventory changes
- [x] Existing pharmacy and prescription service tests pass
- [x] Flutter CI gate for analyze/test/debug APK (runs on GitHub Actions)
- [ ] Flutter analyze/test/build verification in this workspace (Flutter SDK unavailable)
- [ ] End-to-end Docker smoke test with PostgreSQL, Redis, and seeded data