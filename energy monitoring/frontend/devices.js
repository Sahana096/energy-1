// Devices page JavaScript
const DEVICE_COLORS = ['#FFD700', '#ff6b35', '#43e97b', '#38f9d7', '#fa709a', '#fee140'];

async function loadDevices() {
    try {
        const token = getToken();
        if (!token) {
            const grid = document.getElementById('devicesGrid');
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding:3rem; color:#ff6b35;">
                    <h3><i class="fas fa-exclamation-triangle"></i> Not Logged In</h3>
                    <p>Please login to view and manage your devices.</p>
                    <a href="index.html" style="color:#FFD700; text-decoration:none; font-weight:bold; margin-top:1rem; display:inline-block;">Go to Login</a>
                </div>
            `;
            return;
        }

        const res = await fetch(`${API_BASE}/devices`, { headers: getAuthHeaders() });
        
        if (res.status === 401 || res.status === 403) {
            const grid = document.getElementById('devicesGrid');
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding:3rem; color:#ff6b35;">
                    <h3><i class="fas fa-key"></i> Authentication Error</h3>
                    <p>Your session has expired. Please login again.</p>
                    <a href="index.html" style="color:#FFD700; text-decoration:none; font-weight:bold; margin-top:1rem; display:inline-block;">Go to Login</a>
                </div>
            `;
            return;
        }
        
        const data = await res.json();
        
        const grid = document.getElementById('devicesGrid');
        
        if (!data.success || !data.devices || data.devices.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding:3rem; color:#aaa;">
                    <h3>No Devices Found</h3>
                    <p>Click "Add Device" to add your first device.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = '';
        
        data.devices.forEach((device, index) => {
            const icon = `fa-${device.icon || 'plug'}`;
            const color = DEVICE_COLORS[index % DEVICE_COLORS.length];
            const chartId = `deviceChart${index + 1}`;
            const costINR = device.status ? (device.power_kw * 8 * 7).toFixed(0) : '0'; // 8hrs/day * ₹7/kWh
            
            let moodEmoji, moodText, moodColor;
            if (device.energy_kwh > 50) {
                moodEmoji = '😰';
                moodText = 'High Usage - Warning!';
                moodColor = '#ff4444';
            } else if (device.energy_kwh > 35) {
                moodEmoji = '😟';
                moodText = 'High Usage';
                moodColor = '#ff6b35';
            } else if (device.energy_kwh > 20) {
                moodEmoji = '😌';
                moodText = 'Normal Usage';
                moodColor = '#FFD700';
            } else if (device.energy_kwh > 10) {
                moodEmoji = '🙂';
                moodText = 'Good Usage';
                moodColor = '#90EE90';
            } else {
                moodEmoji = '😄';
                moodText = 'Excellent - Low Usage!';
                moodColor = '#43e97b';
            }

            const cardHTML = `
                <div class="device-card ${device.status ? 'active' : 'inactive'}">
                    <div class="device-card-header">
                        <div class="device-icon-large" style="background: ${color}; position:relative;">
                            <i class="fas ${icon}"></i>
                            <span style="position:absolute; top:-10px; right:-10px; font-size:2rem; background:white; border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.2);">${moodEmoji}</span>
                        </div>
                        <div style="position:absolute; top:10px; right:10px; display:flex; gap:0.5rem;">
                            <button onclick="toggleDevice('${device.id}')" style="background:${device.status ? '#43e97b' : '#ff4444'}; border:none; color:white; width:35px; height:35px; border-radius:50%; cursor:pointer; font-size:1rem;" title="${device.status ? 'Turn Off' : 'Turn On'}">
                                <i class="fas fa-power-off"></i>
                            </button>
                            <button onclick="deleteDevice('${device.id}')" style="background:rgba(255,68,68,0.8); border:none; color:white; width:35px; height:35px; border-radius:50%; cursor:pointer; font-size:0.9rem;" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <h3>${device.name}</h3>
                    <p class="device-location" style="color:${moodColor}; font-weight:bold;">${device.location} - ${moodText}</p>
                    <div class="device-stats">
                        <div class="device-stat">
                            <span class="stat-label">Power</span>
                            <span class="stat-value">${device.power_kw} kW</span>
                        </div>
                        <div class="device-stat">
                            <span class="stat-label">Energy</span>
                            <span class="stat-value">${device.energy_kwh.toFixed(1)} kWh</span>
                        </div>
                        <div class="device-stat">
                            <span class="stat-label">Cost</span>
                            <span class="stat-value">₹${costINR}</span>
                        </div>
                    </div>
                    <div class="device-chart-mini">
                        <canvas id="${chartId}"></canvas>
                    </div>
                    <div style="margin-top:0.75rem; text-align:center;">
                        <span style="font-size:0.85rem; color:${device.status ? '#43e97b' : '#ff4444'}; font-weight:bold;">
                            <i class="fas fa-${device.status ? 'check-circle' : 'times-circle'}"></i>
                            ${device.status ? 'ON' : 'OFF'}
                        </span>
                    </div>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', cardHTML);
        });
        
        // Initialize mini charts
        data.devices.forEach((device, index) => {
            const chartId = `deviceChart${index + 1}`;
            const ctx = document.getElementById(chartId);
            if (ctx) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ['12AM', '4AM', '8AM', '12PM', '4PM', '8PM'],
                        datasets: [{
                            data: [0.3, 0.2, 0.8, 1.2, 1.0, 0.6].map(v => v * device.power_kw),
                            borderColor: DEVICE_COLORS[index % DEVICE_COLORS.length],
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            pointRadius: 0,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { display: false },
                            x: { display: false }
                        }
                    }
                });
            }
        });
    } catch (e) {
        console.error('Failed to load devices:', e);
        const grid = document.getElementById('devicesGrid');
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding:3rem; color:#ff6b35;">
                <h3>Error Loading Devices</h3>
                <p>${e.message}</p>
            </div>
        `;
    }
}

function showAddDeviceModal() {
    document.getElementById('addDeviceModal').style.display = 'flex';
}

function closeAddDeviceModal() {
    document.getElementById('addDeviceModal').style.display = 'none';
    document.getElementById('addDeviceForm').reset();
}

async function deleteDevice(deviceId) {
    if (!confirm('Are you sure you want to delete this device?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/devices/${deviceId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        
        if (data.success) {
            alert('Device deleted successfully!');
            loadDevices();
        } else {
            alert('Failed to delete device: ' + data.message);
        }
    } catch (e) {
        alert('Error deleting device: ' + e.message);
    }
}

async function toggleDevice(deviceId) {
    try {
        const res = await fetch(`${API_BASE}/devices/${deviceId}/toggle`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        
        if (data.success) {
            loadDevices(); // Reload to show updated status
        } else {
            alert('Failed to toggle device: ' + data.message);
        }
    } catch (e) {
        alert('Error toggling device: ' + e.message);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    loadDevices();
    
    document.getElementById('addDeviceForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const name = document.getElementById('deviceName').value;
        const location = document.getElementById('deviceLocation').value;
        const power_kw = document.getElementById('devicePower').value;
        const icon = document.getElementById('deviceIcon').value;
        
        try {
            const res = await fetch(`${API_BASE}/devices`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({ name, location, power_kw, icon })
            });
            
            const data = await res.json();
            
            if (data.success) {
                alert('Device added successfully!');
                closeAddDeviceModal();
                loadDevices();
            } else {
                alert('Failed to add device: ' + data.message);
            }
        } catch (e) {
            alert('Error adding device: ' + e.message);
        }
    });
});
