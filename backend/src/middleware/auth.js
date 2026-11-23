function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบผู้ดูแลก่อน' });
  }
  next();
}

module.exports = { requireAdmin };
