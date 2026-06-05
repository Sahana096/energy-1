# Device Management - Troubleshooting Guide

## How to Make Devices Work

### Step 1: Login First
1. Open your browser and go to: `http://localhost:8000/index.html`
2. Login with admin credentials:
   - Email: `admin@energyai.com`
   - Password: `admin123`
3. Wait for the dashboard to load

### Step 2: Navigate to Devices Page
1. Click on "Devices" in the left sidebar
2. The page will automatically create 9 default devices for you
3. You should see device cards with icons, stats, and charts

### Step 3: Add a Custom Device
1. Click the "Add Device" button (top right corner)
2. Fill in the form:
   - Device Name (e.g., "Ceiling Fan")
   - Location (e.g., "Bedroom")
   - Power Rating in kW (e.g., 0.075)
   - Choose an icon (optional)
3. Click "Add Device"
4. Your new device will appear in the grid

### Step 4: Delete a Device
1. Click the red trash icon on any device card
2. Confirm the deletion
3. The device will be removed

## Common Issues and Solutions

### Issue 1: "Not Logged In" message
**Solution:** 
- Go back to index.html and login
- Make sure you see "Welcome, Admin" at the top
- Then try the devices page again

### Issue 2: Page is blank or empty
**Solution:**
- Open browser console (F12)
- Check for errors
- Most likely you're not logged in
- Try the test page: `http://localhost:8000/test-devices.html`

### Issue 3: Devices not showing after adding
**Solution:**
- Check browser console for errors
- Make sure you filled all required fields
- Power rating must be a number (e.g., 1.5, not "high")

### Issue 4: "Authentication Error"
**Solution:**
- Your login session expired
- Go back to index.html and login again
- Sessions last for 7 days

## Testing the API Directly

Open `http://localhost:8000/test-devices.html` in your browser:
1. Click "Test Devices API" button
2. If you see device data - everything is working!
3. If you see "NOT LOGGED IN" - you need to login first

## Default Devices That Will Be Created

When you first visit the devices page while logged in, these 9 devices are automatically added:

1. Air Conditioner - Living Room (1.2 kW)
2. Smart TV - Bedroom (0.15 kW)
3. Refrigerator - Kitchen (0.18 kW)
4. Water Heater - Bathroom (0.95 kW)
5. LED Lights - Kitchen (0.08 kW)
6. Laptop - Home Office (0.06 kW)
7. Washing Machine - Laundry Room (0.5 kW)
8. Microwave - Kitchen (1.0 kW)
9. Desktop Computer - Office (0.3 kW)

## Files Involved

- Frontend: `/frontend/devices.html` - The devices page
- Frontend: `/frontend/devices.js` - Device management logic
- Frontend: `/frontend/styles.css` - Device card styling (lines 1203-1300)
- Backend: `/backend/controllers/deviceController.js` - API endpoints
- Backend: `/backend/models/Device.js` - Database model
- Backend: `/backend/routes/devices.js` - Route definitions

## Quick Checklist

- [ ] Backend server running on port 5000
- [ ] Frontend server running on port 8000
- [ ] Logged in as admin@energyai.com
- [ ] Visited devices.html page
- [ ] Browser console shows no errors (F12)
- [ ] Devices appear in a grid layout
- [ ] Can click "Add Device" button
- [ ] Modal form opens correctly
- [ ] Can submit the form
- [ ] New device appears in grid
