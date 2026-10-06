# HealthSync — Panduan Deploy dan Validasi Release

**Bahasa:** Indonesia  
**Target:** Tim engineering, release manager, DevOps, QA, dan operator deployment  
**Branch integrasi:** `release/healthsync-integration`

---

## 1. Tujuan dokumen

Dokumen ini menjadi acuan resmi sebelum melakukan merge, staging deployment, dan production deployment HealthSync.

HealthSync adalah monorepo. Artinya, perubahan pada satu aplikasi dapat memengaruhi:

- Root `package.json` dan `package-lock.json`.
- Shared package.
- API contract dan enum status.
- Global CI workflow.
- Docker Compose dan Kubernetes manifest.
- Database migration.
- Auth, RBAC, realtime, dan event delivery.

Karena itu, **build satu aplikasi saja tidak cukup untuk menyatakan seluruh release aman**.

---

## 2. Aturan utama release

1. Jangan deploy dari branch fitur.
2. Jangan merge beberapa PR aplikasi secara paralel ke `main`.
3. Gunakan `release/healthsync-integration` sebagai branch konsolidasi.
4. Jangan menganggap simulator sebagai live production feature.
5. Jangan deploy jika masih ada P0 blocker.
6. Jangan mengisi secret production di file repository.
7. Semua hasil validasi harus memiliki bukti: log CI, URL environment, screenshot, atau test report.
8. Jika satu gate gagal, release berhenti sampai masalah diselesaikan.

---

## 3. Alur branch dan merge

### Chain Command Center

```text
#4 → #8 → #9 → #10 → #11
```

### Chain Admin

```text
#1 → #2 → #5
```

Gunakan hasil akhir Admin dari PR #5. Jangan merge #1, #2, dan #5 secara blind ke `main`.

### Doctor/Mobile

```text
#6
```

PR Doctor/Mobile harus direbase setelah Command Center dan Admin selesai dikonsolidasikan.

### Urutan release

```text
main terbaru
  ↓
release/healthsync-integration
  ↓
Command Center chain
  ↓
Admin final
  ↓
Doctor/Mobile
  ↓
Pharmacy compatibility check
  ↓
full monorepo gate
  ↓
staging
  ↓
production
```

---

## 4. Pre-merge checklist

### 4.1 Struktur repository

- [ ] Semua workspace tercantum di `healthsync/package.json`.
- [ ] Semua workspace tercantum di `healthsync/package-lock.json`.
- [ ] Tidak ada `package.json` yang hilang dari workspace.
- [ ] Tidak ada dependency invalid atau unused yang wajib dihapus.
- [ ] Tidak ada konflik unresolved.
- [ ] Tidak ada file `.env` berisi secret.
- [ ] Migration baru memiliki nomor berurutan dan idempotent.

### 4.2 Shared contract

- [ ] Role enum konsisten antara Auth, Admin, Command Center, Mobile, dan backend.
- [ ] Status referral konsisten.
- [ ] Status prescription konsisten.
- [ ] Status ambulance konsisten.
- [ ] Event envelope memiliki `eventId`, `correlationId`, `occurredAt`, `actor`, dan `payload`.
- [ ] Communication event konsisten untuk chat, call, presence, dan location.
- [ ] Compatibility contract diperbarui jika ada perubahan payload.

### 4.3 Command Center

- [ ] `npm run test:release --workspace=apps/command-center` berhasil.
- [ ] TypeScript typecheck berhasil.
- [ ] ESLint berhasil tanpa warning.
- [ ] Production Vite build berhasil.
- [ ] Production Docker image berhasil dibuat.
- [ ] Integration Health dapat menampilkan status semua service.
- [ ] Release Gate tidak berada pada `BLOCKED`.
- [ ] Simulator diberi label jelas dan tidak digunakan untuk production.

### 4.4 Admin, Mobile, dan Pharmacy

- [ ] Admin typecheck, lint, dan build berhasil.
- [ ] Flutter analyze berhasil.
- [ ] Flutter test berhasil.
- [ ] Flutter release build berhasil.
- [ ] Pharmacy App typecheck dan build berhasil.
- [ ] API base URL tidak mengarah ke localhost pada staging/production.
- [ ] Tidak ada mock operational data yang tampil sebagai data nyata.

---

## 5. Perintah validasi lokal

Jalankan dari folder `healthsync/`.

```bash
npm ci
npm run build --workspace=packages/shared
npm run typecheck --workspaces --if-present
npm run lint --workspaces --if-present
npm run build --workspaces --if-present
npm test --workspaces --if-present
```

Command Center:

```bash
npm run test:config --workspace=apps/command-center
npm run test:integration --workspace=apps/command-center
npm run test:smoke --workspace=apps/command-center
npm run test:uiux --workspace=apps/command-center
npm run test:release --workspace=apps/command-center
```

Mobile:

```bash
cd apps/mobile
flutter pub get
flutter analyze
flutter test
flutter build apk --release
```

Kubernetes syntax:

```bash
kubectl apply --dry-run=client -f infra/k8s/
```

---

## 6. Konfigurasi environment

### 6.1 Command Center map

| Variable | Wajib | Keterangan |
|---|---:|---|
| `VITE_MAP_PROVIDER` | Ya | `maplibre`, `mapbox`, atau `google` untuk production |
| `VITE_MAP_STYLE_URL` | Ya | Style map live |
| `VITE_MAP_ACCESS_TOKEN` | Sesuai provider | Jangan commit ke repository |
| `VITE_ROUTING_URL` | Ya | Endpoint routing |
| `VITE_LOCATION_STALE_AFTER_MS` | Ya | Batas lokasi dianggap stale |

`simulator` hanya boleh digunakan untuk development atau staging khusus demo. Production harus menolak simulator.

### 6.2 Realtime dan call/chat

| Variable | Keterangan |
|---|---|
| `VITE_TURN_URL` | TURN server |
| `VITE_TURN_USERNAME` | Username short-lived |
| `VITE_TURN_CREDENTIAL` | Credential short-lived |
| `KUBE_CONFIG_DATA` | Base64 kubeconfig GitHub Environment |

TURN credential harus berasal dari secret manager atau mekanisme credential sementara. Jangan menggunakan credential permanen di bundle frontend.

### 6.3 Backend secrets

Minimal production membutuhkan:

```text
JWT_SECRET
DATABASE_URL
REDIS_URL
CORS_ORIGINS
KAFKA_BROKERS
MQTT_BROKER
SATUSEHAT credentials jika integration diaktifkan
BPJS credentials jika integration diaktifkan
```

Secret harus dimasukkan melalui Kubernetes Secret, AWS Secrets Manager, Vault, atau secret manager resmi lainnya.

---

## 7. Staging deployment

### 7.1 Persiapan

1. Pastikan branch integrasi sudah lulus CI.
2. Pastikan cluster staging tersedia.
3. Pastikan DNS dan TLS sudah aktif.
4. Pastikan database staging siap.
5. Jalankan semua migration.
6. Isi GitHub Environment `staging`.

### 7.2 Jalankan deployment

Gunakan workflow manual:

```text
Workflow: Deploy Command Center
Environment: staging
Map provider: maplibre/mapbox/google
```

Workflow akan:

1. Build image Command Center.
2. Build image Realtime Gateway.
3. Push image ke GHCR.
4. Membuat runtime ConfigMap dan Secret.
5. Apply Kubernetes manifest.
6. Update image berdasarkan commit SHA.
7. Menunggu rollout selesai.

### 7.3 Smoke test staging

```bash
kubectl get pods -n healthsync
kubectl get svc -n healthsync
kubectl get ingress -n healthsync
kubectl rollout status deployment/command-center -n healthsync
kubectl rollout status deployment/realtime-service -n healthsync
```

Health endpoint:

```bash
curl -i https://command.healthsync.id/health
curl -i https://command.healthsync.id/health/auth
curl -i https://command.healthsync.id/health/ambulance
curl -i https://command.healthsync.id/health/realtime
```

---

## 8. Validasi langsung yang wajib dilakukan user/QA

### 8.1 Login dan session

- [ ] Login Command Center berhasil.
- [ ] Role yang tidak diizinkan ditolak.
- [ ] Logout menghapus session.
- [ ] Expired token tidak menyebabkan infinite loading.
- [ ] Refresh page tidak merusak authentication state.

### 8.2 Live map

- [ ] Map menggunakan provider live, bukan simulator.
- [ ] Ambulance muncul dengan status yang benar.
- [ ] Update lokasi terlihat maksimal sesuai stale threshold.
- [ ] Lokasi lama berubah menjadi `STALE`.
- [ ] Lokasi invalid ditolak.
- [ ] Driver tidak dapat mengirim lokasi kendaraan lain.
- [ ] User tanpa permission tidak dapat membaca history lokasi.
- [ ] Map tetap memiliki empty/error state jika provider gagal.

### 8.3 Emergency workflow

- [ ] Emergency alert muncul.
- [ ] Vital signs terlihat jelas.
- [ ] Correlation ID tersedia.
- [ ] Operator dapat acknowledge alert.
- [ ] Aksi dispatch memiliki confirmation.
- [ ] Ambulance yang sudah tidak tersedia tidak dapat dipilih.
- [ ] Perubahan status masuk ke timeline.
- [ ] Audit trail tercatat.
- [ ] Alert duplicate tidak menghasilkan incident duplicate.

### 8.4 Hospital dan referral

- [ ] Kapasitas IGD/ICU/ward/OR berasal dari backend.
- [ ] Resource hold memiliki expiry.
- [ ] Resource yang sudah reserved tidak dapat di-booking ulang.
- [ ] Request referral memiliki idempotency key.
- [ ] Gagal booking menampilkan pesan yang jelas.
- [ ] Status referral sama antara Command Center, Admin, dan Hospital App.

### 8.5 Pharmacy dan logistics

- [ ] Order berasal dari prescription valid.
- [ ] Inventory memakai pharmacy yang benar.
- [ ] Pharmacist tidak dapat mengakses pharmacy lain.
- [ ] Stock adjustment tercatat.
- [ ] Driver hanya melihat delivery yang ditugaskan.
- [ ] Status delivery konsisten antar app.

### 8.6 Chat dan call

- [ ] Operator dapat melihat presence target.
- [ ] Chat terkirim dan tersimpan.
- [ ] User tanpa permission tidak dapat membuka conversation.
- [ ] Call invite, answer, ICE, dan hangup berhasil.
- [ ] Call berjalan di jaringan berbeda, bukan hanya localhost.
- [ ] TURN fallback berhasil.
- [ ] Call timeout ditangani.
- [ ] Reconnect WebSocket bekerja.
- [ ] Semua command sensitif masuk audit log.

---

## 9. Stop-the-line blocker

Deployment wajib dihentikan jika salah satu kondisi berikut terjadi:

- [ ] P0 authorization/IDOR.
- [ ] Location history dapat dibaca user yang salah.
- [ ] Production masih menggunakan simulator map.
- [ ] Health endpoint mengatakan sehat saat dependency kritis mati.
- [ ] CI menggunakan `continue-on-error` untuk gate penting.
- [ ] `npm ci` gagal.
- [ ] Migration gagal atau tidak idempotent.
- [ ] Secret placeholder masuk ke environment production.
- [ ] WebSocket dapat digunakan tanpa autentikasi.
- [ ] Call/chat tidak memiliki auditability.
- [ ] Tidak ada rollback image.
- [ ] Tidak ada bukti staging smoke test.

---

## 10. Rollback

Gunakan image tag berbasis commit SHA, bukan `latest`.

```bash
kubectl -n healthsync rollout history deployment/command-center
kubectl -n healthsync rollout undo deployment/command-center
kubectl -n healthsync rollout undo deployment/realtime-service
kubectl -n healthsync rollout status deployment/command-center --timeout=180s
```

Setelah rollback:

- [ ] Validasi `/health`.
- [ ] Validasi login.
- [ ] Validasi map.
- [ ] Validasi realtime.
- [ ] Catat incident dan commit SHA penyebab.

---

## 11. Bukti release yang harus disimpan

Setiap release harus memiliki:

- Commit SHA.
- Link PR final.
- Link CI run.
- Output `npm ci`.
- Output typecheck/lint/build/test.
- Output migration.
- Screenshot Integration Health.
- Screenshot live map.
- Bukti emergency flow.
- Bukti WebSocket/call/chat.
- Hasil authorization test.
- Image tag yang dideploy.
- Rollback plan.

Tanpa bukti ini, release dianggap belum tervalidasi.

---

## 12. Keputusan akhir

Gunakan status berikut:

| Status | Arti |
|---|---|
| `BLOCKED` | Ada blocker; jangan merge/deploy |
| `READY FOR STAGING` | CI hijau, belum lulus validasi environment |
| `READY FOR PRODUCTION` | CI dan staging seluruhnya hijau |
| `ROLLED BACK` | Release gagal dan dikembalikan ke image sebelumnya |

**Build hijau tidak sama dengan production ready.** Production ready hanya jika seluruh validasi aplikasi, keamanan, data, realtime, infrastruktur, dan rollback sudah memiliki bukti.
