require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/database');

async function resetEmptyAutoIncrement() {
  const [tables] = await pool.execute(
    `SELECT TABLE_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND EXTRA LIKE '%auto_increment%'
     GROUP BY TABLE_NAME
     ORDER BY TABLE_NAME`
  );
  const resetTables = [];
  const skippedTables = [];

  for (const { TABLE_NAME: tableName } of tables) {
    const quotedTableName = `\`${String(tableName).replace(/`/g, '``')}\``;
    const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM ${quotedTableName}`);
    if (Number(rows[0].total) > 0) {
      skippedTables.push(tableName);
      continue;
    }
    await pool.query(`ALTER TABLE ${quotedTableName} AUTO_INCREMENT = 1`);
    resetTables.push(tableName);
  }

  if (resetTables.length) {
    console.log(`รีเซ็ต ID เป็น 1 แล้ว: ${resetTables.join(', ')}`);
  } else {
    console.log('ไม่พบตาราง AUTO_INCREMENT ที่ว่างและต้องรีเซ็ต');
  }
  if (skippedTables.length) {
    console.log(`คง ID เดิมไว้เพราะยังมีข้อมูล: ${skippedTables.join(', ')}`);
  }
}

if (require.main === module) {
  resetEmptyAutoIncrement()
    .catch(error => {
      console.error(`รีเซ็ต ID ไม่สำเร็จ: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { resetEmptyAutoIncrement };
