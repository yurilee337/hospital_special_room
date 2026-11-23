require("dotenv").config({
  path: require("path").join(__dirname, "..", "..", ".env"),
});

const path = require("path");
const XLSX = require("xlsx");
const pool = require("../config/database");
const { createDatabaseBackup } = require("./backupDatabase");

const requiredColumns = {
  wards: ["ward", "name", "bedcount", "shortname", "shortname2", "is_active"],
  beds: ["bed_name", "ward"],
};

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--dry-run") {
      options.dryRun = true;
    } else if (
      item === "--wards" ||
      item === "--beds" ||
      item === "--backup-file"
    ) {
      if (!args[index + 1] || args[index + 1].startsWith("--")) {
        throw new Error(`กรุณาระบุค่าให้ ${item}`);
      }
      options[item.slice(2)] = args[index + 1];
      index += 1;
    } else {
      throw new Error(`ไม่รู้จักตัวเลือก ${item}`);
    }
  }
  if (!options.wards || !options.beds) {
    throw new Error(
      "วิธีใช้: npm run data:import -- --wards <ward.xls> --beds <bed_room_link.xls> [--dry-run] [--backup-file <path>]",
    );
  }
  return options;
}

function text(value) {
  return String(value ?? "").trim();
}

function readRows(file, expectedColumns) {
  const workbook = XLSX.readFile(path.resolve(file), {
    raw: false,
    cellDates: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`ไม่พบแผ่นงานในไฟล์ ${file}`);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });
  if (!rows.length) throw new Error(`ไฟล์ ${file} ไม่มีข้อมูล`);
  const headers = rows[0].map((value) => text(value).toLowerCase());
  const missing = expectedColumns.filter((column) => !headers.includes(column));
  if (missing.length) {
    throw new Error(
      `ไฟล์ ${file} ไม่มีคอลัมน์ที่จำเป็น: ${missing.join(", ")}`,
    );
  }
  const indexes = Object.fromEntries(
    expectedColumns.map((column) => [column, headers.indexOf(column)]),
  );
  return rows
    .slice(1)
    .filter((row) => row.some((value) => text(value)))
    .map((row, index) => ({
      sourceRow: index + 2,
      ...Object.fromEntries(
        expectedColumns.map((column) => [column, text(row[indexes[column]])]),
      ),
    }));
}

function validateSource(options) {
  const wards = readRows(options.wards, requiredColumns.wards).map((row) => {
    const bedcount = Number(row.bedcount);
    const status = row.is_active.toUpperCase();
    if (!row.ward || row.ward.length > 30)
      throw new Error(`รหัส Ward ไม่ถูกต้องที่แถว ${row.sourceRow}`);
    if (!row.name || row.name.length > 150)
      throw new Error(`ชื่อ Ward ไม่ถูกต้องที่แถว ${row.sourceRow}`);
    if (!Number.isInteger(bedcount) || bedcount < 0)
      throw new Error(`bedcount ไม่ถูกต้องที่แถว ${row.sourceRow}`);
    if (row.shortname.length > 60 || row.shortname2.length > 60) {
      throw new Error(
        `shortname หรือ shortname2 ยาวเกินกำหนดที่แถว ${row.sourceRow}`,
      );
    }
    if (!["Y", "N"].includes(status))
      throw new Error(`is_active ต้องเป็น Y หรือ N ที่แถว ${row.sourceRow}`);
    return { ...row, bedcount, is_active: status === "Y" ? 1 : 0 };
  });
  const beds = readRows(options.beds, requiredColumns.beds).map((row) => {
    if (!row.ward || !row.bed_name || row.bed_name.length > 30) {
      throw new Error(
        `ข้อมูล bed_name หรือ ward ไม่ถูกต้องที่แถว ${row.sourceRow}`,
      );
    }
    return row;
  });

  const duplicateWardCodes = wards.filter(
    (ward, index) =>
      wards.findIndex(
        (item) => item.ward.toLowerCase() === ward.ward.toLowerCase(),
      ) !== index,
  );
  if (duplicateWardCodes.length) {
    throw new Error(
      `พบรหัส Ward ซ้ำ: ${duplicateWardCodes.map((item) => item.ward).join(", ")}`,
    );
  }
  const wardCodes = new Set(wards.map((ward) => ward.ward.toLowerCase()));
  const orphanBeds = beds.filter(
    (bed) => !wardCodes.has(bed.ward.toLowerCase()),
  );
  if (orphanBeds.length) {
    throw new Error(
      `พบเตียงที่ไม่มี Ward รองรับ: ${orphanBeds.map((item) => `${item.bed_name} (Ward ${item.ward})`).join(", ")}`,
    );
  }
  const bedKeys = new Set();
  const duplicateBeds = [];
  for (const bed of beds) {
    const key = `${bed.ward.toLowerCase()}\u0000${bed.bed_name.toLowerCase()}`;
    if (bedKeys.has(key))
      duplicateBeds.push(`${bed.bed_name} (Ward ${bed.ward})`);
    bedKeys.add(key);
  }
  if (duplicateBeds.length)
    throw new Error(
      `พบรายการเตียงซ้ำใน Ward เดียวกัน: ${duplicateBeds.join(", ")}`,
    );
  return { wards, beds };
}

async function verifyMigration(connection) {
  const [rows] = await connection.execute(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND ((TABLE_NAME = 'wards' AND COLUMN_NAME IN
         ('ward_id', 'ward_code', 'ward_name', 'ward_shortname', 'ward_shortname2', 'bedcount'))
       OR (TABLE_NAME = 'beds' AND COLUMN_NAME IN ('bed_id', 'ward_id', 'bed_name'))
       OR (TABLE_NAME = 'evaluations' AND COLUMN_NAME IN ('bed_id', 'ward_id', 'qr_code_id')))
    `,
  );
  const columns = new Set(
    rows.map((row) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`),
  );
  const required = [
    "wards.ward_id",
    "wards.ward_code",
    "wards.ward_name",
    "wards.ward_shortname",
    "wards.ward_shortname2",
    "wards.bedcount",
    "beds.bed_id",
    "beds.ward_id",
    "beds.bed_name",
    "evaluations.bed_id",
    "evaluations.ward_id",
    "evaluations.qr_code_id",
  ];
  const [tables] = await connection.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('survey_qr_codes', 'survey_qr_wards')`,
  );
  const existingTables = new Set(tables.map((row) => row.TABLE_NAME));
  const missing = required
    .filter((column) => !columns.has(column))
    .concat(
      ["survey_qr_codes", "survey_qr_wards"].filter(
        (table) => !existingTables.has(table),
      ),
    );
  if (missing.length) {
    throw new Error(
      `กรุณาใช้ SQL migration 20261111_ward_beds_qr.sql ก่อนนำเข้า (ขาด ${missing.join(", ")})`,
    );
  }
}

async function replaceWardBeds(connection, wards, beds) {
  await connection.beginTransaction();
  try {
    const [existingWards] = await connection.execute(
      "SELECT ward_id, ward_code FROM wards WHERE ward_code IS NOT NULL FOR UPDATE",
    );
    const byWardCode = new Map(
      existingWards.map((row) => [String(row.ward_code).toLowerCase(), row]),
    );

    await connection.execute(
      "UPDATE wards SET is_active = 0 WHERE ward_code IS NOT NULL",
    );
    await connection.execute(
      `UPDATE beds b JOIN wards w ON w.ward_id = b.ward_id
       SET b.is_active = 0 WHERE w.ward_code IS NOT NULL`,
    );

    const wardIds = new Map();
    for (const ward of wards) {
      const existing = byWardCode.get(ward.ward.toLowerCase());
      if (existing) {
        await connection.execute(
          `UPDATE wards SET ward_code = ?, ward_name = ?, description = ?,
           ward_shortname = ?, ward_shortname2 = ?, bedcount = ?, is_active = ?
           WHERE ward_id = ?`,
          [
            ward.ward,
            ward.name,
            ward.shortname || null,
            ward.shortname || null,
            ward.shortname2 || null,
            ward.bedcount,
            ward.is_active,
            existing.ward_id,
          ],
        );
        wardIds.set(ward.ward, existing.ward_id);
      } else {
        const [result] = await connection.execute(
          `INSERT INTO wards
           (ward_name, description, ward_code, ward_shortname,
            ward_shortname2, bedcount, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            ward.name,
            ward.shortname || null,
            ward.ward,
            ward.shortname || null,
            ward.shortname2 || null,
            ward.bedcount,
            ward.is_active,
          ],
        );
        wardIds.set(ward.ward, result.insertId);
      }
    }

    for (const bed of beds) {
      await connection.execute(
        `INSERT INTO beds (ward_id, bed_name, is_active)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE is_active = 1`,
        [wardIds.get(bed.ward), bed.bed_name],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  let connection;
  try {
    const options = parseArguments(process.argv.slice(2));
    const { wards, beds } = validateSource(options);
    connection = await pool.getConnection();
    await verifyMigration(connection);

    if (options.dryRun) {
      console.log(
        `ตรวจสอบผ่าน: Ward ${wards.length} รายการ, เตียงจริง ${beds.length} รายการ`,
      );
      console.log(
        `สถานะ Ward: Y ${wards.filter((item) => item.is_active).length}, N ${wards.filter((item) => !item.is_active).length}`,
      );
      console.log("โหมด dry-run: ไม่มีการสำรองหรือเปลี่ยนแปลงฐานข้อมูล");
      return;
    }

    const backupFile = await createDatabaseBackup(options["backup-file"]);
    console.log(`สำรองฐานข้อมูลแล้ว: ${backupFile}`);
    await replaceWardBeds(connection, wards, beds);
    console.log(
      `นำเข้าสำเร็จ: Ward ${wards.length} รายการ, เตียง ${beds.length} รายการ`,
    );
    console.log(
      "ไม่สร้างเตียงจาก bedcount; ไม่ลบแถว Ward/เตียงเดิมหรือประวัติการประเมิน",
    );
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`นำเข้าข้อมูลไม่สำเร็จ: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArguments, readRows, validateSource, replaceWardBeds };
