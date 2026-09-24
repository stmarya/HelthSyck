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

## Mobile driver dan ambulans

Mobile dashboard driver dan ambulans menjalankan `RealtimeLocationTracker` setelah session authenticated. Tracker meminta permission lokasi, memakai `distanceFilter: 10m`, dan mengirim `DRIVER` atau `AMBULANCE` ke gateway melalui WebSocket. URL produksi harus diberikan lewat `REALTIME_WS_URL` dan wajib menggunakan `wss://`.

Perubahan role mobile memisahkan `DRIVER` dari `AMBULANCE_DRIVER` dan menambahkan route guard. Data user lama dengan role `AMBULANCE_DRIVER` harus dimigrasikan ke role driver atau ambulans yang tepat; tanpa migrasi, user lama akan masuk mode ambulans.

Native release tetap harus menambahkan permission lokasi foreground/background pada Android/iOS dan menjalankan `flutter pub get`, `flutter analyze`, serta build device nyata sebelum pilot operasional.


## Hardening yang sudah ditambahkan

- `/health` menjadi liveness check; `/ready` memvalidasi koneksi Redis untuk readiness.
- Frame WebSocket dibatasi 64 KiB.
- JWT role divalidasi saat handshake; non-operator tidak dapat mengirim lokasi entity lain.
- Event lokasi diberi `staleAfterSeconds: 15` dan last-known location memiliki TTL 90 detik.
- Presence event dikirim saat entity online/offline.
- Chat, call signaling, dan location update dicatat ke Redis Stream `realtime:audit` dengan retention maksimum 10.000 event.
- Reconnect client memakai exponential backoff sampai 15 detik.
- TURN dapat dikonfigurasi melalui `VITE_TURN_URL`, `VITE_TURN_USERNAME`, dan `VITE_TURN_CREDENTIAL`. Credential TURN sebaiknya ephemeral dan tidak hard-code.

## Audit ulang terakhir

Temuan yang diperbaiki pada audit ulang:

- Redis readiness tidak lagi dianggap siap ketika status masih connecting.
- Non-operator hanya dapat chat/call ke operator aktif; operator tetap dapat menghubungi semua target.
- Rate limit gateway ditambahkan: maksimum 120 event per koneksi per menit.
- Driver/ambulans tidak dapat spoof `entityType`, koordinat, metadata akurasi, atau entity ID lain.
- Call ke target offline mengembalikan `TARGET_OFFLINE`, bukan membuat UI menggantung di status calling.
- Event call yang tidak dikenal ditolak.
- Browser tidak melakukan retry permanen untuk close code invalid-auth.
- Mobile GPS reconnect otomatis dengan backoff dan hanya mengirim lokasi setelah `auth.ok`.
- Candidate ICE yang datang sebelum remote description diantrikan.
- Map memperbarui usia GPS setiap detik sehingga label stale tidak membeku.
