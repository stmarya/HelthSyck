# HealthSync Deployment Documentation

Gunakan dokumen berikut sesuai kebutuhan:

1. [`DEPLOYMENT_RUNBOOK_ID.md`](./DEPLOYMENT_RUNBOOK_ID.md)
   - Panduan deploy lengkap dalam Bahasa Indonesia.
   - Urutan merge monorepo.
   - Environment dan secret.
   - Staging dan production flow.
   - Rollback.
   - Stop-the-line blocker.

2. [`RELEASE_VALIDATION_MATRIX_ID.md`](./RELEASE_VALIDATION_MATRIX_ID.md)
   - Checklist repository dan merge.
   - CI, build, contract, authorization.
   - Command Center, realtime, GPS, call/chat.
   - Migration, infrastructure, staging UAT.
   - Sign-off release.

3. [`../RELEASE_INTEGRATION_PLAN.md`](../RELEASE_INTEGRATION_PLAN.md)
   - Branch integration dan aturan konsolidasi monorepo.

## Aturan singkat

- Mulai dari branch `release/healthsync-integration`.
- Jangan deploy dari feature branch.
- Jangan melewati P0 blocker.
- Simpan bukti setiap validasi.
- Merge ke `main` hanya melalui satu release PR final.
