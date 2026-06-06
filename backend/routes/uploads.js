const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const uploadController = require('../controllers/uploadController');

// Use memory storage — works on Render and any cloud platform
// Files are stored in memory as Buffer, no disk writes needed
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.csv'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG and CSV files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/',              authenticateToken, upload.single('dataFile'), uploadController.uploadFile);
router.post('/ocr',          authenticateToken, upload.single('dataFile'), uploadController.ocrBillImage);
router.get('/',               authenticateToken, uploadController.getUserUploads);
router.get('/:id/download',   authenticateToken, uploadController.downloadUpload);
router.delete('/:id',         authenticateToken, uploadController.deleteUpload);

module.exports = router;
