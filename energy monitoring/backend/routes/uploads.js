const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const uploadController = require('../controllers/uploadController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'text/csv', 'application/vnd.ms-excel', 'application/octet-stream', 'application/csv'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.csv'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(file.mimetype) && allowedExts.includes(ext)) {
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
