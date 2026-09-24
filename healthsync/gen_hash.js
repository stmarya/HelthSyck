const bcrypt = require('/app/node_modules/bcryptjs');
const password = 'Password@123';
const hash = bcrypt.hashSync(password, 12);
// Cetak SQL UPDATE
console.log("-- Hash baru untuk 'Password@123' (bcryptjs compatible)");
console.log("-- Verify: " + bcrypt.compareSync(password, hash));
console.log("");
console.log("UPDATE users SET password_hash = '" + hash + "'");
console.log("WHERE password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHXO';");
