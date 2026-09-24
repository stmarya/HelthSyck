const bcrypt = require('/app/node_modules/bcryptjs');
// Hash dari V008: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO
// Per komentar V008: "bcrypt hash of Password@123"
// Tapi test_bcrypt.js di root menggunakan bcryptjs untuk hash $2a$12 (V009/V010)
// Kemungkinan hash V008 bukan dari bcryptjs, tapi dari online generator lain.
// Cek hash dari test_bcrypt.js yang ada di root project:
const hash_pasientest = '$2a$12$ncFqTz6rSMrkv7SPhRfZd.4tjWxIm5qq7WBxNNjYuQ1875cYycVrm'; // pasien.test
const hash_v008 = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO';
// Re-generate hash Password@123 dengan bcryptjs untuk bandingkan format
const freshHash = bcrypt.hashSync('Password@123', 10);
console.log('Fresh hash of Password@123:', freshHash);
console.log('V008 hash sama?', freshHash === hash_v008);
// Coba verify V008 hash langsung
console.log('V008 matches Password@123?', bcrypt.compareSync('Password@123', hash_v008));
// Coba semua variasi
['Password@123','password@123','PASSWORD@123','P@ssword123','Pas$word@123'].forEach(p => {
  console.log(p, '->', bcrypt.compareSync(p, hash_v008));
});
