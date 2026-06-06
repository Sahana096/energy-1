const DataUpload = require('../models/DataUpload');
const EnergyUsage = require('../models/EnergyUsage');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const FormData = require('form-data');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

function normalizeFileType(mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.csv') return 'text/csv';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return mimetype;
}

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();

    // If it's a CSV file, parse from buffer (memory storage)
    if (ext === '.csv') {
      try {
        const results = [];
        const errors = [];
        let rowCount = 0;

        const csvContent = req.file.buffer.toString('utf8');
        const firstLine = csvContent.split('\n')[0] || '';
        const separator = firstLine.includes(';') ? ';' : ',';

        await new Promise((resolve, reject) => {
          const { Readable } = require('stream');
          const stream = Readable.from([csvContent]);
          stream
            .pipe(csv({ separator, mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
            .on('data', (data) => {
              rowCount++;
              const normalized = {};
              Object.entries(data).forEach(([k, v]) => {
                normalized[k.trim().replace(/^\uFEFF/, '').toLowerCase()] = v;
              });
              const dateVal   = normalized.date;
              const energyVal = normalized.energyconsumed || normalized['energy consumed'] || normalized.kwh || normalized.energy || normalized.global_active_power;
              const deviceVal = normalized.device || normalized['device name'] || 'Unknown';

              if (!dateVal || energyVal === undefined) {
                errors.push(`Row ${rowCount}: missing date or energyConsumed`);
                return;
              }

              let dateStr = dateVal;
              if (dateStr && dateStr.includes('/') && dateStr.split('/')[0].length === 2) {
                const parts = dateStr.split('/');
                dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
              }
              if (normalized.time) dateStr += `T${normalized.time}`;

              const parsedDate   = new Date(dateStr);
              const parsedEnergy = parseFloat(energyVal);

              if (isNaN(parsedDate.getTime()) || isNaN(parsedEnergy)) {
                errors.push(`Row ${rowCount}: invalid date or energy value`);
                return;
              }

              results.push({
                userId: req.user.userId,
                date: parsedDate,
                energyConsumed: parsedEnergy,
                device: String(deviceVal).trim()
              });
            })
            .on('end', resolve)
            .on('error', reject);
        });

        if (results.length > 0) {
          await EnergyUsage.insertMany(results);
          const Prediction = require('../models/Prediction');
          await Prediction.deleteMany({ userId: req.user.userId });
          return res.status(201).json({
            success: true,
            message: `CSV imported successfully! ${results.length} energy records added to your dashboard.`,
            importedCount: results.length,
            errorCount: errors.length,
            errors: errors.slice(0, 10)
          });
        } else {
          return res.status(201).json({
            success: true,
            message: 'CSV file stored. No valid energy data found. Expected columns: date, energyConsumed, device',
            errors
          });
        }
      } catch (csvError) {
        console.error('CSV processing error:', csvError);
        return res.status(500).json({ success: false, message: 'CSV processing failed: ' + csvError.message });
      }
    }

    // For non-CSV files (images), store metadata only
    const upload = await DataUpload.create({
      userId:       req.user.userId,
      originalName: req.file.originalname,
      filename:     req.file.originalname,
      fileType:     normalizeFileType(req.file.mimetype, req.file.originalname),
      fileSize:     req.file.size,
      filePath:     'memory',
      description:  req.body.description || ''
    });

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      upload: {
        id: upload._id,
        originalName: upload.originalName,
        fileType: upload.fileType,
        fileSize: upload.fileSize,
        createdAt: upload.createdAt,
        description: upload.description
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getUserUploads = async (req, res) => {
  try {
    const uploads = await DataUpload.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .select('-filePath');

    res.json({ success: true, uploads });
  } catch (error) {
    console.error('Get uploads error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteUpload = async (req, res) => {
  try {
    const upload = await DataUpload.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!upload) {
      return res.status(404).json({ success: false, message: 'Upload not found' });
    }

    if (fs.existsSync(upload.filePath)) {
      fs.unlinkSync(upload.filePath);
    }

    await upload.deleteOne();
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const downloadUpload = async (req, res) => {
  try {
    const upload = await DataUpload.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!upload) {
      return res.status(404).json({ success: false, message: 'Upload not found' });
    }

    if (!fs.existsSync(upload.filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${upload.originalName}"`);
    res.setHeader('Content-Type', upload.fileType);
    res.sendFile(path.resolve(upload.filePath));
  } catch (error) {
    console.error('Download upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const ocrBillImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return res.status(400).json({ success: false, message: 'Only JPG and PNG images are supported for OCR' });
    }

    // Forward image buffer to Python ML service for OCR
    let ocrResult = null;
    try {
      const form = new FormData();
      form.append('image', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      const mlRes = await axios.post(`${ML_SERVICE_URL}/ocr`, form, {
        headers: form.getHeaders(),
        timeout: 30000
      });
      ocrResult = mlRes.data;
    } catch (mlErr) {
      console.warn('[OCR] ML service error:', mlErr.message);
      ocrResult = null;
    }

    // Save upload record (no file path needed with memory storage)
    const upload = await DataUpload.create({
      userId:       req.user.userId,
      originalName: req.file.originalname,
      filename:     req.file.originalname,
      fileType:     normalizeFileType(req.file.mimetype, req.file.originalname),
      fileSize:     req.file.size,
      filePath:     'memory',
      description:  req.body.description || 'Bill image'
    });

    if (!ocrResult || !ocrResult.success) {
      return res.status(ocrResult ? 503 : 500).json({
        success: false,
        message: ocrResult?.error || 'OCR service unavailable. Ensure the ML service is running.',
        install_hint: ocrResult?.install_hint,
        upload: { id: upload._id, originalName: upload.originalName }
      });
    }

    // If OCR extracted units + date, save as an EnergyUsage record
    // BUT only if history doesn't already cover this month
    let energyRecord = null;
    if (ocrResult.units != null && ocrResult.date) {
      const parsedDate = new Date(ocrResult.date);
      if (!isNaN(parsedDate.getTime()) && ocrResult.units > 0) {
        const yr  = parsedDate.getFullYear();
        const mon = parsedDate.getMonth();
        // Check if history already saved a record for this month
        const historyExists = await EnergyUsage.findOne({
          userId: req.user.userId,
          date: { $gte: new Date(yr, mon, 1), $lt: new Date(yr, mon + 1, 1) },
          device: 'Bill History (OCR)'
        });
        if (!historyExists) {
          energyRecord = await EnergyUsage.create({
            userId:         req.user.userId,
            date:           parsedDate,
            energyConsumed: ocrResult.units,
            device:         'Bill Image (OCR)'
          });
        }
      }
    }

    // Also save consumption history records if extracted
    let historySaved = 0;
    if (ocrResult.history?.length) {
      const MONTH_MAP = {JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,
                         JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
      // Get current bill month to avoid duplicating it
      const billDate = ocrResult.date ? new Date(ocrResult.date) : null;
      const billYr   = billDate?.getFullYear();
      const billMon  = billDate?.getMonth(); // 0-indexed

      for (const h of ocrResult.history) {
        try {
          const parts = h.period.split('-');
          const mon = parts[0].toUpperCase();
          const yr  = parseInt(parts[1]) < 100 ? 2000 + parseInt(parts[1]) : parseInt(parts[1]);
          const monNum = MONTH_MAP[mon];
          if (!monNum) continue;

          // Skip if this is the same month as the current bill (already saved above)
          if (billYr === yr && billMon === monNum - 1) continue;

          const hDate = new Date(yr, monNum - 1, 15); // mid-month
          const exists = await EnergyUsage.findOne({
            userId: req.user.userId,
            date: { $gte: new Date(yr, monNum - 1, 1), $lt: new Date(yr, monNum, 1) },
            device: { $in: ['Bill History (OCR)', 'Bill Image (OCR)'] }
          });
          if (!exists) {
            await EnergyUsage.create({
              userId:         req.user.userId,
              date:           hDate,
              energyConsumed: h.units,
              device:         'Bill History (OCR)'
            });
            historySaved++;
          }
        } catch (e) { /* skip bad history entry */ }
      }
    }

    res.status(201).json({
      success:       true,
      message:       energyRecord
        ? `OCR successful — ${ocrResult.units} kWh on ${ocrResult.date} saved.${historySaved > 0 ? ` Also saved ${historySaved} months of history.` : ''}`
        : ocrResult.units != null || ocrResult.cost != null
          ? 'OCR completed. Review the extracted values below.'
          : 'OCR ran but could not extract bill fields. Try a clearer image.',
      ocr: {
        units:      ocrResult.units,
        cost:       ocrResult.cost,
        date:       ocrResult.date,
        confidence: ocrResult.confidence,
        raw_text:   ocrResult.raw_text,
        history:    ocrResult.history || []
      },
      energy_record_created: !!energyRecord,
      history_saved:         historySaved,
      upload: { id: upload._id, originalName: upload.originalName }
    });
  } catch (error) {
    console.error('OCR error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { uploadFile, getUserUploads, deleteUpload, downloadUpload, ocrBillImage };
