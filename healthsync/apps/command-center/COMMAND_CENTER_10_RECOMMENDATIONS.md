# Command Center — 10 rekomendasi yang dieksekusi

Patch ini menambahkan fondasi operasional yang aman untuk mode simulator dan siap dihubungkan ke backend production:

1. **Entity Identity Registry** — satu mapping resmi pasien, dokter, ambulans, driver, dan rumah sakit.
2. **Notification Center** — deduplikasi event berbasis correlation ID.
3. **Incident Timeline** — timeline emergency dari detected sampai perubahan status.
4. **Data Freshness Framework** — source, timestamp, stale threshold, dan confidence.
5. **RBAC/tenant policy** — command policy untuk Command Center/Admin dan scope facility.
6. **Map provider adapter** — provider/routing URL configurable; simulator tetap menjadi fallback.
7. **Hospital capacity reservation** — hold, confirm, release, expire; idempotent per pasien-resource.
8. **Workflow smoke gate** — `npm run test:smoke` memvalidasi file inti dan kontrak patch.
9. **Report validation contract** — periode, timezone, source, updatedAt, dan urutan tanggal wajib tervalidasi.
10. **Predictive capacity signals** — sinyal tekanan kapasitas rumah sakit dan beban emergency dengan confidence.

## Pengaktifan production map

Set `VITE_MAP_PROVIDER` ke `maplibre`, `mapbox`, atau `google`, lalu isi style/routing endpoint sesuai adapter backend. Jika kosong, UI tetap berjalan dalam mode `simulator` tanpa mengklaim GPS production.

## Acceptance gate

```bash
npm ci
npm run typecheck
npm run build
npm run test:smoke
```

Smoke test bukan pengganti integration/E2E test. CI harus tetap menjalankan typecheck, build, backend authorization tests, dan browser workflow terhadap environment staging.
