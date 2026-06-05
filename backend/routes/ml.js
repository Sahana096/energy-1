const express = require('express');
const router  = express.Router();
const mlController = require('../controllers/mlController');
const { authenticateToken } = require('../middleware/auth');

router.get('/predict',              authenticateToken, mlController.predict);
router.get('/forecast',             authenticateToken, mlController.forecast);
router.get('/anomaly',              authenticateToken, mlController.anomaly);
router.get('/metrics',              authenticateToken, mlController.metrics);
router.get('/classify',             authenticateToken, mlController.classify);
router.get('/clusters',             authenticateToken, mlController.clusters);
router.get('/compare',              authenticateToken, mlController.compare);
router.get('/history',              authenticateToken, mlController.history);
router.get('/prediction-vs-actual', authenticateToken, mlController.predictionVsActual);

module.exports = router;
