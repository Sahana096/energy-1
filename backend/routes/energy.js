const express = require('express');
const router  = express.Router();
const energyController = require('../controllers/energyController');
const { authenticateToken } = require('../middleware/auth');

router.get('/has-data',           authenticateToken, energyController.hasData);
router.get('/summary',            authenticateToken, energyController.getSummary);
router.get('/daily',              authenticateToken, energyController.getDaily);
router.get('/hourly',             authenticateToken, energyController.getHourly);
router.get('/submetering',        authenticateToken, energyController.getSubmetering);
router.get('/weekly-comparison',  authenticateToken, energyController.getWeeklyComparison);
router.get('/predict',            authenticateToken, energyController.predict);
router.get('/forecast',           authenticateToken, energyController.getForecast);
router.get('/records',            authenticateToken, energyController.getAllRecords);
router.post('/records',           authenticateToken, energyController.addRecord);
router.delete('/records',         authenticateToken, energyController.deleteAllRecords);

module.exports = router;
