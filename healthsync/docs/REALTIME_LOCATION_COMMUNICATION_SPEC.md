# Realtime Location & Communication

## Tujuan

Command Center menggunakan satu gateway realtime untuk peta live, chat operasional, dan panggilan audio antarpihak di platform. Fitur ini tidak menggunakan SMS atau jaringan telepon seluler.

## Metode lokasi

1. Aplikasi ambulans/driver meminta izin lokasi perangkat.
2. `navigator.geolocation.watchPosition` mengirim posisi dengan `enableHighAccuracy: true`, `maximumAge: 5s`, dan `timeout: 15s`.
3. Payload berisi latitude, longitude, accuracy, heading, speed, `entityId`, dan `entityType`.
4. Realtime gateway memvalidasi JWT, role, dan rentang koordinat, lalu meneruskan event ke operator Command Center dan entitas pemilik.
5. Command Center memperbarui marker tanpa polling. Simulator tetap menjadi fallback ketika tidak ada token atau device stream.

Produksi perlu menambahkan policy stale-location: `>15s` warning, `>60s` stale/critical, serta penyimpanan audit dan retention yang disetujui privacy/compliance.

## Chat

- Transport: WebSocket melalui `wss://<host>/ws`.
- Persistence: Redis list dengan retention 30 hari pada development gateway.
- Target: rumah sakit, apotek, dokter, driver, dan ambulans berdasarkan user/entity ID.
- Semua pengiriman harus tercatat dengan sender, recipient, timestamp, dan request ID.
- RBAC dan tenant authorization tetap wajib di service backend sebelum deployment produksi.

## Audio call

- Signaling: event WebSocket `call.invite`, `call.answer`, `call.ice`, `call.hangup`.
- Media: WebRTC audio peer-to-peer; server tidak membawa audio media.
- Development memakai STUN publik untuk discovery. Production wajib menyediakan TURN relay yang dikelola dan dikonfigurasi melalui environment, karena jaringan seluler/NAT sering tidak dapat terhubung langsung.
- Perekaman tidak aktif secara default. Jika diperlukan, consent, retention, dan audit harus disetujui terlebih dahulu.

## Operasional dan keamanan

- Frontend harus memakai HTTPS agar geolocation dan microphone permission tersedia; WebSocket berubah menjadi WSS.
- Realtime service memakai JWT yang sama dengan auth-service dan Redis internal network.
- Tambahkan rate limit, payload size limit, tenant checks, audit event, disconnect on token expiry, dan monitoring delivery latency sebelum production.
- Endpoint health hanya menyatakan gateway hidup; readiness Redis dan dependency authorization perlu menjadi health/readiness check terpisah.
