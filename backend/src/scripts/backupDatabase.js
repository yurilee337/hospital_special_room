require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

function dumpExecutable() {
  if (process.env.MYSQLDUMP_PATH) return process.env.MYSQLDUMP_PATH;
  const xamppDump = 'C:\\xampp\\mysql\\bin\\mysqldump.exe';
  return process.platform === 'win32' && fs.existsSync(xamppDump) ? xamppDump : 'mysqldump';
}

async function createDatabaseBackup(backupFile) {
  const target = path.resolve(backupFile || path.join(__dirname, '..', '..', 'backups',
    `hospital_special_room-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`));
  await fs.promises.mkdir(path.dirname(target), { recursive: true });

  const args = [
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--default-character-set=utf8mb4',
    '--host', process.env.DB_HOST || '127.0.0.1',
    '--port', String(process.env.DB_PORT || 3306),
    '--user', process.env.DB_USER || 'root',
    process.env.DB_NAME || 'hospital_special_room'
  ];
  const child = spawn(dumpExecutable(), args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' },
    windowsHide: true
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    stderr += chunk;
    if (stderr.length > 65536) stderr = stderr.slice(-65536);
  });

  const output = fs.createWriteStream(target, { flags: 'wx' });
  try {
    const outputPromise = pipeline(child.stdout, output);
    const exitPromise = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    const [, exitCode] = await Promise.all([outputPromise, exitPromise]);
    if (exitCode !== 0) {
      throw new Error(`mysqldump failed (${exitCode}): ${stderr.trim() || 'unknown error'}`);
    }
    const details = await fs.promises.stat(target);
    if (!details.size) throw new Error('mysqldump created an empty backup file');
    return target;
  } catch (error) {
    await fs.promises.rm(target, { force: true });
    throw error;
  }
}

if (require.main === module) {
  createDatabaseBackup(process.argv[2])
    .then(file => console.log(`Database backup created: ${file}`))
    .catch(error => {
      console.error(`Database backup failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { createDatabaseBackup };
