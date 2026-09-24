const bcrypt = require('/app/node_modules/bcryptjs');
const hash1 = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO';
const hash3 = '$2a$12$drm5auduwFD/a8WC1/ngSOtRQriH5CghmmE30cCCKZ0uNowlQySZi';
// Dari test_bcrypt.js di root: hash3 ditest dengan Admin@123
// V008 comment: "bcrypt hash of Password@123" — mungkin bcryptjs vs bcrypt berbeda?
// Coba variasi password lain untuk hash1
const more = ['Password@123','P@ssword123','P@ssw0rd','Passw0rd@1','HealthSync@1','hs-dev','healthsync123','HealthSync','Passw@rd123','pass@1234','Pass@word1'];
console.log('=== Hash V008 more candidates ===');
more.forEach(p => { const ok = bcrypt.compareSync(p, hash1); console.log((ok?'MATCH':'no')+': '+p); });
console.log('=== Hash operator ($2a$12$drm...) ===');
more.forEach(p => { const ok = bcrypt.compareSync(p, hash3); if(ok) console.log('MATCH: '+p); });
