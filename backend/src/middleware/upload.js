const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

const uploadDirectory = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const extensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => callback(null, `${crypto.randomUUID()}${extensions[file.mimetype] || ''}`)
});

const uploadImages = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (req, file, callback) => {
    if (!extensions[file.mimetype]) {
      const error = new Error('รองรับเฉพาะไฟล์ JPG, PNG และ WEBP');
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  }
}).array('images', 3);

module.exports = { uploadImages };
