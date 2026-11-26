const pool = require('../config/database');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const topics = new Map([
  ['room_cleanliness', 'ความสะอาดในห้องพัก'],
  ['bathroom_cleanliness', 'ความสะอาดของห้องน้ำ'],
  ['overall_satisfaction', 'ความพึงพอใจโดยรวมของห้องพิเศษ']
]);

function parseArray(value, label) {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    const error = new Error(`${label} ไม่ถูกต้อง`);
    error.status = 400;
    throw error;
  }
}

async function wards(req, res, next) {
  try {
    const [rows] = await pool.execute(
      'SELECT ward_id, ward_name, ward_code FROM wards WHERE is_active = 1 ORDER BY ward_name'
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
}

async function beds(req, res, next) {
  try {
    const wardId = Number(req.query.ward_id);
    if (!Number.isInteger(wardId) || wardId < 1) {
      return res.status(400).json({ message: 'กรุณาระบุ ward_id ให้ถูกต้อง' });
    }
    const [rows] = await pool.execute(
      'SELECT bed_id, ward_id, bed_name FROM beds WHERE ward_id = ? AND is_active = 1 ORDER BY bed_name',
      [wardId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
}

async function qrSurvey(req, res, next) {
  try {
    const [codes] = await pool.execute(
      'SELECT qr_code_id, building_name, bed_id FROM survey_qr_codes WHERE qr_token = ? AND is_active = 1',
      [req.params.token]
    );
    if (!codes.length) return res.status(404).json({ message: 'QR Code ไม่ถูกต้องหรือถูกปิดใช้งาน' });

    const [wards] = await pool.execute(
      `SELECT w.ward_id, w.ward_code, w.ward_name, w.ward_shortname,
       w.ward_shortname2
       FROM survey_qr_wards qw JOIN wards w ON w.ward_id = qw.ward_id
       WHERE qw.qr_code_id = ? AND w.is_active = 1
       ORDER BY w.ward_name, w.ward_code`,
      [codes[0].qr_code_id]
    );
    if (!wards.length) {
      return res.status(404).json({ message: 'Ward ของ QR Code นี้ปิดใช้งานหรือไม่พร้อมใช้งาน' });
    }
    const [bedRows] = await pool.execute(
      `SELECT b.bed_id, b.ward_id, b.bed_name
       FROM survey_qr_wards qw
       JOIN wards w ON w.ward_id = qw.ward_id AND w.is_active = 1
       JOIN beds b ON b.ward_id = w.ward_id AND b.is_active = 1
       WHERE qw.qr_code_id = ?
       ORDER BY w.ward_name, b.bed_name`,
      [codes[0].qr_code_id]
    );
    const bedsByWard = new Map(wards.map(ward => [ward.ward_id, []]));
    for (const bed of bedRows) {
      bedsByWard.get(bed.ward_id)?.push({ bed_id: bed.bed_id, bed_name: bed.bed_name });
    }
    const lockedBed = codes[0].bed_id === null
      ? null
      : bedRows.find(bed => String(bed.bed_id) === String(codes[0].bed_id));
    if (codes[0].bed_id !== null && !lockedBed) {
      return res.status(404).json({ message: 'เตียงที่กำหนดใน QR Code ไม่พร้อมใช้งาน' });
    }
    res.json({
      building_name: codes[0].building_name,
      locked_bed: lockedBed
        ? { bed_id: lockedBed.bed_id, bed_name: lockedBed.bed_name, ward_id: lockedBed.ward_id }
        : null,
      wards: wards.map(ward => ({ ...ward, beds: bedsByWard.get(ward.ward_id) }))
    });
  } catch (error) {
    next(error);
  }
}

async function problemCategories(req, res, next) {
  try {
    const [rows] = await pool.execute(
      'SELECT category_id, category_name FROM problem_categories WHERE is_active = 1 ORDER BY category_name'
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
}

async function createEvaluation(req, res, next) {
  let connection;
  const uploadedFiles = req.files || [];
  try {
    const bedValue = String(req.body.bed_id || '').trim();
    let bedId = bedValue ? Number(bedValue) : null;
    const qrToken = String(req.body.qr_token || '').trim();
    const respondentType = String(req.body.respondent_type || '');
    const suggestion = String(req.body.suggestion || '').trim();
    const description = String(req.body.problem_description || '').trim();
    const requestedProblemStatus = req.body.has_problem;
    const scores = parseArray(req.body.scores, 'คะแนน');
    const categoryIds = parseArray(req.body.problem_category_ids, 'ประเภทปัญหา');

    const invalid = message => {
      const error = new Error(message);
      error.status = 400;
      return error;
    };
    if (qrToken.length < 1 || qrToken.length > 128) throw invalid('ไม่พบ QR Code ที่ใช้ประเมิน');
    if (bedId !== null && (!Number.isInteger(bedId) || bedId < 1)) throw invalid('กรุณาเลือกเตียงให้ถูกต้อง');
    if (!['patient', 'relative', 'other'].includes(respondentType)) throw invalid('กรุณาเลือกประเภทผู้ตอบแบบประเมิน');
    if (requestedProblemStatus !== undefined && !['0', '1'].includes(requestedProblemStatus)) {
      throw invalid('สถานะการแจ้งปัญหาไม่ถูกต้อง');
    }
    if (scores.length !== topics.size || scores.some(item =>
      !item || !topics.has(item.topic_code) || !Number.isInteger(Number(item.score)) ||
      Number(item.score) < 1 || Number(item.score) > 5
    ) || new Set(scores.map(item => item.topic_code)).size !== topics.size) throw invalid('กรุณาให้คะแนนครบทุกหัวข้อ (1-5)');
    if (suggestion.length > 5000 || description.length > 5000) throw invalid('ข้อความยาวเกินกำหนด');
    

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [qrRows] = await connection.execute(
      'SELECT qr_code_id, bed_id FROM survey_qr_codes WHERE qr_token = ? AND is_active = 1 FOR UPDATE',
      [qrToken]
    );
    if (!qrRows.length) {
      throw invalid('QR Code ไม่ถูกต้องหรือถูกปิดใช้งาน กรุณาสแกน QR Code ของอาคารอีกครั้ง');
    }
    const [activeWards] = await connection.execute(
      `SELECT w.ward_id FROM survey_qr_wards qw
       JOIN wards w ON w.ward_id = qw.ward_id AND w.is_active = 1
       WHERE qw.qr_code_id = ?`,
      [qrRows[0].qr_code_id]
    );
    if (!activeWards.length) {
      throw invalid('Ward ของ QR Code นี้ปิดใช้งานหรือไม่พร้อมใช้งาน');
    }
    const lockedBedId = qrRows[0].bed_id === null ? null : Number(qrRows[0].bed_id);
    if (lockedBedId !== null) {
      if (bedId !== null && bedId !== lockedBedId) {
        throw invalid('QR Code นี้กำหนดเตียงไว้แล้ว กรุณาสแกน QR Code ให้ตรงกับเตียง');
      }
      bedId = lockedBedId;
    }
    let wardId = null;
    if (bedId !== null) {
      const [bedRows] = await connection.execute(
        `SELECT b.bed_id, b.ward_id FROM beds b
         JOIN wards w ON w.ward_id = b.ward_id AND w.is_active = 1
         JOIN survey_qr_wards qw ON qw.ward_id = w.ward_id
         WHERE b.bed_id = ? AND b.is_active = 1 AND qw.qr_code_id = ?`,
        [bedId, qrRows[0].qr_code_id]
      );
      if (!bedRows.length) throw invalid('เตียงที่เลือกไม่ได้อยู่ในอาคารหรือ Ward ของ QR Code นี้');
      wardId = bedRows[0].ward_id;
    }

    if (categoryIds.some(id => !Number.isInteger(Number(id)) || Number(id) < 1)) {
      throw invalid('ประเภทปัญหาไม่ถูกต้อง');
    }
    const uniqueCategoryIds = [...new Set(categoryIds.map(Number))];
    const hasProblemDetails = Boolean(description || uniqueCategoryIds.length || uploadedFiles.length);
    if (requestedProblemStatus === '0' && hasProblemDetails) {
      throw invalid('กรุณาเลือกมีปัญหาเมื่อระบุรายละเอียดหรือประเภทปัญหา');
    }
    if (uniqueCategoryIds.length) {
      const placeholders = uniqueCategoryIds.map(() => '?').join(',');
      const [categories] = await connection.execute(
        `SELECT category_id FROM problem_categories WHERE is_active = 1 AND category_id IN (${placeholders})`,
        uniqueCategoryIds
      );
      if (categories.length !== uniqueCategoryIds.length) {
        throw invalid('ไม่พบประเภทปัญหาที่เลือก');
      }
    }

    const overallScore = scores.reduce((sum, item) => sum + Number(item.score), 0) / scores.length;
    const hasProblem = requestedProblemStatus === undefined
      ? hasProblemDetails
      : requestedProblemStatus === '1';
    const evaluationCode = `EV-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const [evaluation] = await connection.execute(
      `INSERT INTO evaluations
       (evaluation_code, bed_id, ward_id, qr_code_id, respondent_type, overall_score, has_problem, suggestion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [evaluationCode, bedId, wardId, qrRows[0].qr_code_id, respondentType,
        overallScore.toFixed(2), hasProblem ? 1 : 0, suggestion || null]
    );
    for (const item of scores) {
      await connection.execute(
        'INSERT INTO evaluation_scores (evaluation_id, topic_code, topic_name, score) VALUES (?, ?, ?, ?)',
        [evaluation.insertId, item.topic_code, topics.get(item.topic_code), Number(item.score)]
      );
    }

    if (hasProblem) {
      const [report] = await connection.execute(
        'INSERT INTO problem_reports (evaluation_id, description) VALUES (?, ?)',
        [evaluation.insertId, description || '']
      );
      for (const categoryId of uniqueCategoryIds) {
        await connection.execute(
          'INSERT INTO problem_report_categories (report_id, category_id) VALUES (?, ?)',
          [report.insertId, categoryId]
        );
      }
      for (const file of uploadedFiles) {
        await connection.execute(
          `INSERT INTO problem_images
           (report_id, image_path, original_filename, stored_filename, mime_type, file_size)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [report.insertId, `/uploads/${file.filename}`, path.basename(file.originalname),
            file.filename, file.mimetype, file.size]
        );
      }
    }
    await connection.commit();
    res.status(201).json({ message: 'ส่งแบบประเมินเรียบร้อยแล้ว', evaluation_id: evaluation.insertId });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Unable to roll back evaluation transaction:', rollbackError.message);
      }
    }
    await Promise.all(uploadedFiles.map(file => fs.unlink(file.path).catch(cleanupError => {
      console.error(`Unable to remove uploaded file ${file.filename}:`, cleanupError.message);
    })));
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { wards, beds, qrSurvey, problemCategories, createEvaluation };
