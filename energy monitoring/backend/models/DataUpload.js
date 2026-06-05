const mongoose = require('mongoose');

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'text/csv', 'application/vnd.ms-excel'];

const dataUploadSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  originalName: { type: String, required: true },
  filename:     { type: String, required: true },
  fileType:     { type: String, enum: ALLOWED_TYPES, required: true },
  fileSize:     { type: Number, required: true, min: 0 },
  filePath:     { type: String, required: true },
  description:  { type: String, default: '' }
}, { timestamps: true });

dataUploadSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('DataUpload', dataUploadSchema);
