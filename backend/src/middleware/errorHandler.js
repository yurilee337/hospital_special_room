function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'รูปภาพต้องมีขนาดไม่เกิน 5 MB' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ message: 'แนบรูปภาพได้ไม่เกิน 3 รูป' });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'ข้อมูลนี้มีอยู่แล้ว' });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
}

module.exports = errorHandler;
