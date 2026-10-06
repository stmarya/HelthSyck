# Cross-App Compatibility Contracts

`app-compatibility.v1.json` adalah daftar minimum kontrak yang harus dipahami oleh Admin, Command Center, seluruh mobile app, dan backend services.

Perubahan pada role, event envelope, dispatch, capacity, communication, atau pharmacy workflow harus menaikkan versi kontrak dan melewati release gate:

```bash
npm run test:integration
npm run typecheck
npm run build
```

Health page di Command Center hanya memeriksa reachability dan contract readiness. Authorization dan atomicity tetap wajib diuji di backend.
