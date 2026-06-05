const express = require('express');
const router = express.Router();
const carbonController = require('../controllers/carbonController');
const { authenticateToken } = require('../middleware/auth');

router.get('/metrics', authenticateToken, carbonController.getCarbonMetrics);
router.get('/trends', authenticateToken, carbonController.getCarbonTrends);
router.get('/breakdown', authenticateToken, carbonController.getCarbonBreakdown);
router.get('/goals', authenticateToken, carbonController.getCarbonGoals);

module.exports = router;
