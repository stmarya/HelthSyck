const bcrypt = require('/app/node_modules/bcryptjs');
const password = 'Password@123';
const hash = bcrypt.hashSync(password, 12);
console.log('Hash baru (bcryptjs r12):', hash);
// Verifikasi
console.log('Verify:', bcrypt.compareSync(password, hash));
// Test hash yang lama dari V008
const oldHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO';
console.log('Old V008 hash verify Password@123:', bcrypt.compareSync(password, oldHash));
