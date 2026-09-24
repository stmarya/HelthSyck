const bcrypt = require('/app/node_modules/bcryptjs');
const adminHash = '$2a$12$IJGpUgmMtlXlXAWfE7XcgOGzRO7ZhxXaU3ERb9aRPcQQsOEVaSeyK';
const opHash    = '$2a$12$drm5auduwFD/a8WC1/ngSOtRQriH5CghmmE30cCCKZ0uNowlQySZi';
const candidates = [
  'Admin@123','Password@123','HealthSync@1','Admin1234!','admin@healthsync',
  'HealthSyncAdmin1','Healthsync@123','Adminadmin1','Admin@1234','HealthSync1!',
  'healthsync@Admin1','Admin@12345','AdminHS@1','CommandCenter@1','Operator@1234'
];
console.log('=== admin@healthsync.id ===');
candidates.forEach(p => { const ok = bcrypt.compareSync(p, adminHash); if(ok) console.log('MATCH:',p); });
console.log('=== operator@test.id ===');
candidates.forEach(p => { const ok = bcrypt.compareSync(p, opHash); if(ok) console.log('MATCH:',p); });
console.log('done');
