const pool = require("../config/database");
const bcrypt = require("bcrypt");
const path = require("path");
const crypto = require("crypto");

async function login(req, res, next) {
  try {
    const { username, password } = req.body || {}; //หากหน้าบ้านกดยิง API มาโดยไม่ได้แนบข้อมูลอะไรมาเลยให้ใช้ก้อนว่าง {} แทน เพื่อป้องกันโปรแกรมแครชทันทีด้วย Error
    if (typeof username !== "string" || typeof password !== "string") {
      return res
        .status(400)
        .json({ message: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" });
    }
    const [admins] = await pool.execute(
      "SELECT admin_id, username, password_hash FROM admins WHERE username = ? AND is_active = 1",
      [username.trim()],
    );
    if (
      !admins.length ||
      !(await bcrypt.compare(password, admins[0].password_hash))
    ) {
      return res
        .status(401)
        .json({ message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }
    await pool.execute(
      "UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE admin_id = ?",
      [admins[0].admin_id],
    ); //อัปเดตเวลาที่ผู้ดูแลระบบเข้าสู่ระบบล่าสุด
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.adminId = admins[0].admin_id; //บันทึก admin_id ลงใน session
      req.session.username = admins[0].username; //บันทึก username ลงใน session
      req.session.save((saveError) => {
        if (saveError) return next(saveError); //บังคับให้เซิร์ฟเวอร์เขียนข้อมูล Session ลงที่จัดเก็บ
        res.json({
          admin: { admin_id: admins[0].admin_id, username: admins[0].username },
        });
      }); //ส่งข้อมูลแอดมินกลับไปให้ React
    }); //สร้าง session ใหม่เพื่อป้องกัน session fixation
  } catch (error) {
    next(error);
  }
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error); //หากเกิดข้อผิดพลาดในการทำลาย session ให้ส่ง error ไปยัง middleware จัดการข้อผิดพลาด
    res.clearCookie("hospital.sid"); //ลบ cookie ของ session ออกจากเบราว์เซอร์
    res.json({ message: "ออกจากระบบเรียบร้อยแล้ว" }); //ส่งข้อความยืนยันการออกจากระบบ
  });
}

function currentAdmin(req, res) {
  res.json({
    admin: { admin_id: req.session.adminId, username: req.session.username },
  });
}
//ฟังก์ชันนี้จะส่งข้อมูลแอดมินปัจจุบันกลับไปให้ React โดยดึงข้อมูลจาก session ของผู้ใช้ที่เข้าสู่ระบบอยู่
async function dashboard(req, res, next) {
  try {
    const months = Number(req.query.months || 12);
    if (![3, 6, 12].includes(months)) {
      return res.status(400).json({ message: "ช่วงเวลาที่เลือกไม่ถูกต้อง" });
    } //ตรวจสอบว่าค่าพารามิเตอร์ months ที่ส่งมาจาก React เป็น 3, 6 หรือ 12 เดือนเท่านั้น หากไม่ใช่ให้ส่งข้อความผิดพลาดกลับไป
    const monthOffset = months - 1; //คำนวณจำนวนเดือนย้อนหลังที่ต้องการดึงข้อมูล โดยลบ 1 จากค่าพารามิเตอร์ months เพื่อให้ได้ช่วงเวลาที่ถูกต้อง
    const buildingExpression =
      "COALESCE(qr.building_name, w.ward_name, 'ไม่ระบุอาคาร')";
    const selectedBuilding = String(req.query.building || "").trim(); //ดึงค่าพารามิเตอร์ building ที่ส่งมาจาก React และตัดช่องว่างออก
    const evaluationFilters = [
      `e.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${monthOffset} MONTH), '%Y-%m-01')`,
    ]; //สร้างตัวแปร evaluationFilters เพื่อเก็บเงื่อนไขการกรองข้อมูลแบบประเมิน โดยเริ่มต้นด้วยเงื่อนไขให้ดึงข้อมูลตั้งแต่เดือนแรกของเดือนที่เลือกย้อนหลัง
    const evaluationParams = [];
    if (selectedBuilding) {
      evaluationFilters.push(`${buildingExpression} = ?`); //หากมีการส่งค่าพารามิเตอร์ building มา ให้เพิ่มเงื่อนไขการกรองข้อมูลแบบประเมินให้ตรงกับอาคารที่เลือก
      evaluationParams.push(selectedBuilding); //เพิ่มค่าพารามิเตอร์ building ลงใน evaluationParams เพื่อใช้ในการ query ข้อมูลแบบประเมิน
    }
    const [[totals]] = await pool.execute(
      `SELECT COUNT(*) AS evaluation_count, COALESCE(AVG(e.overall_score), 0) AS average_score,
       COALESCE(SUM(e.has_problem = 1), 0) AS problem_count
       FROM evaluations e
       LEFT JOIN beds b ON b.bed_id = e.bed_id
       LEFT JOIN wards w ON w.ward_id = COALESCE(e.ward_id, b.ward_id)
       LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = e.qr_code_id
       WHERE ${evaluationFilters.join(" AND ")}`,
      evaluationParams,
    );
    const [monthly] = await pool.execute(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count,
       ROUND(AVG(overall_score), 2) AS average_score
       FROM evaluations WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
       GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY month`,
    ); //ดึงข้อมูลแบบประเมินรายเดือนย้อนหลัง 12 เดือน โดยนับจำนวนแบบประเมินและคำนวณค่าเฉลี่ยของคะแนนรวม
    const [buildings] = await pool.execute(
      `SELECT DISTINCT ${buildingExpression} AS building_name
       FROM wards w
       LEFT JOIN survey_qr_wards qrw ON qrw.ward_id = w.ward_id
       LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = qrw.qr_code_id
       WHERE w.is_active = 1
       ORDER BY building_name`,
    ); //ดึงรายชื่ออาคารทั้งหมดที่มี Ward ที่เปิดใช้งานอยู่ โดยใช้ DISTINCT เพื่อไม่ให้ซ้ำกัน และเรียงลำดับตามชื่ออาคาร
    const [buildingMonthly] = await pool.execute(
      `SELECT ${buildingExpression} AS building_name,
       DATE_FORMAT(e.created_at, '%Y-%m') AS month,
       ROUND(AVG(e.overall_score), 2) AS average_score
       FROM evaluations e
       LEFT JOIN beds b ON b.bed_id = e.bed_id
       LEFT JOIN wards w ON w.ward_id = COALESCE(e.ward_id, b.ward_id)
       LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = e.qr_code_id
       WHERE e.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${monthOffset} MONTH), '%Y-%m-01')
       GROUP BY building_name, DATE_FORMAT(e.created_at, '%Y-%m')
       ORDER BY month, building_name`,
    ); //ดึงข้อมูลแบบประเมินรายเดือนย้อนหลัง 12 เดือน โดยคำนวณค่าเฉลี่ยของคะแนนรวมแยกตามอาคาร และเรียงลำดับตามเดือนและชื่ออาคาร
    let roomMonthly = [];
    if (selectedBuilding) {
      const roomExpression =
        "CONCAT(COALESCE(w.ward_name, 'ไม่ระบุ Ward'), ' · ', COALESCE(b.bed_name, 'ไม่ระบุห้อง'))";
      const [rows] = await pool.execute(
        `SELECT ${buildingExpression} AS building_name, ${roomExpression} AS room_name,
         DATE_FORMAT(e.created_at, '%Y-%m') AS month,
         ROUND(AVG(e.overall_score), 2) AS average_score
         FROM beds b
         JOIN wards w ON w.ward_id = b.ward_id
         LEFT JOIN survey_qr_wards qrw ON qrw.ward_id = w.ward_id
         LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = qrw.qr_code_id
         LEFT JOIN evaluations e ON e.bed_id = b.bed_id
         AND e.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${monthOffset} MONTH), '%Y-%m-01')
         WHERE b.is_active = 1 AND w.is_active = 1 AND ${buildingExpression} = ?
         GROUP BY building_name, room_name, DATE_FORMAT(e.created_at, '%Y-%m')
         ORDER BY room_name, month`,
        [selectedBuilding],
      ); //ดึงข้อมูลแบบประเมินรายเดือนย้อนหลัง 12 เดือน โดยคำนวณค่าเฉลี่ยของคะแนนรวมแยกตามห้อง (Ward + Bed) และเรียงลำดับตามชื่อห้องและเดือน
      const [unassignedRoomRows] = await pool.execute(
        `SELECT ${buildingExpression} AS building_name, 'ไม่ระบุเตียง' AS room_name,
         DATE_FORMAT(e.created_at, '%Y-%m') AS month,
         ROUND(AVG(e.overall_score), 2) AS average_score
         FROM evaluations e
         LEFT JOIN wards w ON w.ward_id = e.ward_id
         LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = e.qr_code_id
         WHERE e.bed_id IS NULL
         AND e.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${monthOffset} MONTH), '%Y-%m-01')
         AND ${buildingExpression} = ?
         GROUP BY building_name, DATE_FORMAT(e.created_at, '%Y-%m')
         ORDER BY month`,
        [selectedBuilding],
      ); //ดึงข้อมูลแบบประเมินรายเดือนย้อนหลัง 12 เดือน สำหรับกรณีที่ไม่มีการระบุเตียง โดยคำนวณค่าเฉลี่ยของคะแนนรวมแยกตามอาคาร และเรียงลำดับตามเดือน
      roomMonthly = [...rows, ...unassignedRoomRows];
    }
    const [topRooms] = await pool.execute(
      `SELECT w.ward_name, b.bed_name, COUNT(e.evaluation_id) AS evaluation_count,
       ROUND(AVG(e.overall_score), 2) AS average_score
       FROM evaluations e JOIN beds b ON b.bed_id = e.bed_id
       JOIN wards w ON w.ward_id = b.ward_id
       LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = e.qr_code_id
       WHERE ${evaluationFilters.join(" AND ")}
       GROUP BY b.bed_id ORDER BY evaluation_count DESC LIMIT 5`,
      evaluationParams,
    ); //ดึงข้อมูลห้องที่มีจำนวนแบบประเมินมากที่สุด 5 ห้อง โดยคำนวณค่าเฉลี่ยของคะแนนรวมและนับจำนวนแบบประเมินแยกตามห้อง (Ward + Bed) และเรียงลำดับตามจำนวนแบบประเมินจากมากไปน้อย
    res.json({
      ...totals,
      monthly,
      top_rooms: topRooms,
      buildings,
      building_monthly: buildingMonthly,
      room_monthly: roomMonthly,
    });
  } catch (error) {
    next(error);
  }
} //ฟังก์ชันนี้จะดึงข้อมูลสรุปแบบประเมินจากฐานข้อมูลและส่งกลับไปให้ React โดยสามารถกรองข้อมูลตามช่วงเวลาและอาคารที่เลือกได้

function addFilters(query, params, filters) {
  if (filters.ward_id) {
    query.push("COALESCE(e.ward_id, w.ward_id) = ?");
    params.push(Number(filters.ward_id));
  } //หากมีการส่งค่าพารามิเตอร์ ward_id มา ให้เพิ่มเงื่อนไขการกรองข้อมูลแบบประเมินให้ตรงกับ Ward ที่เลือก และเพิ่มค่าพารามิเตอร์ ward_id ลงใน params เพื่อใช้ในการ query ข้อมูลแบบประเมิน
  if (filters.bed_id) {
    query.push("b.bed_id = ?");
    params.push(Number(filters.bed_id));
  } //หากมีการส่งค่าพารามิเตอร์ bed_id มา ให้เพิ่มเงื่อนไขการกรองข้อมูลแบบประเมินให้ตรงกับ Bed ที่เลือก และเพิ่มค่าพารามิเตอร์ bed_id ลงใน params เพื่อใช้ในการ query ข้อมูลแบบประเมิน
  if (filters.from) {
    query.push("e.created_at >= ?");
    params.push(filters.from);
  } //หากมีการส่งค่าพารามิเตอร์ from มา ให้เพิ่มเงื่อนไขการกรองข้อมูลแบบประเมินให้ดึงข้อมูลตั้งแต่วันที่ที่เลือก และเพิ่มค่าพารามิเตอร์ from ลงใน params เพื่อใช้ในการ query ข้อมูลแบบประเมิน
  if (filters.to) {
    query.push("e.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(filters.to);
  } //หากมีการส่งค่าพารามิเตอร์ to มา ให้เพิ่มเงื่อนไขการกรองข้อมูลแบบประเมินให้ดึงข้อมูลถึงวันที่ที่เลือก และเพิ่มค่าพารามิเตอร์ to ลงใน params เพื่อใช้ในการ query ข้อมูลแบบประเมิน
  if (filters.q) {
    query.push(
      "(b.bed_name LIKE ? OR w.ward_name LIKE ? OR qr.building_name LIKE ?)",
    );
    params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
  } //หากมีการส่งค่าพารามิเตอร์ q มา ให้เพิ่มเงื่อนไขการกรองข้อมูลแบบประเมินให้ค้นหาข้อมูลที่ตรงกับชื่อเตียง ชื่อ Ward หรือชื่ออาคารที่เลือก และเพิ่มค่าพารามิเตอร์ q ลงใน params เพื่อใช้ในการ query ข้อมูลแบบประเมิน
  if (filters.has_problem === "0" || filters.has_problem === "1") {
    query.push("e.has_problem = ?");
    params.push(Number(filters.has_problem));
  } //หากมีการส่งค่าพารามิเตอร์ has_problem มาเป็น '0' หรือ '1' ให้เพิ่มเงื่อนไขการกรองข้อมูลแบบประเมินให้ตรงกับสถานะปัญหาที่เลือก และเพิ่มค่าพารามิเตอร์ has_problem ลงใน params เพื่อใช้ในการ query ข้อมูลแบบประเมิน
}

function validateProblemFilter(req, res) {
  const value = req.query.has_problem;
  if (
    value !== undefined &&
    value !== "" &&
    !["0", "1"].includes(String(value))
  ) {
    res.status(400).json({ message: "ตัวกรองสถานะปัญหาไม่ถูกต้อง" });
    return false;
  }
  return true;
}

async function evaluations(req, res, next) {
  try {
    if (!validateProblemFilter(req, res)) return;
    const filters = [];
    const params = [];
    addFilters(filters, params, req.query);
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : ""; //สร้างเงื่อนไข WHERE สำหรับ query ข้อมูลแบบประเมิน โดยรวมเงื่อนไขที่ได้จาก addFilters เข้าด้วยกัน
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const [rows] = await pool.execute(
      `SELECT e.evaluation_id, e.respondent_type, e.overall_score, e.has_problem, e.suggestion,
       e.created_at, b.bed_name, w.ward_name,
       COALESCE(qr.building_name, w.ward_name) AS building_name
       FROM evaluations e LEFT JOIN beds b ON b.bed_id = e.bed_id
       LEFT JOIN wards w ON w.ward_id = COALESCE(e.ward_id, b.ward_id)
       LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = e.qr_code_id ${where}
       ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    ); //ดึงข้อมูลแบบประเมินจากฐานข้อมูล โดยรวมข้อมูลจากตาราง beds, wards และ survey_qr_codes เข้าด้วยกัน และกรองข้อมูลตามเงื่อนไขที่ได้จาก addFilters พร้อมทั้งจัดเรียงข้อมูลตามวันที่สร้างแบบประเมินจากล่าสุดไปเก่าสุด และจำกัดจำนวนข้อมูลที่ดึงมาในแต่ละหน้า
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM evaluations e
       LEFT JOIN beds b ON b.bed_id = e.bed_id
       LEFT JOIN wards w ON w.ward_id = COALESCE(e.ward_id, b.ward_id)
       LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = e.qr_code_id ${where}`,
      params,
    ); //ดึงจำนวนข้อมูลแบบประเมินทั้งหมดที่ตรงกับเงื่อนไขที่ได้จาก addFilters เพื่อใช้ในการคำนวณจำนวนหน้าของข้อมูล
    res.json({ data: rows, pagination: { page, limit, total } });
  } catch (error) {
    next(error);
  }
}
//ดึงรายละเอียดเชิงลึกของใบประเมินเพียง 1 รายการ
async function evaluationDetail(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT e.*, b.bed_name, w.ward_name,
       COALESCE(qr.building_name, w.ward_name) AS building_name
       FROM evaluations e LEFT JOIN beds b ON b.bed_id = e.bed_id
       LEFT JOIN wards w ON w.ward_id = COALESCE(e.ward_id, b.ward_id)
       LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = e.qr_code_id
       WHERE e.evaluation_id = ?`,
      [req.params.id],
    ); //รวมข้อมูลจากตาราง beds, wards และ survey_qr_codes เข้าด้วยกัน และกรองข้อมูลตาม evaluation_id ที่ส่งมาจาก React
    if (!rows.length)
      return res.status(404).json({ message: "ไม่พบแบบประเมิน" });
    const [scores] = await pool.execute(
      "SELECT topic_code, score FROM evaluation_scores WHERE evaluation_id = ? ORDER BY score_id",
      [req.params.id],
    );
    const [reports] = await pool.execute(
      `SELECT pr.report_id, pr.description, pr.created_at,
       GROUP_CONCAT(DISTINCT pc.category_name ORDER BY pc.category_name SEPARATOR ', ') AS categories
       FROM problem_reports pr
       LEFT JOIN problem_report_categories prc ON prc.report_id = pr.report_id
       LEFT JOIN problem_categories pc ON pc.category_id = prc.category_id
       WHERE pr.evaluation_id = ? GROUP BY pr.report_id`,
      [req.params.id],
    );
    for (const report of reports) {
      const [images] = await pool.execute(
        "SELECT image_id, image_path, original_filename FROM problem_images WHERE report_id = ?",
        [report.report_id],
      );
      report.images = images;
    }
    res.json({ ...rows[0], scores, problem_reports: reports });
  } catch (error) {
    next(error);
  }
}

async function problemReports(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    const params = [];
    const where = q
      ? "WHERE pr.description LIKE ? OR b.bed_name LIKE ? OR w.ward_name LIKE ? OR qr.building_name LIKE ?"
      : "";
    if (q) params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    const [rows] = await pool.execute(
      `SELECT pr.report_id, pr.description, pr.created_at, e.evaluation_id,
       b.bed_name, w.ward_name, COALESCE(qr.building_name, w.ward_name) AS building_name,
       GROUP_CONCAT(DISTINCT pc.category_name ORDER BY pc.category_name SEPARATOR ', ') AS categories,
       COUNT(DISTINCT pi.image_id) AS image_count
       FROM problem_reports pr JOIN evaluations e ON e.evaluation_id = pr.evaluation_id
       LEFT JOIN beds b ON b.bed_id = e.bed_id
       LEFT JOIN wards w ON w.ward_id = COALESCE(e.ward_id, b.ward_id)
       LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = e.qr_code_id
       LEFT JOIN problem_report_categories prc ON prc.report_id = pr.report_id
       LEFT JOIN problem_categories pc ON pc.category_id = prc.category_id
       LEFT JOIN problem_images pi ON pi.report_id = pr.report_id
       ${where} GROUP BY pr.report_id ORDER BY pr.created_at DESC`,
      params,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
}

async function problemReportDetail(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT pr.report_id, pr.description, pr.created_at, e.evaluation_id,
       b.bed_name, w.ward_name, COALESCE(qr.building_name, w.ward_name) AS building_name,
       GROUP_CONCAT(DISTINCT pc.category_name ORDER BY pc.category_name SEPARATOR ', ') AS categories
       FROM problem_reports pr JOIN evaluations e ON e.evaluation_id = pr.evaluation_id
       LEFT JOIN beds b ON b.bed_id = e.bed_id
       LEFT JOIN wards w ON w.ward_id = COALESCE(e.ward_id, b.ward_id)
       LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = e.qr_code_id
       LEFT JOIN problem_report_categories prc ON prc.report_id = pr.report_id
       LEFT JOIN problem_categories pc ON pc.category_id = prc.category_id
       WHERE pr.report_id = ? GROUP BY pr.report_id`,
      [req.params.id],
    );
    if (!rows.length)
      return res.status(404).json({ message: "ไม่พบรายการแจ้งปัญหา" });
    const [images] = await pool.execute(
      "SELECT image_id, image_path, original_filename FROM problem_images WHERE report_id = ?",
      [req.params.id],
    );
    res.json({ ...rows[0], images });
  } catch (error) {
    next(error);
  }
}

async function problemImage(req, res, next) {
  try {
    const [rows] = await pool.execute(
      "SELECT image_path FROM problem_images WHERE image_id = ?",
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ message: "ไม่พบรูปภาพ" });
    const filePath = path.join(
      __dirname,
      "..",
      "uploads",
      path.basename(rows[0].image_path),
    );
    res.sendFile(filePath, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
}

async function listWards(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT w.ward_id, w.ward_code, w.ward_name, w.ward_shortname,
       w.ward_shortname2, w.bedcount, w.is_active,
       COUNT(CASE WHEN b.is_active = 1 AND w.is_active = 1 THEN b.bed_id END) AS active_bed_count
       FROM wards w
       LEFT JOIN beds b ON b.ward_id = w.ward_id AND b.is_active = 1
       GROUP BY w.ward_id, w.ward_code, w.ward_name, w.ward_shortname,
       w.ward_shortname2, w.bedcount, w.is_active
       ORDER BY w.ward_code`,
    );
    const [beds] = await pool.execute(
      `SELECT b.bed_id, b.ward_id, b.bed_name,
       (b.is_active AND w.is_active) AS is_active
       FROM beds b JOIN wards w ON w.ward_id = b.ward_id
       ORDER BY b.bed_name`,
    );
    const bedsByWard = new Map(rows.map((ward) => [String(ward.ward_id), []]));
    for (const bed of beds) {
      bedsByWard.get(String(bed.ward_id))?.push(bed);
    }
    res.json(
      rows.map((ward) => ({
        ...ward,
        beds: bedsByWard.get(String(ward.ward_id)),
      })),
    );
  } catch (error) {
    next(error);
  }
}

async function updateWardStatus(req, res, next) {
  try {
    const wardId = Number(req.params.id);
    const isActive = Number(req.body && req.body.is_active);
    if (!Number.isInteger(wardId) || wardId < 1) {
      return res.status(400).json({ message: "Ward ไม่ถูกต้อง" });
    }
    if (![0, 1].includes(isActive)) {
      return res.status(400).json({ message: "สถานะ Ward ไม่ถูกต้อง" });
    }
    const [wards] = await pool.execute(
      "SELECT ward_id FROM wards WHERE ward_id = ?",
      [wardId],
    );
    if (!wards.length) return res.status(404).json({ message: "ไม่พบ Ward" });
    await pool.execute("UPDATE wards SET is_active = ? WHERE ward_id = ?", [
      isActive,
      wardId,
    ]);
    res.json({ ward_id: wardId, is_active: isActive });
  } catch (error) {
    next(error);
  }
}

async function listQrCodes(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT qr.qr_code_id, qr.qr_token, qr.building_name, qr.bed_id,
       b.bed_name, qr.is_active, qr.created_at, qw.ward_id,
       w.ward_code, w.ward_name
       FROM survey_qr_codes qr
       LEFT JOIN beds b ON b.bed_id = qr.bed_id
       LEFT JOIN survey_qr_wards qw ON qw.qr_code_id = qr.qr_code_id
       LEFT JOIN wards w ON w.ward_id = qw.ward_id
       ORDER BY qr.created_at DESC, w.ward_code`,
    );
    const codesById = new Map();
    for (const row of rows) {
      const key = String(row.qr_code_id);
      let code = codesById.get(key);
      if (!code) {
        code = {
          qr_code_id: row.qr_code_id,
          qr_token: row.qr_token,
          building_name: row.building_name,
          bed_id: row.bed_id,
          bed_name: row.bed_name,
          is_active: row.is_active,
          created_at: row.created_at,
          ward_ids: [],
          wards: [],
        };
        codesById.set(key, code);
      }
      if (
        row.ward_id !== null &&
        !code.ward_ids.some((id) => String(id) === String(row.ward_id))
      ) {
        code.ward_ids.push(row.ward_id);
        code.wards.push({
          ward_id: row.ward_id,
          ward_code: row.ward_code,
          ward_name: row.ward_name,
        });
      }
    }
    res.json([...codesById.values()]);
  } catch (error) {
    next(error);
  }
}

async function saveQrCode(req, res, next) {
  let connection;
  try {
    const requestedBuildingName = String(req.body.building_name || "").trim();
    const rawWardIds = req.body.ward_ids;
    const rawBedIds = req.body.bed_ids === undefined ? [] : req.body.bed_ids;
    const status =
      req.body.is_active === undefined ? 1 : Number(req.body.is_active);
    if (requestedBuildingName.length > 150) {
      return res
        .status(400)
        .json({ message: "ชื่ออาคารต้องไม่เกิน 150 ตัวอักษร" });
    }
    if (!Array.isArray(rawWardIds) || !rawWardIds.length) {
      return res
        .status(400)
        .json({ message: "กรุณาเลือก Ward อย่างน้อย 1 รายการ" });
    }
    if (!Array.isArray(rawBedIds)) {
      return res.status(400).json({ message: "รายการเตียงไม่ถูกต้อง" });
    }
    const wardIds = rawWardIds.map(Number);
    const bedIds = rawBedIds.map(Number);
    if (
      wardIds.some((id) => !Number.isInteger(id) || id < 1) ||
      new Set(wardIds).size !== wardIds.length
    ) {
      return res.status(400).json({ message: "รายการ Ward ไม่ถูกต้อง" });
    }
    if (
      bedIds.some((id) => !Number.isInteger(id) || id < 1) ||
      new Set(bedIds).size !== bedIds.length
    ) {
      return res.status(400).json({ message: "รายการเตียงไม่ถูกต้อง" });
    }
    if (bedIds.length && wardIds.length !== 1) {
      return res
        .status(400)
        .json({ message: "QR Code ที่ผูกกับเตียงต้องเลือก Ward เดียว" });
    }
    if (req.method === "PUT" && bedIds.length > 1) {
      return res
        .status(400)
        .json({ message: "QR Code หนึ่งรายการผูกกับเตียงได้เพียง 1 เตียง" });
    }
    if (![0, 1].includes(status))
      return res.status(400).json({ message: "สถานะ QR Code ไม่ถูกต้อง" });

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const placeholders = wardIds.map(() => "?").join(",");
    const [wards] = await connection.execute(
      `SELECT ward_id, ward_code, ward_name, is_active FROM wards
       WHERE ward_code IS NOT NULL AND ward_id IN (${placeholders}) FOR UPDATE`,
      wardIds,
    );
    if (wards.length !== wardIds.length) {
      const error = new Error(
        "พบ Ward ที่ไม่มีอยู่หรือไม่ใช่ Ward จากข้อมูลนำเข้า",
      );
      error.status = 400;
      throw error;
    }
    const isCreating = req.method === "POST";
    if (isCreating && wards.some((ward) => !Number(ward.is_active))) {
      const error = new Error(
        "ไม่สามารถสร้าง QR Code ให้ Ward ที่ปิดใช้งานได้",
      );
      error.status = 409;
      throw error;
    }

    const bedNames = new Map();
    if (bedIds.length) {
      const bedPlaceholders = bedIds.map(() => "?").join(",");
      const [beds] = await connection.execute(
        `SELECT bed_id, bed_name FROM beds
         WHERE ward_id = ? AND is_active = 1 AND bed_id IN (${bedPlaceholders})
         FOR UPDATE`,
        [wardIds[0], ...bedIds],
      );
      if (beds.length !== bedIds.length) {
        const error = new Error(
          "พบเตียงที่ไม่มีอยู่หรือไม่ได้อยู่ใน Ward ที่เลือก",
        );
        error.status = 400;
        throw error;
      }
      for (const bed of beds) bedNames.set(String(bed.bed_id), bed.bed_name);
    }

    let qrCodeId;
    let qrToken;
    if (!isCreating) {
      qrCodeId = Number(req.params.id);
      if (!Number.isInteger(qrCodeId) || qrCodeId < 1) {
        const error = new Error("QR Code ไม่ถูกต้อง");
        error.status = 400;
        throw error;
      }
      const [existing] = await connection.execute(
        "SELECT qr_token FROM survey_qr_codes WHERE qr_code_id = ? FOR UPDATE",
        [qrCodeId],
      );
      if (!existing.length) {
        const error = new Error("ไม่พบ QR Code");
        error.status = 404;
        throw error;
      }
      qrToken = existing[0].qr_token;
    }

    const bedCondition = bedIds.length
      ? `qr.bed_id IN (${bedIds.map(() => "?").join(",")})`
      : "qr.bed_id IS NULL";
    const excludeCurrent = isCreating ? "" : "AND qr.qr_code_id <> ?";
    const duplicateParams = bedIds.length ? [...wardIds, ...bedIds] : wardIds;
    if (!isCreating) duplicateParams.push(qrCodeId);
    const [duplicates] = await connection.execute(
      `SELECT qr.qr_code_id
       FROM survey_qr_codes qr
       JOIN survey_qr_wards qrw ON qrw.qr_code_id = qr.qr_code_id
       WHERE qrw.ward_id IN (${placeholders}) AND ${bedCondition} ${excludeCurrent}
       FOR UPDATE`,
      duplicateParams,
    );
    if (duplicates.length) {
      const error = new Error(
        bedIds.length
          ? "เตียงที่เลือกมี QR Code อยู่แล้ว"
          : "Ward ที่เลือกมี QR Code แบบไม่ผูกเตียงอยู่แล้ว",
      );
      error.status = 409;
      throw error;
    }

    const qrWards = wardIds.map((wardId) => {
      const ward = wards.find((item) => Number(item.ward_id) === wardId);
      return {
        ward_id: ward.ward_id,
        ward_code: ward.ward_code,
        ward_name: ward.ward_name,
      };
    });
    if (isCreating) {
      const qrChoices = bedIds.length
        ? bedIds.map((bedId) => ({ ward: wards[0], bedId }))
        : wards.map((ward) => ({ ward, bedId: null }));
      const createdCodes = [];
      for (const { ward, bedId } of qrChoices) {
        const buildingName = (requestedBuildingName || ward.ward_name).slice(
          0,
          150,
        );
        qrToken = crypto.randomBytes(32).toString("base64url");
        const [result] = await connection.execute(
          "INSERT INTO survey_qr_codes (qr_token, building_name, bed_id, is_active) VALUES (?, ?, ?, ?)",
          [qrToken, buildingName, bedId, status],
        );
        qrCodeId = result.insertId;
        await connection.execute(
          "INSERT INTO survey_qr_wards (qr_code_id, ward_id) VALUES (?, ?)",
          [qrCodeId, ward.ward_id],
        );
        createdCodes.push({
          qr_code_id: qrCodeId,
          qr_token: qrToken,
          building_name: buildingName,
          bed_id: bedId,
          bed_name: bedId === null ? null : bedNames.get(String(bedId)),
          ward_ids: [ward.ward_id],
          wards: [
            {
              ward_id: ward.ward_id,
              ward_code: ward.ward_code,
              ward_name: ward.ward_name,
            },
          ],
          is_active: status,
        });
      }
      await connection.commit();
      return res.status(201).json({ qr_codes: createdCodes });
    } else {
      const buildingName =
        requestedBuildingName ||
        wards
          .map((ward) => ward.ward_name)
          .join(", ")
          .slice(0, 150);
      const bedId = bedIds.length ? bedIds[0] : null;
      await connection.execute(
        "UPDATE survey_qr_codes SET building_name = ?, bed_id = ?, is_active = ? WHERE qr_code_id = ?",
        [buildingName, bedId, status, qrCodeId],
      );
      await connection.execute(
        "DELETE FROM survey_qr_wards WHERE qr_code_id = ?",
        [qrCodeId],
      );
      for (const wardId of wardIds) {
        await connection.execute(
          "INSERT INTO survey_qr_wards (qr_code_id, ward_id) VALUES (?, ?)",
          [qrCodeId, wardId],
        );
      }
      await connection.commit();
      return res.status(200).json({
        qr_code_id: qrCodeId,
        qr_token: qrToken,
        building_name: buildingName,
        bed_id: bedId,
        bed_name: bedId === null ? null : bedNames.get(String(bedId)),
        ward_ids: wardIds,
        wards: qrWards,
        is_active: status,
      });
    }
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Unable to roll back QR Code update transaction:",
          rollbackError.message,
        );
      }
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

async function deleteQrCode(req, res, next) {
  let connection;
  try {
    // รองรับทั้งส่งมาทาง req.body.qrCodeIds (array) และ req.params.id (ตัวเดียว)
    const rawIds = Array.isArray(req.body?.qrCodeIds)
      ? req.body.qrCodeIds
      : req.params?.id !== undefined
        ? [req.params.id]
        : [];

    if (!rawIds.length) {
      return res.status(400).json({ message: "QR Code ไม่ถูกต้อง" });
    }

    const qrCodeIds = [];
    for (const rawId of rawIds) {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ message: "QR Code ไม่ถูกต้อง" });
      }
      qrCodeIds.push(id);
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const deletedIds = [];
    const failedItems = [];

    for (const qrCodeId of qrCodeIds) {
      // เปลี่ยนชื่อคอลัมน์ใน SELECT ให้ตรงกับตารางจริงของคุณ เช่น qr_code_name หรือ code_value
      const [codes] = await connection.execute(
        "SELECT qr_code_id FROM survey_qr_codes WHERE qr_code_id = ? FOR UPDATE",
        [qrCodeId],
      );

      if (!codes.length) {
        failedItems.push({
          qrCodeId,
          label: `QR Code #${qrCodeId}`,
          reason: "ไม่พบ QR Code",
        });
        continue;
      }

      const label =
        codes[0].qr_code_name || codes[0].code_value || `QR Code #${qrCodeId}`;

      const [evaluations] = await connection.execute(
        "SELECT COUNT(*) AS total FROM evaluations WHERE qr_code_id = ?",
        [qrCodeId],
      );

      if (Number(evaluations[0].total) > 0) {
        failedItems.push({
          qrCodeId,
          label,
          reason: "QR Code นี้มีผลประเมินอ้างอิงอยู่ จึงไม่สามารถลบได้ ",
        });
        continue;
      }

      await connection.execute(
        "DELETE FROM survey_qr_wards WHERE qr_code_id = ?",
        [qrCodeId],
      );
      await connection.execute(
        "DELETE FROM survey_qr_codes WHERE qr_code_id = ?",
        [qrCodeId],
      );
      deletedIds.push(qrCodeId);
    }

    await connection.commit();

    // หากเรียกแบบลบเดี่ยว (params.id) และลบไม่สำเร็จ ให้คืน status 404 / 409 ตามเดิม
    if (
      !Array.isArray(req.body?.qrCodeIds) &&
      failedItems.length === 1 &&
      deletedIds.length === 0
    ) {
      const fail = failedItems[0];
      const status = fail.reason === "ไม่พบ QR Code" ? 404 : 409;
      return res.status(status).json({
        message: fail.reason,
        deletedIds,
        failedItems,
      });
    }

    return res.json({
      message:
        failedItems.length > 0
          ? `ลบสำเร็จ ${deletedIds.length} รายการ ไม่สำเร็จ ${failedItems.length} รายการ`
          : "ลบ QR Code เรียบร้อยแล้ว",
      deletedCount: deletedIds.length,
      deletedIds,
      failedItems,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Unable to roll back QR Code deletion transaction:",
          rollbackError.message,
        );
      }
    }
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

async function exportCsv(req, res, next) {
  try {
    if (!validateProblemFilter(req, res)) return;
    const filters = [];
    const params = [];
    addFilters(filters, params, req.query);
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const [rows] = await pool.execute(
      `SELECT e.evaluation_id,
       COALESCE(qr.building_name, w.ward_name) AS building_name,
       w.ward_name, b.bed_name, e.respondent_type,
       e.overall_score, e.has_problem, e.suggestion, e.created_at
       FROM evaluations e LEFT JOIN beds b ON b.bed_id = e.bed_id
       LEFT JOIN wards w ON w.ward_id = COALESCE(e.ward_id, b.ward_id)
       LEFT JOIN survey_qr_codes qr ON qr.qr_code_id = e.qr_code_id
       ${where} ORDER BY e.created_at DESC`,
      params,
    );
    const escape = (value) => {
      let text = String(value ?? "");
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const lines = [
      [
        "ID",
        "อาคาร",
        "Ward",
        "เตียง",
        "ผู้ตอบ",
        "คะแนนเฉลี่ย",
        "แจ้งปัญหา",
        "ข้อเสนอแนะ",
        "วันที่",
      ]
        .map(escape)
        .join(","),
      ...rows.map((row) =>
        [
          row.evaluation_id,
          row.building_name,
          row.ward_name,
          row.bed_name || "ไม่ระบุเตียง",
          { patient: "ผู้ป่วย", relative: "ญาติ", other: "อื่นๆ" }[
            row.respondent_type
          ] || row.respondent_type,
          row.overall_score,
          row.has_problem ? "มี" : "ไม่มี",
          row.suggestion,
          row.created_at,
        ]
          .map(escape)
          .join(","),
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="evaluations.csv"',
    );
    res.send(`\uFEFF${lines.join("\r\n")}`);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  logout,
  currentAdmin,
  dashboard,
  evaluations,
  evaluationDetail,
  problemReports,
  problemReportDetail,
  problemImage,
  listWards,
  updateWardStatus,
  listQrCodes,
  saveQrCode,
  deleteQrCode,
  exportCsv,
};
