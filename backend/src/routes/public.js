const express = require('express');
const controller = require('../controllers/publicController');
const { uploadImages } = require('../middleware/upload');

const router = express.Router();
router.get('/wards', controller.wards);
router.get('/beds', controller.beds);
router.get('/qr/:token', controller.qrSurvey);
router.get('/problem-categories', controller.problemCategories);
router.post('/evaluations', uploadImages, controller.createEvaluation);

module.exports = router;
