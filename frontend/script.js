// Dashboard script
let liveUpdateInterval;
let isLiveUpdating = true;

document.addEventListener('DOMContentLoaded', function () {
    checkUserDataAndShowDashboard();
    startLiveUpdate();
    setupUploadForm();
    setupJpgUploadForm();
    setupNoDataUploadForm();
});

async function checkUserDataAndShowDashboard() {
    const noDataContent    = document.getElementById('noDataContent');
    const dashboardContent = document.getElementById('dashboardContent');
    const uploadSection    = document.getElementById('dataUploadSection');
    const token = getToken();

    if (!token) {
        if (noDataContent)    noDataContent.style.display    = 'none';
        if (dashboardContent) dashboardContent.style.display = 'none';
        if (uploadSection)    uploadSection.style.display    = 'none';
        return;
    }

    const session = sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user');
    const user    = session ? JSON.parse(session) : null;
    const isAdmin = user && user.role === 'admin';
    const userKey = user?.email ? 'energyai_hasData_' + btoa(user.email) : null;

    const cachedHasData = sessionStorage.getItem('energyai_hasData') === 'true'
                       || (userKey ? localStorage.getItem(userKey) === 'true' : false);

    if (isAdmin || cachedHasData) {
        if (noDataContent)    noDataContent.style.display    = 'none';
        if (dashboardContent) dashboardContent.style.display = 'block';
        if (uploadSection)    uploadSection.style.display    = 'none'; // existing user — hide upload
        initializeDistributionChart();
        loadUserUploads();
        setTimeout(() => initializeRealtimeChart(), 100);
        try {
            const res  = await fetch(`${API_BASE}/energy/summary`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.hasData) {
                sessionStorage.setItem('energyai_hasData', 'true');
                if (userKey) localStorage.setItem(userKey, 'true');
                loadUserDashboardStats(data);
            } else if (!isAdmin) {
                sessionStorage.removeItem('energyai_hasData');
                if (userKey) localStorage.removeItem(userKey);
                if (noDataContent)    noDataContent.style.display    = 'flex';
                if (dashboardContent) dashboardContent.style.display = 'none';
                if (uploadSection)    uploadSection.style.display    = 'block'; // data deleted — show upload
            } else {
                loadAIInsights();
                loadDashboardDevices();
            }
        } catch(e) { /* keep dashboard */ }
        if (isAdmin) loadAdminStats();
        return;
    }

    try {
        const res  = await fetch(`${API_BASE}/energy/summary`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.hasData) {
            sessionStorage.setItem('energyai_hasData', 'true');
            if (userKey) localStorage.setItem(userKey, 'true');
            if (noDataContent)    noDataContent.style.display    = 'none';
            if (dashboardContent) dashboardContent.style.display = 'block';
            if (uploadSection)    uploadSection.style.display    = 'none'; // has data — hide upload
            initializeDistributionChart();
            setTimeout(() => initializeRealtimeChart(), 100);
            loadUserDashboardStats(data);
            loadUserUploads();
        } else {
            // New user — no data yet
            if (noDataContent)    noDataContent.style.display    = 'flex';
            if (dashboardContent) dashboardContent.style.display = 'none';
            if (uploadSection)    uploadSection.style.display    = 'block'; // new user — show upload
        }
    } catch (e) {
        if (noDataContent)    noDataContent.style.display    = 'flex';
        if (dashboardContent) dashboardContent.style.display = 'none';
        if (uploadSection)    uploadSection.style.display    = 'block';
    }
}

async function loadUserDashboardStats(summary) {
    const el = id => document.getElementById(id);
    if (el('currentUsage'))  el('currentUsage').textContent  = (summary.avg_active_power_kw || 0) + ' kW';
    if (el('todayUsage'))    el('todayUsage').textContent    = (summary.total_kwh || 0) + ' kWh';
    if (el('estimatedCost')) el('estimatedCost').textContent = '₹' + (summary.estimated_cost || 0).toLocaleString();
    if (el('co2Saved'))      el('co2Saved').textContent      = (summary.co2_emissions_kg || 0) + ' kg';
    if (el('currentUsageChange'))  el('currentUsageChange').textContent  = 'Avg across ' + (summary.record_count || 0) + ' records';
    if (el('todayUsageChange'))    el('todayUsageChange').textContent    = summary.date_range ? summary.date_range.start + ' → ' + summary.date_range.end : '';
    if (el('estimatedCostChange')) el('estimatedCostChange').textContent = 'Based on tiered tariff';
    if (el('co2SavedChange'))      el('co2SavedChange').textContent      = '@ 0.82 kg CO₂/kWh (India CEA 2023)';

    loadAIInsights();
    loadDashboardDevices();

    try {
        const res  = await fetch(`${API_BASE}/analytics/submetering`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.hasData && window.distributionChart) {
            const cats = [
                { label: 'HVAC',     pct: data.hvac?.percentage     || 0, kwh: data.hvac?.kwh     || 0, color: '#FFD700' },
                { label: 'Kitchen',  pct: data.kitchen?.percentage  || 0, kwh: data.kitchen?.kwh  || 0, color: '#ff6b35' },
                { label: 'Laundry',  pct: data.laundry?.percentage  || 0, kwh: data.laundry?.kwh  || 0, color: '#4facfe' },
                { label: 'Lighting', pct: data.lighting?.percentage || 0, kwh: data.lighting?.kwh || 0, color: '#43e97b' },
                { label: 'Other',    pct: data.other?.percentage    || 0, kwh: data.other?.kwh    || 0, color: '#b8960c' }
            ].filter(c => c.kwh > 0);
            if (cats.length) {
                window.distributionChart.data.labels                      = cats.map(c => c.label);
                window.distributionChart.data.datasets[0].data            = cats.map(c => c.pct);
                window.distributionChart.data.datasets[0].backgroundColor = cats.map(c => c.color);
                window.distributionChart.update();
                const legend = document.getElementById('distributionLegend');
                if (legend) {
                    const note = data.estimated ? `<div style="grid-column:1/-1;font-size:0.72rem;color:#666;margin-top:0.25rem;">* Estimated from usage patterns</div>` : '';
                    legend.innerHTML = cats.map(c =>
                        `<div class="legend-item"><span class="legend-color" style="background:${c.color};border-radius:3px;"></span><span>${c.label} (${c.pct}%)</span></div>`
                    ).join('') + note;
                }
            }
        }
    } catch (e) {}
}

async function initializeRealtimeChart() {
    const ctx = document.getElementById('realtimeChart');
    if (!ctx) return;

    if (window.realtimeChart && typeof window.realtimeChart.destroy === 'function') {
        window.realtimeChart.destroy();
        window.realtimeChart = null;
    }

    let hourlyData = [];
    try {
        const res  = await fetch(`${API_BASE}/analytics/hourly`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.hasData && data.hourly?.length) hourlyData = data.hourly;
    } catch (e) {}

    const labels      = Array.from({ length: 24 }, (_, h) => h.toString().padStart(2,'0') + ':00');
    const chartData   = Array.from({ length: 24 }, (_, h) => {
        const e = hourlyData.find(d => d.hour === h);
        return e && e.avg_kw > 0 ? parseFloat(e.avg_kw.toFixed(3)) : 0;
    });

    const currentHour = new Date().getHours();
    const validVals   = chartData.filter(v => v > 0);
    const yMax        = validVals.length ? parseFloat((Math.max(...validVals) * 1.35).toFixed(2)) : 3;
    const pointColors = chartData.map((_, i) => i === currentHour ? '#ff6b35' : '#FFD700');
    const pointSizes  = chartData.map((_, i) => i === currentHour ? 7 : 3);

    window.realtimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Avg Power (kW)',
                data: chartData,
                borderColor: '#FFD700',
                backgroundColor: 'rgba(255,215,0,0.07)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointRadius: pointSizes,
                pointBackgroundColor: pointColors,
                spanGaps: true
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: { duration: 800 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1a1a1a', titleColor: '#aaa', bodyColor: '#fff',
                    borderColor: '#333', borderWidth: 1,
                    callbacks: { label: c => ` ${c.raw} kW${c.dataIndex === currentHour ? '  <- now' : ''}` }
                }
            },
            scales: {
                y: {
                    min: 0, max: yMax,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#aaa', maxTicksLimit: 5, callback: v => v.toFixed(1) + ' kW' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#aaa', maxTicksLimit: 24, callback: (val, i) => i % 3 === 0 ? labels[i] : '' }
                }
            }
        }
    });

    // Set explicit pixel size after creating
    ctx.style.width  = (ctx.parentElement.offsetWidth || 600) + 'px';
    ctx.style.height = '200px';
    window.realtimeChart.resize();
    setTimeout(() => { if (window.realtimeChart) window.realtimeChart.resize(); }, 500);
}

async function loadAdminStats() {
    const bar = document.getElementById('adminStatsBar');
    if (!bar) return;
    bar.style.display = 'block';
    try {
        const res  = await fetch(`${API_BASE}/auth/users`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            const users       = data.data.users || [];
            const total       = data.data.totalUsers || users.length;
            const withData    = users.filter(u => u.stats?.energyRecords > 0).length;
            const totalRecs   = users.reduce((s, u) => s + (u.stats?.energyRecords || 0), 0);
            const totalDevs   = users.reduce((s, u) => s + (u.stats?.devices || 0), 0);
            const el = id => document.getElementById(id);
            if (el('adminTotalUsers'))   el('adminTotalUsers').textContent   = total;
            if (el('adminActiveUsers'))  el('adminActiveUsers').textContent  = withData;
            if (el('adminTotalRecords')) el('adminTotalRecords').textContent = totalRecs.toLocaleString();
            if (el('adminTotalDevices')) el('adminTotalDevices').textContent = totalDevs;
        }
    } catch (e) { /* silent */ }
}

async function loadAIInsights() {
    const panel = document.getElementById('aiInsightsPanel');
    if (!panel) return;
    try {
        const res  = await fetch(`${API_BASE}/recommendations`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.hasData || !data.recommendations?.length) {
            panel.innerHTML = '<p style="color:#555;font-size:0.85rem;text-align:center;padding:1rem;">Upload energy data to get AI insights.</p>';
            return;
        }
        const iconMap  = { high: 'exclamation-triangle', medium: 'lightbulb', low: 'info-circle' };
        const colorMap = { high: '#ff6b35', medium: '#FFD700', low: '#b8960c' };
        panel.innerHTML = data.recommendations.slice(0, 3).map(r => `
            <div class="insight-item">
                <div class="insight-icon" style="background:${colorMap[r.priority] || '#FFD700'};">
                    <i class="fas fa-${r.icon || iconMap[r.priority] || 'lightbulb'}"></i>
                </div>
                <div class="insight-content">
                    <h4>${r.title}</h4>
                    <p>${r.description.slice(0, 80)}${r.description.length > 80 ? '…' : ''}</p>
                    ${r.potential_savings_inr ? `<span class="insight-time">Potential saving: ₹${r.potential_savings_inr}</span>` : ''}
                </div>
            </div>`).join('');
    } catch (e) {
        panel.innerHTML = '<p style="color:#555;font-size:0.85rem;text-align:center;padding:1rem;">Insights unavailable.</p>';
    }
}

async function loadDashboardDevices() {
    const list    = document.getElementById('dashboardDeviceList');
    const countEl = document.getElementById('activeDeviceCount');
    if (!list) return;
    try {
        const res  = await fetch(`${API_BASE}/devices`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success || !data.devices?.length) {
            list.innerHTML = '<p style="color:#555;font-size:0.85rem;text-align:center;">No devices found. <a href="devices.html" style="color:#FFD700;">Add devices</a></p>';
            if (countEl) countEl.textContent = '0 devices';
            return;
        }
        const active = data.devices.filter(d => d.status);
        if (countEl) countEl.textContent = `${active.length} of ${data.devices.length} online`;
        list.innerHTML = data.devices.slice(0, 5).map(d => `
            <div class="device-item">
                <div class="device-info">
                    <i class="fas fa-${d.icon || 'plug'} device-icon"></i>
                    <div><h4>${d.name}</h4><p>${d.location}</p></div>
                </div>
                <div class="device-status">
                    <span class="power-usage">${d.power_kw} kW</span>
                    <span style="font-size:0.75rem;padding:0.2rem 0.5rem;border-radius:1rem;background:${d.status ? 'rgba(67,233,123,0.15)' : 'rgba(255,68,68,0.15)'};color:${d.status ? '#43e97b' : '#ff4444'};">
                        ${d.status ? 'ON' : 'OFF'}
                    </span>
                </div>
            </div>`).join('');
    } catch (e) {
        list.innerHTML = '<p style="color:#555;font-size:0.85rem;text-align:center;">Devices unavailable.</p>';
    }
}

function initializeDistributionChart() {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;
    if (window.distributionChart && typeof window.distributionChart.destroy === 'function') {
        window.distributionChart.destroy();
        window.distributionChart = null;
    }
    window.distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['HVAC', 'Kitchen', 'Laundry', 'Lighting', 'Other'],
            datasets: [{
                data: [40, 25, 15, 12, 8],
                backgroundColor: ['#FFD700', '#ff6b35', '#4facfe', '#43e97b', '#888888'],
                borderWidth: 3, borderColor: '#111111', hoverOffset: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw}%` } } }
        }
    });
}

function startLiveUpdate() {
    liveUpdateInterval = setInterval(() => {
        if (isLiveUpdating) refreshRealtimeChart();
    }, 5 * 60 * 1000);
}

async function refreshRealtimeChart() {
    if (!window.realtimeChart) return;
    try {
        const res  = await fetch(`${API_BASE}/analytics/hourly`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.hasData || !data.hourly?.length) return;
        const chartData = Array.from({ length: 24 }, (_, h) => {
            const e = data.hourly.find(d => d.hour === h);
            return e && e.avg_kw > 0 ? e.avg_kw : 0;
        });
        window.realtimeChart.data.datasets[0].data = chartData;
        window.realtimeChart.update('none');
    } catch (e) {}
}

function updateCurrentUsage() {
    const el = document.getElementById('currentUsage');
    if (el && window.realtimeChart) {
        const vals = window.realtimeChart.data.datasets[0].data.filter(v => v > 0);
        if (vals.length) el.textContent = vals[vals.length - 1] + ' kW';
    }
}

function toggleLiveUpdate() {
    isLiveUpdating = !isLiveUpdating;
    const icon = document.getElementById('liveIcon');
    if (icon) { if (isLiveUpdating) icon.classList.add('fa-spin'); else icon.classList.remove('fa-spin'); }
}

const liveIcon = document.getElementById('liveIcon');
if (liveIcon) liveIcon.classList.add('fa-spin');

function logout() {
    sessionStorage.removeItem('energyai_user');
    localStorage.removeItem('energyai_user');
    sessionStorage.removeItem('energyai_token');
    localStorage.removeItem('energyai_token');
    sessionStorage.removeItem('energyai_hasData');
    window.location.href = 'index.html';
}

const session = sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user');
if (session) {
    const user = JSON.parse(session);
    const el = document.getElementById('userName');
    if (el) el.textContent = 'Welcome, ' + user.name;
    const isAdmin  = user.role === 'admin';
    const navUsers = document.getElementById('navUsers');
    if (navUsers) navUsers.style.display = isAdmin ? 'flex' : 'none';
}

function setupUploadForm() {
    const form = document.getElementById('uploadForm');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fileInput = document.getElementById('dataFile');
        const descInput = document.getElementById('fileDescription');
        const btn       = document.getElementById('uploadBtn');
        if (!fileInput.files.length) { showUploadMsg('Please select a file.', 'error'); return; }
        const ext = fileInput.files[0].name.split('.').pop().toLowerCase();
        if (!['csv','jpg','jpeg','png'].includes(ext)) { showUploadMsg('Only CSV, JPG and PNG files are allowed.', 'error'); return; }
        const formData = new FormData();
        formData.append('dataFile', fileInput.files[0]);
        if (descInput?.value.trim()) formData.append('description', descInput.value.trim());
        btn.disabled  = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
        try {
            const res  = await fetch(`${API_BASE}/uploads`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: formData });
            const data = await res.json();
            if (data.success) {
                if (data.importedCount) {
                    showUploadMsg('✓ ' + data.importedCount + ' energy records imported! Refreshing...', 'success');
                    sessionStorage.setItem('energyai_hasData', 'true');
                    const u = JSON.parse(sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user') || '{}');
                    if (u?.email) localStorage.setItem('energyai_hasData_' + btoa(u.email), 'true');
                    fileInput.value = '';
                    if (descInput) descInput.value = '';
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showUploadMsg('File uploaded successfully!', 'success');
                    fileInput.value = '';
                    loadUserUploads();
                }
            } else { showUploadMsg(data.message || 'Upload failed.', 'error'); }
        } catch (err) { showUploadMsg('Backend not running.', 'error'); }
        finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> Upload'; }
    });
}

function showUploadMsg(text, type) {
    const msg = document.getElementById('uploadMsg');
    if (!msg) return;
    msg.textContent = text;
    msg.style.display = 'block';
    if (type === 'error') { msg.style.background='rgba(255,107,53,0.15)'; msg.style.border='1px solid rgba(255,107,53,0.4)'; msg.style.color='#ff6b35'; }
    else { msg.style.background='rgba(67,233,123,0.15)'; msg.style.border='1px solid rgba(67,233,123,0.4)'; msg.style.color='#43e97b'; }
    setTimeout(() => { msg.style.display = 'none'; }, 5000);
}

async function loadUserUploads() {
    const container = document.getElementById('uploadItems');
    if (!container) return;
    try {
        const res  = await fetch(`${API_BASE}/uploads`, { headers: { 'Authorization': 'Bearer ' + getToken() } });
        if (!res.ok) { container.innerHTML = '<p style="color:#666;font-size:0.85rem;">Connect backend to view uploads.</p>'; return; }
        const data = await res.json();
        if (!data.success || !data.uploads?.length) { container.innerHTML = '<p style="color:#666;font-size:0.85rem;">No uploads yet.</p>'; return; }
        container.innerHTML = data.uploads.map(u => {
            const icon = u.fileType?.startsWith('image/') ? 'fa-file-image' : 'fa-file-csv';
            return `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0.75rem;background:#1a1a1a;border-radius:0.5rem;border:1px solid #2a2a2a;">
                <i class="fas ${icon}" style="color:#FFD700;"></i>
                <div style="flex:1;font-size:0.85rem;">${u.originalName} — ${(u.fileSize/1024).toFixed(1)} KB</div>
            </div>`;
        }).join('');
    } catch (e) { if (container) container.innerHTML = '<p style="color:#666;font-size:0.85rem;">No uploads yet.</p>'; }
}

async function deleteUpload(id) {
    if (!confirm('Delete this file?')) return;
    try {
        const res = await fetch(`${API_BASE}/uploads/${id}`, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + getToken() } });
        if (res.ok) { showUploadMsg('File deleted.', 'success'); loadUserUploads(); }
    } catch (e) { showUploadMsg('Backend not available.', 'error'); }
}

function setupJpgUploadForm() {
    const form = document.getElementById('jpgUploadForm');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fileInput = document.getElementById('jpgFileInput');
        const descInput = document.getElementById('jpgDescription');
        const btn = document.getElementById('jpgUploadBtn');
        const msg = document.getElementById('jpgUploadMsg');
        if (!fileInput.files.length) return;
        const formData = new FormData();
        formData.append('dataFile', fileInput.files[0]);
        if (descInput?.value.trim()) formData.append('description', descInput.value.trim());
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing OCR...';
        if (msg) msg.style.display = 'none';
        try {
            const res  = await fetch(`${API_BASE}/uploads/ocr`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: formData });
            const data = await res.json();
            if (msg) msg.style.display = 'block';
            if (data.success) {
                const ocr = data.ocr || {};
                let detail = '';
                if (ocr.units != null) detail += ` Units: ${ocr.units} kWh.`;
                if (ocr.cost  != null) detail += ` Cost: ₹${ocr.cost}.`;
                if (ocr.date  != null) detail += ` Date: ${ocr.date}.`;
                const saved = data.energy_record_created ? ' Record saved.' : '';
                msg.style.background='rgba(67,233,123,0.15)'; msg.style.border='1px solid rgba(67,233,123,0.4)'; msg.style.color='#43e97b';
                msg.textContent = (detail || 'Bill image processed.') + saved;
                fileInput.value = ''; if (descInput) descInput.value = '';
                if (data.energy_record_created) setTimeout(() => checkUserDataAndShowDashboard(), 1500);
            } else {
                msg.style.background='rgba(255,107,53,0.15)'; msg.style.border='1px solid rgba(255,107,53,0.4)'; msg.style.color='#ff6b35';
                msg.textContent = data.message || 'OCR failed.';
                if (data.install_hint) msg.textContent += ' ' + data.install_hint;
            }
        } catch (err) {
            if (msg) { msg.style.display='block'; msg.style.background='rgba(255,107,53,0.15)'; msg.style.border='1px solid rgba(255,107,53,0.4)'; msg.style.color='#ff6b35'; msg.textContent='Server error.'; }
        } finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-upload"></i> Upload & Extract'; }
    });
}

function setupNoDataUploadForm() {
    const form = document.getElementById('noDataUploadForm');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fileInput = document.getElementById('noDataFile');
        const btn = document.getElementById('noDataUploadBtn');
        const msg = document.getElementById('noDataUploadMsg');
        if (!fileInput.files.length) return;
        const formData = new FormData();
        formData.append('dataFile', fileInput.files[0]);
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
        if (msg) msg.style.display = 'none';
        try {
            const res  = await fetch(`${API_BASE}/uploads`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: formData });
            const data = await res.json();
            if (data.success && data.importedCount) {
                if (msg) { msg.style.display='block'; msg.style.background='rgba(255,215,0,0.1)'; msg.style.border='1px solid rgba(255,215,0,0.3)'; msg.style.color='#FFD700'; msg.textContent='✓ ' + data.importedCount + ' records imported! Loading dashboard...'; }
                sessionStorage.setItem('energyai_hasData', 'true');
                const u = JSON.parse(sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user') || '{}');
                if (u?.email) localStorage.setItem('energyai_hasData_' + btoa(u.email), 'true');
                setTimeout(() => window.location.reload(), 1500);
            } else {
                if (msg) { msg.style.display='block'; msg.style.background='rgba(255,107,53,0.1)'; msg.style.border='1px solid rgba(255,107,53,0.3)'; msg.style.color='#ff6b35'; msg.textContent = data.message || 'Upload failed.'; }
                btn.disabled=false; btn.innerHTML='<i class="fas fa-upload"></i> Upload CSV';
            }
        } catch (err) {
            if (msg) { msg.style.display='block'; msg.style.background='rgba(255,107,53,0.1)'; msg.style.border='1px solid rgba(255,107,53,0.3)'; msg.style.color='#ff6b35'; msg.textContent='Backend not running.'; }
            btn.disabled=false; btn.innerHTML='<i class="fas fa-upload"></i> Upload CSV';
        }
    });
}

function switchUploadTab(tab) {
    const csvPanel = document.getElementById('panelCsv');
    const ocrPanel = document.getElementById('panelOcr');
    const tabCsv   = document.getElementById('tabCsv');
    const tabOcr   = document.getElementById('tabOcr');
    const active   = 'background:linear-gradient(135deg,#FFD700,#b8960c);color:#000;border:none;border-radius:0.4rem;font-size:0.88rem;font-weight:bold;cursor:pointer;flex:1;padding:0.55rem;';
    const inactive = 'background:transparent;color:#aaa;border:none;border-radius:0.4rem;font-size:0.88rem;font-weight:bold;cursor:pointer;flex:1;padding:0.55rem;';
    if (tab === 'csv') {
        if (csvPanel) csvPanel.style.display='block'; if (ocrPanel) ocrPanel.style.display='none';
        if (tabCsv) tabCsv.style.cssText=active; if (tabOcr) tabOcr.style.cssText=inactive;
    } else {
        if (csvPanel) csvPanel.style.display='none'; if (ocrPanel) ocrPanel.style.display='block';
        if (tabCsv) tabCsv.style.cssText=inactive; if (tabOcr) tabOcr.style.cssText=active;
    }
}

function previewOcrImage(input) {
    const preview = document.getElementById('ocrPreview');
    const previewImg = document.getElementById('ocrPreviewImg');
    const previewName = document.getElementById('ocrPreviewName');
    const dropZone = document.getElementById('ocrDropZone');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = e => {
            if (previewImg) previewImg.src = e.target.result;
            if (previewName) previewName.textContent = file.name + ' (' + (file.size/1024).toFixed(1) + ' KB)';
            if (preview) preview.style.display = 'block';
            if (dropZone) dropZone.style.borderColor = '#FFD700';
        };
        reader.readAsDataURL(file);
    }
}

function handleOcrDrop(event) {
    event.preventDefault();
    const dropZone = document.getElementById('ocrDropZone');
    if (dropZone) dropZone.style.borderColor = '#2a2a2a';
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const allowed = ['image/jpeg','image/png','image/bmp','image/tiff','image/webp'];
    if (!allowed.includes(file.type)) { showOcrError('Only JPG, PNG, BMP, TIFF images are supported.'); return; }
    const input = document.getElementById('ocrFileInput');
    const dt = new DataTransfer();
    dt.items.add(file);
    if (input) { input.files = dt.files; previewOcrImage(input); }
}

document.addEventListener('DOMContentLoaded', function () {
    const ocrForm = document.getElementById('ocrUploadForm');
    if (!ocrForm) return;
    ocrForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fileInput = document.getElementById('ocrFileInput');
        const btn       = document.getElementById('ocrSubmitBtn');
        const resultDiv = document.getElementById('ocrResult');
        const errorDiv  = document.getElementById('ocrError');
        if (!fileInput || !fileInput.files.length) { showOcrError('Please select a bill image first.'); return; }
        if (resultDiv) resultDiv.style.display = 'none';
        if (errorDiv)  errorDiv.style.display  = 'none';
        if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Scanning bill...'; }
        try {
            const formData = new FormData();
            formData.append('dataFile', fileInput.files[0]);
            const res  = await fetch(`${API_BASE}/uploads/ocr`, { method:'POST', headers:{'Authorization':'Bearer '+getToken()}, body:formData });
            const data = await res.json();
            if (data.success && data.ocr) { displayOcrResult(data.ocr, data.energy_record_created); }
            else {
                showOcrError(data.message || 'OCR failed. Make sure Tesseract is installed and the ML service is running.');
                if (data.install_hint) {
                    const hint = document.createElement('div');
                    hint.style.cssText = 'margin-top:0.5rem;font-size:0.78rem;color:#aaa;';
                    hint.innerHTML = '<i class="fas fa-info-circle"></i> ' + data.install_hint;
                    if (errorDiv) errorDiv.appendChild(hint);
                }
            }
        } catch (err) { showOcrError('Could not connect to backend.'); }
        finally { if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-magic"></i> Extract Bill Data with OCR'; } }
    });
});

function displayOcrResult(ocr, alreadySaved) {
    const resultDiv = document.getElementById('ocrResult');
    const el = id => document.getElementById(id);
    if (el('ocrUnits')) el('ocrUnits').textContent = ocr.units != null ? ocr.units : '—';
    if (el('ocrCost'))  el('ocrCost').textContent  = ocr.cost  != null ? '₹' + ocr.cost : '—';
    if (el('ocrDate'))  el('ocrDate').textContent  = ocr.date  || '—';
    const badge = el('ocrConfidenceBadge');
    if (badge) {
        const conf = ocr.confidence || 'low';
        const colors = { high: '#43e97b', medium: '#FFD700', low: '#ff6b35' };
        badge.textContent = conf.charAt(0).toUpperCase() + conf.slice(1) + ' confidence';
        badge.style.background = (colors[conf] || '#888') + '33';
        badge.style.color = colors[conf] || '#888';
    }
    const saveBtn = el('ocrSaveBtn');
    const saveMsg = el('ocrSaveMsg');
    if (saveBtn) {
        if (alreadySaved) {
            saveBtn.style.display = 'none';
            if (saveMsg) { saveMsg.style.display='block'; saveMsg.style.color='#43e97b'; saveMsg.textContent='✓ Data saved to your energy records automatically.'; }
        } else if (ocr.units != null && ocr.date) {
            saveBtn.style.display='block'; saveBtn.dataset.units=ocr.units; saveBtn.dataset.date=ocr.date;
            if (saveMsg) saveMsg.style.display='none';
        } else {
            saveBtn.style.display='none';
            if (saveMsg && ocr.units == null) { saveMsg.style.display='block'; saveMsg.style.color='#aaa'; saveMsg.textContent='Could not auto-extract. Try a clearer photo.'; }
        }
    }
    if (resultDiv) resultDiv.style.display = 'block';
}

async function saveOcrToData() {
    const btn = document.getElementById('ocrSaveBtn');
    const saveMsg = document.getElementById('ocrSaveMsg');
    if (!btn) return;
    const units = parseFloat(btn.dataset.units);
    const date  = btn.dataset.date;
    if (!units || !date) return;
    btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Saving...';
    try {
        const res  = await fetch(`${API_BASE}/energy/records`, { method:'POST', headers:{...getAuthHeaders(true),'Authorization':'Bearer '+getToken()}, body:JSON.stringify({date, energyConsumed:units, device:'Bill Image (OCR)'}) });
        const data = await res.json();
        if (data.success) {
            btn.style.display='none';
            if (saveMsg) { saveMsg.style.display='block'; saveMsg.style.color='#43e97b'; saveMsg.textContent='✓ Saved! Refreshing...'; }
            sessionStorage.setItem('energyai_hasData','true');
            const user = JSON.parse(sessionStorage.getItem('energyai_user')||localStorage.getItem('energyai_user')||'{}');
            if (user?.email) localStorage.setItem('energyai_hasData_'+btoa(user.email),'true');
            setTimeout(() => checkUserDataAndShowDashboard(), 1500);
        } else {
            btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Save to My Energy Data';
            if (saveMsg) { saveMsg.style.display='block'; saveMsg.style.color='#ff6b35'; saveMsg.textContent=data.message||'Save failed.'; }
        }
    } catch (err) { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Save to My Energy Data'; }
}

function showOcrError(msg) {
    const errorDiv = document.getElementById('ocrError');
    if (errorDiv) { errorDiv.style.display='block'; errorDiv.innerHTML='<i class="fas fa-exclamation-circle"></i> '+msg; }
}
