// Real-time data simulation
let liveUpdateInterval;
let isLiveUpdating = true;

document.addEventListener('DOMContentLoaded', function () {
    initializeRealtimeChart();
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
        if (noDataContent)    noDataContent.style.display    = 'flex';
        if (dashboardContent) dashboardContent.style.display = 'none';
        if (uploadSection)    uploadSection.style.display    = 'block';
        return;
    }

    // Check session for cached hasData flag to avoid flicker on reload
    const session = sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user');
    const user = session ? JSON.parse(session) : null;
    const isAdmin = user && (user.role === 'admin' || user.email === 'admin@energyai.com');

    // Admins never see the upload/noData prompt
    if (isAdmin) {
        if (noDataContent)    noDataContent.style.display    = 'none';
        if (dashboardContent) dashboardContent.style.display = 'block';
        if (uploadSection)    uploadSection.style.display    = 'none';
        initializeDistributionChart();
        loadUserUploads();
        return;
    }

    // Show dashboard immediately if we previously cached that this user has data
    const userKey = user?.email ? 'energyai_hasData_' + btoa(user.email) : null;
    const cachedHasData = sessionStorage.getItem('energyai_hasData') === 'true'
                       || (userKey ? localStorage.getItem(userKey) === 'true' : false);

    if (cachedHasData) {
        if (noDataContent)    noDataContent.style.display    = 'none';
        if (dashboardContent) dashboardContent.style.display = 'block';
        if (uploadSection)    uploadSection.style.display    = 'none';
        initializeDistributionChart();
        loadUserUploads();
    }

    try {
        const res  = await fetch(`${API_BASE}/energy/summary`, { headers: getAuthHeaders() });
        const data = await res.json();

        if (data.hasData) {
            // Cache the result so next page load is instant
            sessionStorage.setItem('energyai_hasData', 'true');
            if (userKey) localStorage.setItem(userKey, 'true');
            if (noDataContent)    noDataContent.style.display    = 'none';
            if (dashboardContent) dashboardContent.style.display = 'block';
            if (uploadSection)    uploadSection.style.display    = 'none';
            if (!cachedHasData) initializeDistributionChart();
            loadUserDashboardStats(data);
            loadUserUploads();
        } else {
            // User genuinely has no data
            sessionStorage.removeItem('energyai_hasData');
            if (userKey) localStorage.removeItem(userKey);
            if (noDataContent)    noDataContent.style.display    = 'flex';
            if (dashboardContent) dashboardContent.style.display = 'none';
            if (uploadSection)    uploadSection.style.display    = 'block';
        }
    } catch (e) {
        // Backend unreachable — if we already showed dashboard from cache, keep it
        // Otherwise fall back to upload prompt only if no cached state
        if (!cachedHasData) {
            if (noDataContent)    noDataContent.style.display    = 'flex';
            if (dashboardContent) dashboardContent.style.display = 'none';
            if (uploadSection)    uploadSection.style.display    = 'block';
        }
    }
}

async function loadUserDashboardStats(summary) {
    const el = id => document.getElementById(id);
    if (el('currentUsage'))  el('currentUsage').textContent  = (summary.avg_active_power_kw || 0) + ' kW';
    if (el('todayUsage'))    el('todayUsage').textContent    = (summary.total_kwh || 0) + ' kWh';
    if (el('estimatedCost')) el('estimatedCost').textContent = '₹' + (summary.estimated_cost || 0).toLocaleString();
    if (el('co2Saved'))      el('co2Saved').textContent      = (summary.co2_emissions_kg || 0) + ' kg';

    // Load categorised submetering — donut slices by actual usage %
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
                    const note = data.estimated
                        ? `<div style="grid-column:1/-1;font-size:0.72rem;color:#666;margin-top:0.25rem;">* Estimated from usage patterns</div>`
                        : '';
                    legend.innerHTML = cats.map(c =>
                        `<div class="legend-item">
                            <span class="legend-color" style="background:${c.color};border-radius:3px;"></span>
                            <span>${c.label} (${c.pct}%)</span>
                        </div>`
                    ).join('') + note;
                }
            }
        }
    } catch (e) { /* chart keeps defaults */ }
}

async function initializeRealtimeChart() {
    const ctx = document.getElementById('realtimeChart');
    if (!ctx) return;

    let baseValue = 2.0;
    const token = getToken();
    if (token) {
        try {
            const res  = await fetch(`${API_BASE}/energy/hourly`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.hasData && data.hourly?.length) {
                const currentHour = new Date().getHours();
                const entry = data.hourly.find(h => h.hour === currentHour);
                if (entry && entry.avg_kw > 0) baseValue = entry.avg_kw;
            }
        } catch (e) { /* use default */ }
    }

    const labels = generateTimeLabels(20);
    const chartData = generateRealtimeData(20, baseValue);
    const yMin = parseFloat((baseValue * 0.5).toFixed(2));
    const yMax = parseFloat((baseValue * 1.6).toFixed(2));

    window.realtimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Power (kW)',
                data: chartData,
                borderColor: '#FFD700',
                backgroundColor: 'rgba(255,215,0,0.08)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    min: yMin, max: yMax,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#aaaaaa', maxTicksLimit: 4, callback: v => v.toFixed(1) + ' kW' }
                },
                x: { grid: { display: false }, ticks: { color: '#aaaaaa', maxTicksLimit: 5 } }
            }
        }
    });
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
                borderWidth: 3,
                borderColor: '#111111',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => ` ${c.label}: ${c.raw}%`
                    }
                }
            }
        }
    });
}

function generateTimeLabels(count) {
    const labels = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
        const time = new Date(now - i * 60000);
        labels.push(time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    }
    return labels;
}

function generateRealtimeData(count, baseValue = 2.0) {
    const data = [];
    let val = baseValue;
    for (let i = 0; i < count; i++) {
        val += (Math.random() - 0.5) * 0.3;
        val = Math.max(baseValue * 0.6, Math.min(baseValue * 1.4, val));
        data.push(parseFloat(val.toFixed(2)));
    }
    return data;
}

function startLiveUpdate() {
    liveUpdateInterval = setInterval(() => {
        if (isLiveUpdating && window.realtimeChart) {
            updateRealtimeChart();
            updateCurrentUsage();
        }
    }, 8000);
}

function updateRealtimeChart() {
    const chart = window.realtimeChart;
    if (!chart) return;
    const now = new Date();
    const newLabel = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const data = chart.data.datasets[0].data;
    const lastVal = parseFloat(data[data.length - 1]);
    const newVal = parseFloat((lastVal + (Math.random() - 0.5) * 0.25).toFixed(2));
    const yMin = chart.options.scales.y.min;
    const yMax = chart.options.scales.y.max;
    data.push(Math.max(yMin, Math.min(yMax, newVal)));
    chart.data.labels.push(newLabel);
    if (data.length > 20) { data.shift(); chart.data.labels.shift(); }
    chart.update('none');
}

function updateCurrentUsage() {
    const usageElement = document.getElementById('currentUsage');
    if (usageElement && window.realtimeChart) {
        const data = window.realtimeChart.data.datasets[0].data;
        usageElement.textContent = data[data.length - 1] + ' kW';
    }
}

function toggleLiveUpdate() {
    isLiveUpdating = !isLiveUpdating;
    const icon = document.getElementById('liveIcon');
    if (icon) {
        if (isLiveUpdating) icon.classList.add('fa-spin');
        else icon.classList.remove('fa-spin');
    }
}

document.querySelectorAll('.toggle-switch input').forEach(toggle => {
    toggle.addEventListener('change', function () { /* device toggle */ });
});

const liveIcon = document.getElementById('liveIcon');
if (liveIcon) liveIcon.classList.add('fa-spin');

function logout() {
    const session = sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user');
    const user = session ? JSON.parse(session) : null;
    sessionStorage.removeItem('energyai_user');
    localStorage.removeItem('energyai_user');
    sessionStorage.removeItem('energyai_token');
    localStorage.removeItem('energyai_token');
    sessionStorage.removeItem('energyai_hasData');
    // NOTE: intentionally keep energyai_hasData_<email> in localStorage
    // so when the same user logs back in, they don't see the upload prompt
    window.location.href = 'index.html';
}

const session = sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user');
if (session) {
    const user = JSON.parse(session);
    const el = document.getElementById('userName');
    if (el) el.textContent = 'Welcome, ' + user.name;

    const isAdmin = user.role === 'admin' || user.email === 'admin@energyai.com';
    const navUsers = document.getElementById('navUsers');
    if (navUsers) navUsers.style.display = isAdmin ? 'flex' : 'none';

    const uploadSection = document.getElementById('dataUploadSection');
    if (uploadSection && isAdmin) uploadSection.style.display = 'none';
}

function setupUploadForm() {
    const form = document.getElementById('uploadForm');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fileInput = document.getElementById('dataFile');
        const descInput = document.getElementById('fileDescription');
        const btn = document.getElementById('uploadBtn');
        if (!fileInput.files.length) { showUploadMsg('Please select a file.', 'error'); return; }
        const ext = fileInput.files[0].name.split('.').pop().toLowerCase();
        if (!['csv', 'jpg', 'jpeg', 'png'].includes(ext)) {
            showUploadMsg('Only CSV, JPG and PNG files are allowed.', 'error'); return;
        }
        const formData = new FormData();
        formData.append('dataFile', fileInput.files[0]);
        if (descInput?.value.trim()) formData.append('description', descInput.value.trim());
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
        try {
            const res  = await fetch(`${API_BASE}/uploads`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: formData });
            const data = await res.json();
            if (data.success) {
                if (data.importedCount) {
                    showUploadMsg('✓ ' + data.importedCount + ' energy records imported! Refreshing dashboard...', 'success');
                    sessionStorage.setItem('energyai_hasData', 'true');
                    const _uploadUser = JSON.parse(sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user') || '{}');
                    if (_uploadUser?.email) localStorage.setItem('energyai_hasData_' + btoa(_uploadUser.email), 'true');
                    fileInput.value = '';
                    if (descInput) descInput.value = '';
                    // Full reload after 1.5s so all charts pick up new data
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showUploadMsg('File uploaded successfully!', 'success');
                    fileInput.value = '';
                    loadUserUploads();
                }
            } else {
                showUploadMsg(data.message || 'Upload failed.', 'error');
            }
        } catch (err) {
            showUploadMsg('Backend not running. Start the backend to upload data.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-upload"></i> Upload';
        }
    });
}

function showUploadMsg(text, type) {
    const msg = document.getElementById('uploadMsg');
    if (!msg) return;
    msg.textContent = text;
    msg.style.display = 'block';
    if (type === 'error') {
        msg.style.background = 'rgba(255, 107, 53, 0.15)';
        msg.style.border = '1px solid rgba(255, 107, 53, 0.4)';
        msg.style.color = '#ff6b35';
    } else {
        msg.style.background = 'rgba(67, 233, 123, 0.15)';
        msg.style.border = '1px solid rgba(67, 233, 123, 0.4)';
        msg.style.color = '#43e97b';
    }
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
                <div style="flex:1;font-size:0.85rem;">${u.originalName} — ${(u.fileSize / 1024).toFixed(1)} KB</div>
            </div>`;
        }).join('');
    } catch (e) {
        if (container) container.innerHTML = '<p style="color:#666;font-size:0.85rem;">No uploads yet.</p>';
    }
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
            // Use OCR endpoint for image uploads
            const res  = await fetch(`${API_BASE}/uploads/ocr`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getToken() },
                body: formData
            });
            const data = await res.json();
            if (msg) msg.style.display = 'block';
            if (data.success) {
                const ocr = data.ocr || {};
                let detail = '';
                if (ocr.units != null) detail += ` Units: ${ocr.units} kWh.`;
                if (ocr.cost  != null) detail += ` Cost: ₹${ocr.cost}.`;
                if (ocr.date  != null) detail += ` Date: ${ocr.date}.`;
                const saved = data.energy_record_created ? ' Record saved to your data.' : '';
                msg.style.background = 'rgba(67, 233, 123, 0.15)';
                msg.style.border = '1px solid rgba(67, 233, 123, 0.4)';
                msg.style.color = '#43e97b';
                msg.textContent = (detail || 'Bill image processed.') + saved;
                fileInput.value = '';
                if (descInput) descInput.value = '';
                if (data.energy_record_created) {
                    setTimeout(() => checkUserDataAndShowDashboard(), 1500);
                }
            } else {
                msg.style.background = 'rgba(255, 107, 53, 0.15)';
                msg.style.border = '1px solid rgba(255, 107, 53, 0.4)';
                msg.style.color = '#ff6b35';
                msg.textContent = data.message || 'OCR failed.';
                if (data.install_hint) msg.textContent += ' ' + data.install_hint;
            }
        } catch (err) {
            if (msg) {
                msg.style.display = 'block';
                msg.style.background = 'rgba(255, 107, 53, 0.15)';
                msg.style.border = '1px solid rgba(255, 107, 53, 0.4)';
                msg.style.color = '#ff6b35';
                msg.textContent = 'Server error. Please try again.';
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-upload"></i> Upload & Extract';
        }
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
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
        if (msg) msg.style.display = 'none';
        try {
            const res  = await fetch(`${API_BASE}/uploads`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: formData });
            const data = await res.json();
            if (data.success && data.importedCount) {
                if (msg) {
                    msg.style.display = 'block';
                    msg.style.background = 'rgba(255,215,0,0.1)';
                    msg.style.border = '1px solid rgba(255,215,0,0.3)';
                    msg.style.color = '#FFD700';
                    msg.textContent = '✓ ' + data.importedCount + ' records imported! Loading dashboard...';
                }
                sessionStorage.setItem('energyai_hasData', 'true');
                const _u = JSON.parse(sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user') || '{}');
                if (_u?.email) localStorage.setItem('energyai_hasData_' + btoa(_u.email), 'true');
                setTimeout(() => window.location.reload(), 1500);
            } else {
                if (msg) {
                    msg.style.display = 'block';
                    msg.style.background = 'rgba(255,107,53,0.1)';
                    msg.style.border = '1px solid rgba(255,107,53,0.3)';
                    msg.style.color = '#ff6b35';
                    msg.textContent = data.message || 'Upload failed. Check CSV format.';
                }
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-upload"></i> Upload CSV';
            }
        } catch (err) {
            if (msg) {
                msg.style.display = 'block';
                msg.style.background = 'rgba(255,107,53,0.1)';
                msg.style.border = '1px solid rgba(255,107,53,0.3)';
                msg.style.color = '#ff6b35';
                msg.textContent = 'Backend not running. Start the backend first.';
            }
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-upload"></i> Upload CSV';
        }
    });
}

// ── Upload tab switcher ───────────────────────────────────────────────
function switchUploadTab(tab) {
    const csvPanel = document.getElementById('panelCsv');
    const ocrPanel = document.getElementById('panelOcr');
    const tabCsv   = document.getElementById('tabCsv');
    const tabOcr   = document.getElementById('tabOcr');
    const active   = 'background:linear-gradient(135deg,#FFD700,#b8960c);color:#000;border:none;border-radius:0.4rem;font-size:0.88rem;font-weight:bold;cursor:pointer;flex:1;padding:0.55rem;';
    const inactive = 'background:transparent;color:#aaa;border:none;border-radius:0.4rem;font-size:0.88rem;font-weight:bold;cursor:pointer;flex:1;padding:0.55rem;';

    if (tab === 'csv') {
        if (csvPanel) csvPanel.style.display = 'block';
        if (ocrPanel) ocrPanel.style.display = 'none';
        if (tabCsv)   tabCsv.style.cssText   = active;
        if (tabOcr)   tabOcr.style.cssText   = inactive;
    } else {
        if (csvPanel) csvPanel.style.display = 'none';
        if (ocrPanel) ocrPanel.style.display = 'block';
        if (tabCsv)   tabCsv.style.cssText   = inactive;
        if (tabOcr)   tabOcr.style.cssText   = active;
    }
}

// ── OCR: image preview ────────────────────────────────────────────────
function previewOcrImage(input) {
    const preview    = document.getElementById('ocrPreview');
    const previewImg = document.getElementById('ocrPreviewImg');
    const previewName = document.getElementById('ocrPreviewName');
    const dropZone   = document.getElementById('ocrDropZone');

    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = e => {
            if (previewImg)  previewImg.src = e.target.result;
            if (previewName) previewName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
            if (preview)     preview.style.display = 'block';
            if (dropZone)    dropZone.style.borderColor = '#FFD700';
        };
        reader.readAsDataURL(file);
    }
}

// ── OCR: drag & drop ──────────────────────────────────────────────────
function handleOcrDrop(event) {
    event.preventDefault();
    const dropZone = document.getElementById('ocrDropZone');
    if (dropZone) dropZone.style.borderColor = '#2a2a2a';

    const file = event.dataTransfer.files[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff', 'image/webp'];
    if (!allowed.includes(file.type)) {
        showOcrError('Only JPG, PNG, BMP, TIFF images are supported.');
        return;
    }

    // Assign to file input
    const input = document.getElementById('ocrFileInput');
    const dt = new DataTransfer();
    dt.items.add(file);
    if (input) {
        input.files = dt.files;
        previewOcrImage(input);
    }
}

// ── OCR: form submit ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    const ocrForm = document.getElementById('ocrUploadForm');
    if (!ocrForm) return;

    ocrForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fileInput = document.getElementById('ocrFileInput');
        const btn       = document.getElementById('ocrSubmitBtn');
        const resultDiv = document.getElementById('ocrResult');
        const errorDiv  = document.getElementById('ocrError');

        if (!fileInput || !fileInput.files.length) {
            showOcrError('Please select a bill image first.');
            return;
        }

        // Reset UI
        if (resultDiv) resultDiv.style.display = 'none';
        if (errorDiv)  errorDiv.style.display  = 'none';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning bill...';
        }

        try {
            const formData = new FormData();
            formData.append('dataFile', fileInput.files[0]);

            const res  = await fetch(`${API_BASE}/uploads/ocr`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getToken() },
                body: formData
            });
            const data = await res.json();

            if (data.success && data.ocr) {
                displayOcrResult(data.ocr, data.energy_record_created);
            } else {
                showOcrError(data.message || 'OCR failed. Make sure Tesseract is installed and the ML service is running.');
                if (data.install_hint) {
                    const hint = document.createElement('div');
                    hint.style.cssText = 'margin-top:0.5rem;font-size:0.78rem;color:#aaa;';
                    hint.innerHTML = '<i class="fas fa-info-circle"></i> ' + data.install_hint;
                    if (errorDiv) errorDiv.appendChild(hint);
                }
            }
        } catch (err) {
            showOcrError('Could not connect to backend. Make sure the server is running.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-magic"></i> Extract Bill Data with OCR';
            }
        }
    });
});

function displayOcrResult(ocr, alreadySaved) {
    const resultDiv = document.getElementById('ocrResult');
    const el = id => document.getElementById(id);

    if (el('ocrUnits')) el('ocrUnits').textContent = ocr.units != null ? ocr.units : '—';
    if (el('ocrCost'))  el('ocrCost').textContent  = ocr.cost  != null ? '₹' + ocr.cost : '—';
    if (el('ocrDate'))  el('ocrDate').textContent  = ocr.date  || '—';

    // Confidence badge
    const badge = el('ocrConfidenceBadge');
    if (badge) {
        const conf = ocr.confidence || 'low';
        const colors = { high: '#43e97b', medium: '#FFD700', low: '#ff6b35' };
        badge.textContent = conf.charAt(0).toUpperCase() + conf.slice(1) + ' confidence';
        badge.style.background = (colors[conf] || '#888') + '33';
        badge.style.color      = colors[conf] || '#888';
    }

    // Show raw text if fields couldn't be extracted
    let rawSection = el('ocrRawText');
    if (!rawSection) {
        rawSection = document.createElement('div');
        rawSection.id = 'ocrRawText';
        rawSection.style.cssText = 'margin-top:0.75rem;padding:0.75rem;background:#111;border:1px solid #2a2a2a;border-radius:0.5rem;font-size:0.75rem;color:#666;max-height:100px;overflow-y:auto;white-space:pre-wrap;display:none;';
        if (resultDiv) resultDiv.appendChild(rawSection);
    }
    if (ocr.raw_text && (ocr.units == null || ocr.cost == null)) {
        rawSection.style.display = 'block';
        rawSection.innerHTML = '<span style="color:#aaa;font-size:0.72rem;">Raw OCR text:</span>\n' + ocr.raw_text.substring(0, 400);
    } else {
        rawSection.style.display = 'none';
    }

    // Save button
    const saveBtn = el('ocrSaveBtn');
    const saveMsg = el('ocrSaveMsg');
    if (saveBtn) {
        if (alreadySaved) {
            saveBtn.style.display = 'none';
            if (saveMsg) {
                saveMsg.style.display = 'block';
                saveMsg.style.color   = '#43e97b';
                saveMsg.textContent   = '✓ Data saved to your energy records automatically.';
            }
        } else if (ocr.units != null && ocr.date) {
            saveBtn.style.display = 'block';
            saveBtn.dataset.units = ocr.units;
            saveBtn.dataset.date  = ocr.date;
            if (saveMsg) saveMsg.style.display = 'none';
        } else {
            saveBtn.style.display = 'none';
            // Show manual entry hint if OCR couldn't extract
            if (saveMsg && ocr.units == null) {
                saveMsg.style.display = 'block';
                saveMsg.style.color   = '#aaa';
                saveMsg.textContent   = 'Could not auto-extract data. Try a clearer, well-lit photo of the bill.';
            }
        }
    }

    if (resultDiv) resultDiv.style.display = 'block';
}

async function saveOcrToData() {
    const btn     = document.getElementById('ocrSaveBtn');
    const saveMsg = document.getElementById('ocrSaveMsg');
    if (!btn) return;

    const units = parseFloat(btn.dataset.units);
    const date  = btn.dataset.date;
    if (!units || !date) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        const res  = await fetch(`${API_BASE}/energy/records`, {
            method: 'POST',
            headers: { ...getAuthHeaders(true), 'Authorization': 'Bearer ' + getToken() },
            body: JSON.stringify({ date, energyConsumed: units, device: 'Bill Image (OCR)' })
        });
        const data = await res.json();

        if (data.success) {
            btn.style.display = 'none';
            if (saveMsg) {
                saveMsg.style.display = 'block';
                saveMsg.style.color   = '#43e97b';
                saveMsg.textContent   = '✓ Saved! Refreshing dashboard...';
            }
            sessionStorage.setItem('energyai_hasData', 'true');
            const user = JSON.parse(sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user') || '{}');
            if (user?.email) localStorage.setItem('energyai_hasData_' + btoa(user.email), 'true');
            setTimeout(() => checkUserDataAndShowDashboard(), 1500);
        } else {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Save to My Energy Data';
            if (saveMsg) {
                saveMsg.style.display = 'block';
                saveMsg.style.color   = '#ff6b35';
                saveMsg.textContent   = data.message || 'Save failed.';
            }
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save to My Energy Data';
    }
}

function showOcrError(msg) {
    const errorDiv = document.getElementById('ocrError');
    if (errorDiv) {
        errorDiv.style.display = 'block';
        errorDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + msg;
    }
}
