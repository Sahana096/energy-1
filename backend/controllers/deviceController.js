const Device = require('../models/Device');

const defaultDevices = [
  { name: 'Air Conditioner', location: 'Living Room', icon: 'snowflake', power_kw: 1.2, status: true },
  { name: 'Smart TV', location: 'Bedroom', icon: 'tv', power_kw: 0.15, status: true },
  { name: 'Refrigerator', location: 'Kitchen', icon: 'blender', power_kw: 0.18, status: true },
  { name: 'Water Heater', location: 'Bathroom', icon: 'fire', power_kw: 0.95, status: false },
  { name: 'LED Lights', location: 'Kitchen', icon: 'lightbulb', power_kw: 0.08, status: true },
  { name: 'Laptop', location: 'Home Office', icon: 'laptop', power_kw: 0.06, status: true },
  { name: 'Washing Machine', location: 'Laundry Room', icon: 'tint', power_kw: 0.5, status: false },
  { name: 'Microwave', location: 'Kitchen', icon: 'radiation', power_kw: 1.0, status: false },
  { name: 'Desktop Computer', location: 'Office', icon: 'desktop', power_kw: 0.3, status: false }
];

async function seedDefaultDevices(userId) {
  const count = await Device.countDocuments({ userId });
  if (count === 0) {
    const devicesWithUser = defaultDevices.map(d => ({ ...d, userId }));
    await Device.insertMany(devicesWithUser);
  }
}

const getDevices = async (req, res) => {
  try {
    await seedDefaultDevices(req.user.userId);
    const devices = await Device.find({ userId: req.user.userId });
    res.json({
      success: true,
      devices: devices.map(d => ({
        id: d._id,
        name: d.name,
        location: d.location,
        icon: d.icon,
        power_kw: d.power_kw,
        status: d.status,
        energy_kwh: d.energy_kwh
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const createDevice = async (req, res) => {
  try {
    const { name, location, icon, power_kw } = req.body;

    // Sanitize and validate inputs
    const cleanName     = (name     || '').trim().slice(0, 100);
    const cleanLocation = (location || '').trim().slice(0, 100);
    const cleanIcon     = (icon     || 'plug').trim().replace(/[^a-z0-9\-]/g, '').slice(0, 50);
    const parsedPower   = parseFloat(power_kw);

    if (!cleanName || !cleanLocation) {
      return res.status(400).json({ success: false, message: 'Name and location are required' });
    }
    if (isNaN(parsedPower) || parsedPower <= 0 || parsedPower > 100) {
      return res.status(400).json({ success: false, message: 'Power rating must be a positive number (max 100 kW)' });
    }

    const device = await Device.create({
      userId:   req.user.userId,
      name:     cleanName,
      location: cleanLocation,
      icon:     cleanIcon,
      power_kw: parsedPower,
      status:   true,
      energy_kwh: 0
    });

    res.status(201).json({
      success: true,
      message: 'Device added successfully',
      device: {
        id: device._id,
        name: device.name,
        location: device.location,
        icon: device.icon,
        power_kw: device.power_kw,
        status: device.status,
        energy_kwh: device.energy_kwh
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteDevice = async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.device_id, userId: req.user.userId });
    
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    await Device.deleteOne({ _id: req.params.device_id });
    res.json({ success: true, message: 'Device deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const toggleDevice = async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.device_id, userId: req.user.userId });
    
    if (!device) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }
    
    device.status = !device.status;
    await device.save();
    
    res.json({ 
      success: true, 
      device: {
        id: device._id,
        name: device.name,
        location: device.location,
        icon: device.icon,
        power_kw: device.power_kw,
        status: device.status,
        energy_kwh: device.energy_kwh
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDeviceSummary = async (req, res) => {
  try {
    await seedDefaultDevices(req.user.userId);
    const devices = await Device.find({ userId: req.user.userId });
    const active = devices.filter(d => d.status);
    const totalPower = Math.round(active.reduce((sum, d) => sum + d.power_kw, 0) * 1000) / 1000;
    res.json({
      success: true,
      total_devices: devices.length,
      active_devices: active.length,
      total_power_kw: totalPower
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getDevices, createDevice, deleteDevice, toggleDevice, getDeviceSummary };
