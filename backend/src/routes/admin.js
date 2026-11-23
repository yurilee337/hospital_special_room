const express = require('express');
const controller = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.use(requireAdmin);
router.get('/me', controller.currentAdmin);
router.get('/dashboard', controller.dashboard);
router.get('/evaluations', controller.evaluations);
router.get('/evaluations/:id', controller.evaluationDetail);
router.get('/problem-reports', controller.problemReports);
router.get('/problem-reports/:id', controller.problemReportDetail);
router.get('/problem-images/:id', controller.problemImage);
router.get('/wards', controller.listWards);
router.put('/wards/:id/status', controller.updateWardStatus);
router.get('/qr-codes', controller.listQrCodes);
router.post('/qr-codes', controller.saveQrCode);
router.put('/qr-codes/:id', controller.saveQrCode);
router.delete('/qr-codes/:id', controller.deleteQrCode);
router.get('/export/csv', controller.exportCsv);

module.exports = router;
