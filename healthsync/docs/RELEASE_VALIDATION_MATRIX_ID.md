# HealthSync — Matriks Validasi Release

Dokumen ini digunakan oleh Release Manager dan QA untuk menandai hasil validasi secara objektif.

## Status nilai

- `PASS`: bukti tersedia dan acceptance criteria terpenuhi.
- `FAIL`: validasi gagal.
- `BLOCKED`: belum dapat diuji karena dependency/environment belum tersedia.
- `N/A`: tidak termasuk scope release dan sudah disetujui.

## A. Repository dan merge

| ID | Validasi | Bukti yang diminta | Status |
|---|---|---|---|
| A-01 | Branch berasal dari `main` terbaru | Branch SHA dan commit list | [ ] |
| A-02 | Tidak ada merge conflict | PR mergeable clean | [ ] |
| A-03 | Semua workspace terdaftar | Root `package.json` dan lockfile | [ ] |
| A-04 | Lockfile sinkron | `npm ci` berhasil | [ ] |
| A-05 | Tidak ada secret di repository | Secret scan dan review diff | [ ] |
| A-06 | Satu release PR final | Link PR final | [ ] |

## B. CI dan build

| ID | Validasi | Bukti yang diminta | Status |
|---|---|---|---|
| B-01 | Shared package build | CI log | [ ] |
| B-02 | Node typecheck | CI log | [ ] |
| B-03 | Node lint tanpa warning | CI log | [ ] |
| B-04 | Node unit test | CI log | [ ] |
| B-05 | Command Center `test:release` | CI log | [ ] |
| B-06 | Admin typecheck/lint/build | CI log | [ ] |
| B-07 | Pharmacy typecheck/build | CI log | [ ] |
| B-08 | Flutter analyze | CI log | [ ] |
| B-09 | Flutter test | CI log | [ ] |
| B-10 | Flutter release build | Artifact APK | [ ] |
| B-11 | Production Docker image build | Image digest | [ ] |
| B-12 | Realtime image build | Image digest | [ ] |

## C. Contract dan authorization

| ID | Validasi | Acceptance criteria | Status |
|---|---|---|---|
| C-01 | Auth/RBAC | Role salah mendapat `401/403` | [ ] |
| C-02 | Pharmacy scope | Pharmacist A tidak dapat mengakses Pharmacy B | [ ] |
| C-03 | Ambulance scope | Driver A tidak dapat update Ambulance B | [ ] |
| C-04 | Location privacy | History lokasi tidak terbuka untuk user umum | [ ] |
| C-05 | Referral enum | Status sama di seluruh app | [ ] |
| C-06 | Prescription enum | Status sama di seluruh app | [ ] |
| C-07 | Event envelope | `eventId` dan `correlationId` tersedia | [ ] |
| C-08 | WebSocket auth | Socket tanpa token ditolak | [ ] |
| C-09 | Chat permission | Conversation di luar scope ditolak | [ ] |
| C-10 | Call permission | Target call tidak sah ditolak | [ ] |

## D. Command Center

| ID | Validasi | Acceptance criteria | Status |
|---|---|---|---|
| D-01 | Login | Operator dapat login dan logout | [ ] |
| D-02 | Overview | KPI memiliki source dan timestamp | [ ] |
| D-03 | Integration Health | Semua service critical terukur | [ ] |
| D-04 | Release Gate | Tidak `BLOCKED` pada staging | [ ] |
| D-05 | Live map | Provider live aktif | [ ] |
| D-06 | Location freshness | Lokasi stale ditandai | [ ] |
| D-07 | Emergency alert | Alert tampil dengan vital dan SLA | [ ] |
| D-08 | Acknowledge | Acknowledge menghasilkan audit event | [ ] |
| D-09 | Dispatch | Ambulance unavailable tidak dapat dipilih | [ ] |
| D-10 | Hospital capacity | Data kapasitas berasal dari backend | [ ] |
| D-11 | Referral | Booking memiliki expiry/idempotency | [ ] |
| D-12 | Chat | Message terkirim dan tersimpan | [ ] |
| D-13 | Call | WebRTC berhasil dengan TURN fallback | [ ] |
| D-14 | Reconnect | WebSocket reconnect setelah network loss | [ ] |
| D-15 | Error handling | Backend failure tidak menampilkan success palsu | [ ] |

## E. Data dan migration

| ID | Validasi | Acceptance criteria | Status |
|---|---|---|---|
| E-01 | Clean database migration | Semua migration berhasil dari kosong | [ ] |
| E-02 | Existing database migration | Migration aman pada database existing | [ ] |
| E-03 | Duplicate migration | Menjalankan ulang tidak merusak data | [ ] |
| E-04 | Backup | Backup berhasil dibuat dan dibaca | [ ] |
| E-05 | Restore | Restore test berhasil | [ ] |
| E-06 | Audit log | Mutation penting tercatat | [ ] |

## F. Infrastructure

| ID | Validasi | Acceptance criteria | Status |
|---|---|---|---|
| F-01 | Kubernetes YAML | `kubectl apply --dry-run=client` berhasil | [ ] |
| F-02 | Secrets | Tidak ada placeholder production | [ ] |
| F-03 | Readiness | Dependency gagal menghasilkan not-ready | [ ] |
| F-04 | Liveness | Process health terpisah dari dependency health | [ ] |
| F-05 | Image tag | Deployment menggunakan SHA/tag immutable | [ ] |
| F-06 | TLS | API, Command Center, dan WebSocket memakai TLS | [ ] |
| F-07 | CORS | Hanya origin resmi yang diizinkan | [ ] |
| F-08 | Rate limit | API dan WebSocket memiliki limit | [ ] |
| F-09 | Observability | Log, metric, dan error tracking tersedia | [ ] |
| F-10 | Rollback | Rollback image teruji | [ ] |

## G. Staging user acceptance test

| ID | Skenario | Hasil yang diharapkan | Status |
|---|---|---|---|
| G-01 | Operator login | Dashboard terbuka | [ ] |
| G-02 | Driver mengirim lokasi | Marker bergerak di map | [ ] |
| G-03 | Network loss | Status menjadi stale/offline | [ ] |
| G-04 | Pasien memburuk | Alert critical muncul | [ ] |
| G-05 | Operator acknowledge | Incident timeline berubah | [ ] |
| G-06 | Dispatch ambulance | Driver menerima command | [ ] |
| G-07 | Hospital referral | Resource hold tercatat | [ ] |
| G-08 | Pharmacy order | Order masuk ke pharmacy | [ ] |
| G-09 | Chat operator-driver | Pesan diterima dua arah | [ ] |
| G-10 | Call operator-hospital | Call berhasil dan dapat diakhiri | [ ] |
| G-11 | Unauthorized access | Akses ditolak dan diaudit | [ ] |
| G-12 | Rollback | Versi sebelumnya kembali sehat | [ ] |

## H. Stop conditions

Release harus dihentikan jika:

- Ada satu P0 security finding.
- `npm ci` gagal.
- Migration gagal.
- Release Gate `BLOCKED`.
- Live map masih simulator pada production.
- WebSocket tanpa authentication.
- Location history dapat diakses user yang tidak berwenang.
- Chat/call tidak memiliki authorization.
- Secret placeholder masuk ke cluster.
- Tidak ada rollback yang siap.

## I. Sign-off

```text
Release candidate:
Commit SHA:
Environment:
Date/time:
Release Manager:
QA:
DevOps:
Security reviewer:
Final status: BLOCKED / READY FOR STAGING / READY FOR PRODUCTION / ROLLED BACK
```
