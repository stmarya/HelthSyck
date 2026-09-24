const bcrypt = require('/app/node_modules/bcryptjs');
const accounts = [
  { email: 'admin@healthsync.id',             hash: '$2a$12$IJGpUgmMtlXlX' },
  { email: 'budiari@test.id',                  hash: '$2a$12$ncFqTz6rSMrkv' },
  { email: 'operator@test.id',                 hash: '$2a$12$drm5auduwFD/a' },
  { email: 'pasien.test@healthsync.id',        hash: '$2a$12$ncFqTz6rSMrkv' },
];
// Kita butuh full hash, ambil dari DB dulu
// Tapi sudah tahu dari sebelumnya:
// pasien.test: $2a$12$ncFqTz6rSMrkv7SPhRfZd.4tjWxIm5qq7WBxNNjYuQ1875cYycVrm -> matches Admin@123
// operator.test: $2a$12$drm5auduwFD/a8WC1/ngSOtRQriH5CghmmE30cCCKZ0uNowlQySZi -> no match sebelumnya
// Cek lebih banyak password untuk operator
const opHash = '$2a$12$drm5auduwFD/a8WC1/ngSOtRQriH5CghmmE30cCCKZ0uNowlQySZi';
const adHash = '$2a$12$IJGpUgmMtlXlX'; // truncated, ambil full dari query
const candidates = ['Admin@123','admin@123','Operator@123','Command@123','HealthSync@1','Test@12345','Healthsync1','Command1','HealthSyncAdmin','adminadmin','Admin1234'];
console.log('=== operator@test.id ===');
candidates.forEach(p => { if(bcrypt.compareSync(p, opHash)) console.log('MATCH:', p); else console.log('no:', p); });
