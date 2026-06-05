const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken } = require('../middleware/auth');

router.get('/summary',           authenticateToken, analyticsController.getSummary);
router.get('/trends',            authenticateToken, analyticsController.getTrends);
router.get('/peak-hours',        authenticateToken, analyticsController.getPeakHours);
router.get('/submetering',       authenticateToken, analyticsController.getSubmeteringBreakdown);
router.get('/weekly-comparison', authenticateToken, analyticsController.getWeeklyComparison);
router.get('/hourly',            authenticateToken, analyticsController.getHourlyUsage);
router.get('/range',             authenticateToken, analyticsController.getRangeData);

module.exports = router;
