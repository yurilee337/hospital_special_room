require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/database');

async function createAdmin() {
  const username = process.argv[2];
  const password = process.argv[3];
  const fullName = process.argv[4] || username;
  if (!username || !password || password.length < 8) {
    throw new Error('Usage: npm run admin:create -- <username> <password-at-least-8-characters> [full-name]');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute(
    `INSERT INTO admins
      (username, password_hash, full_name, role, is_active, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [username, passwordHash, fullName, 'admin', 1, 1]
  );
  console.log(`Created admin "${username.trim()}".`);
}

createAdmin().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
