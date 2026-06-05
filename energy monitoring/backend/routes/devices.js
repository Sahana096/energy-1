const express = require('express');
const router  = express.Router();
const deviceController = require('../controllers/deviceController');
const { authenticateToken } = require('../middleware/auth');
const { validateCreateDevice, validateObjectId } = require('../middleware/validate');

// Static routes MUST come before parameterised routes
router.get('/summary',                                                    authenticateToken, deviceController.getDeviceSummary);
router.get('/',                                                           authenticateToken, deviceController.getDevices);
router.post('/',                                                          authenticateToken, validateCreateDevice, deviceController.createDevice);
router.delete('/:device_id', validateObjectId('device_id'),              authenticateToken, deviceController.deleteDevice);
router.post('/:device_id/toggle', validateObjectId('device_id'),         authenticateToken, deviceController.toggleDevice);

module.exports = router;
