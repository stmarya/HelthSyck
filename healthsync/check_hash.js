const bcrypt = require('bcrypt');
const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO';
const candidates = ['Password@123','password','Password123','Admin@123','Demo@12345','Test@1234','healthsync','Healthsync@123','password123'];
Promise.all(candidates.map(p => bcrypt.compare(p, hash).then(ok => ({p, ok}))))
  .then(results => { results.forEach(r => console.log(r.ok ? 'MATCH: '+r.p : 'NO: '+r.p)); });
