// Analytics — loads from backend APIs
const CURRENCY = '₹';
let currentRange = 'week';
let trendChart = null;
let forecastChart = null;
let peakChart = null;

document.addEventListener('DOMContentLoaded', function () {
    loadAllData();
});

async function loadAllData() {
    await Promise.all([
        renderTrend('week'),
        renderForecast(),
        renderComparison(),
        renderPeakHours(),
        renderClusters(),
        renderWeeklyPattern(),
        renderCostBreakdown()
    ]);
}

// ── Date range buttons ────────────────────────────────────────────────
function setDateRange(range, btn) {
    currentRange = range;
    document.querySelectorAll('.date-range-selector .btn-secondary')
        .forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderTrend(range);
}

// ── Consumption Trends — one chart, two coloured lines ───────────────
async function renderTrend(range) {
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    let currLabels = [], prevLabels = [], currData = [], prevData = [], unit = 'kWh';
    let hasData = false, isMonthlyView = false;
    let summaryLatestVal = null, summaryPrevVal = null, summaryLatestLabel = '', summaryPrevLabel = '';

    try {
        const res  = await fetch(`${API_BASE}/analytics/range?period=${range}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.hasData && data.labels?.length) {
            hasData       = true;
            currLabels    = data.labels;
            prevLabels    = data.prevLabels || data.labels;
            currData      = data.current;
            prevData      = data.previous;
            unit          = data.unit || 'kWh';
            isMonthlyView = !!data.monthlyView;

            if (isMonthlyView) {
                const last = currData.length - 1;
                const prev = currData.length - 2;
                summaryLatestVal   = currData[last] || 0;
                summaryPrevVal     = prev >= 0 ? (currData[prev] || 0) : 0;
                summaryLatestLabel = currLabels[last] || 'Latest';
                summaryPrevLabel   = prev >= 0 ? (currLabels[prev] || 'Prev') : 'Prev';
            }
        }
    } catch (e) { /* fallback */ }

    // Placeholder when no data — show empty chart with a message overlay
    if (!hasData) {
        // Show a "no data" message inside the chart area
        const cardBody = ctx.closest('.card-body') || ctx.parentElement;
        let noDataMsg = cardBody?.querySelector('.trend-no-data');
        if (!noDataMsg) {
            noDataMsg = document.createElement('div');
            noDataMsg.className = 'trend-no-data';
            noDataMsg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#555;font-size:0.85rem;pointer-events:none;z-index:1;';
            cardBody?.style && (cardBody.style.position = 'relative');
            cardBody?.appendChild(noDataMsg);
        }
        const rangeNames = { day: 'today', week: 'this week', month: 'this month', year: 'this year' };
        noDataMsg.innerHTML = `<i class="fas fa-chart-line" style="font-size:1.5rem;margin-bottom:0.5rem;display:block;color:#333;"></i>No data for ${rangeNames[range] || range}`;
        noDataMsg.style.display = 'block';

        // Still render an empty chart so the container isn't blank
        const ph = {
            day:   Array.from({ length: 8 }, (_, i) => (i * 3).toString().padStart(2,'0') + ':00'),
            week:  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
            month: ['Week 1','Week 2','Week 3','Week 4'],
            year:  ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        };
        currLabels = ph[range] || ph.week;
        prevLabels = currLabels;
        currData   = currLabels.map(() => null);
        prevData   = currLabels.map(() => null);
    } else {
        // Hide no-data message if it exists
        const cardBody = ctx.closest('.card-body') || ctx.parentElement;
        const noDataMsg = cardBody?.querySelector('.trend-no-data');
        if (noDataMsg) noDataMsg.style.display = 'none';
    }

    // Period names for summary bar
    const names = {
        day:   { curr: 'Today',      prev: 'Yesterday'  },
        week:  { curr: 'This Week',  prev: 'Last Week'  },
        month: { curr: 'This Month', prev: 'Last Month' },
        year:  { curr: 'This Year',  prev: 'Last Year'  }
    };
    const nm = names[range] || names.week;

    // Summary bar values
    const el = id => document.getElementById(id);
    const displayCurr  = isMonthlyView ? summaryLatestVal : currData.reduce((s, v) => s + (v || 0), 0);
    const displayPrev  = isMonthlyView ? summaryPrevVal   : prevData.reduce((s, v) => s + (v || 0), 0);
    const labelCurr    = isMonthlyView ? summaryLatestLabel : nm.curr;
    const labelPrev    = isMonthlyView ? summaryPrevLabel   : nm.prev;

    if (el('trendCurrentLabel')) el('trendCurrentLabel').textContent = labelCurr;
    if (el('trendPrevLabel'))    el('trendPrevLabel').textContent    = labelPrev;
    if (el('trendCurrentTotal')) el('trendCurrentTotal').textContent = hasData ? displayCurr.toFixed(1) + ' ' + unit : '—';
    if (el('trendPrevTotal'))    el('trendPrevTotal').textContent    = displayPrev > 0 ? displayPrev.toFixed(1) + ' ' + unit : '—';
    if (el('trendDiffBadge')) {
        if (!hasData || displayCurr === 0) {
            el('trendDiffBadge').textContent      = 'No data';
            el('trendDiffBadge').style.background = 'rgba(255,255,255,0.05)';
            el('trendDiffBadge').style.color      = '#555';
        } else {
            const diff = displayPrev > 0 ? ((displayCurr - displayPrev) / displayPrev * 100).toFixed(1) : 0;
            const up   = parseFloat(diff) > 0;
            el('trendDiffBadge').textContent      = displayPrev > 0 ? (up ? '▲ +' : '▼ ') + diff + '%' : '—';
            el('trendDiffBadge').style.background = up ? 'rgba(255,107,53,0.2)' : 'rgba(67,233,123,0.2)';
            el('trendDiffBadge').style.color      = up ? '#ff6b35' : '#43e97b';
        }
    }

    // If only 1 data point — extend to flat line
    if (currLabels.length === 1) {
        const cVal = currData[0];
        const pVal = prevData[0] ?? null;
        currLabels = ['', '', '', currLabels[0], '', '', ''];
        prevLabels = ['', '', '', prevLabels[0], '', '', ''];
        currData   = [cVal, cVal, cVal, cVal, cVal, cVal, cVal];
        prevData   = [pVal, pVal, pVal, pVal, pVal, pVal, pVal];
    }

    const xLabels     = currLabels;
    const maxTicks    = range === 'day' ? 8 : 12;
    const prevHasData = prevData.some(v => v != null && v > 0);

    const datasets = [{
        label: isMonthlyView ? 'Monthly kWh' : labelCurr,
        data: currData,
        borderColor: '#FFD700',
        backgroundColor: 'rgba(255,215,0,0.05)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: '#FFD700',
        pointBorderColor: '#111',
        pointBorderWidth: 2,
        order: 1
    }];

    if (prevHasData) {
        datasets.push({
            label: labelPrev,
            data: prevData,
            borderColor: '#ff6b35',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ff6b35',
            pointBorderColor: '#111',
            pointBorderWidth: 2,
            order: 2
        });
    }

    trendChart = new Chart(ctx, {
        type: 'line',
        data: { labels: xLabels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#aaa', usePointStyle: true, padding: 16, font: { size: 11 } }
                },
                tooltip: {
                    backgroundColor: '#1a1a1a',
                    titleColor: '#aaa',
                    bodyColor: '#fff',
                    borderColor: '#333',
                    borderWidth: 1,
                    callbacks: {
                        title: (items) => xLabels[items[0].dataIndex] || '',
                        label: (item) => ` ${item.dataset.label}: ${item.raw != null ? item.raw + ' ' + unit : '—'}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.07)' },
                    ticks: { color: '#aaa', font: { size: 10 }, callback: v => v + ' ' + unit }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#aaa', font: { size: 10 }, maxRotation: 30, maxTicksLimit: maxTicks }
                }
            }
        }
    });
}

// ── AI Forecast ───────────────────────────────────────────────────────
async function renderForecast() {
    if (forecastChart) { forecastChart.destroy(); forecastChart = null; }
    const ctx = document.getElementById('forecastChart');
    if (!ctx) return;

    let fc = [];
    try {
        const res  = await fetch(`${API_BASE}/energy/forecast`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.hasData && data.forecast?.length) fc = data.forecast;
    } catch (e) { /* empty */ }

    if (!fc.length) {
        const el = id => document.getElementById(id);
        if (el('totalForecast')) el('totalForecast').textContent = '— kWh';
        if (el('peakDay'))       el('peakDay').textContent       = '—';
        if (el('forecastCost'))  el('forecastCost').textContent  = CURRENCY + '—';
        return;
    }

    const labels = fc.map(d => new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));
    const values = fc.map(d => d.predicted_kwh);

    forecastChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: 'Predicted kWh', data: values, backgroundColor: 'rgba(255,107,53,0.8)', borderRadius: 5, borderWidth: 0 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.07)' }, ticks: { color: '#aaa', callback: v => v + ' kWh', font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { color: '#aaa', font: { size: 10 } } }
            }
        }
    });

    const total = fc.reduce((s, d) => s + d.predicted_kwh, 0);
    const peak  = fc.reduce((m, d) => d.predicted_kwh > m.predicted_kwh ? d : m, fc[0]);
    // Use predicted_cost from API if available, otherwise fall back to sum
    const cost  = fc.reduce((s, d) => s + (d.predicted_cost ?? d.predicted_kwh * 7), 0);
    const el = id => document.getElementById(id);
    if (el('totalForecast')) el('totalForecast').textContent = total.toFixed(1) + ' kWh';
    if (el('peakDay'))       el('peakDay').textContent       = new Date(peak.date).toLocaleDateString('en-US', { weekday: 'long' });
    if (el('forecastCost'))  el('forecastCost').textContent  = CURRENCY + cost.toFixed(2);
}

// ── Comparison ────────────────────────────────────────────────────────
let comparisonChart = null;
async function renderComparison() {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;

    // Destroy existing instance to prevent "Canvas already in use" error
    if (comparisonChart) { comparisonChart.destroy(); comparisonChart = null; }

    let labels = [], thisWeekData = [], lastWeekData = [];
    let thisTotal = 0, lastTotal = 0;

    try {
        const res  = await fetch(`${API_BASE}/analytics/weekly-comparison`, { headers: getAuthHeaders() });
        const resp = await res.json();
        if (resp.hasData && resp.this_week?.length) {
            labels       = resp.this_week.map(d => new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }));
            thisWeekData = resp.this_week.map(d => d.kwh);
            lastWeekData = resp.last_week?.length
                ? resp.last_week.map(d => d.kwh)
                : thisWeekData.map(() => 0);
            thisTotal = thisWeekData.reduce((s, v) => s + v, 0);
            lastTotal = lastWeekData.reduce((s, v) => s + v, 0);
        }
    } catch (e) { /* empty */ }

    if (!labels.length) {
        labels       = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        thisWeekData = labels.map(() => 0);
        lastWeekData = labels.map(() => 0);
    }

    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'This Week',
                    data: thisWeekData,
                    backgroundColor: 'rgba(255,215,0,0.85)',
                    borderColor: '#FFD700',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: lastTotal > 0 ? 'Last Week' : 'Last Week (no data)',
                    data: lastWeekData,
                    backgroundColor: lastTotal > 0 ? 'rgba(255,107,53,0.7)' : 'rgba(255,255,255,0.05)',
                    borderColor: lastTotal > 0 ? '#ff6b35' : 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { color: '#aaa', usePointStyle: true, font: { size: 10 } } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.07)' }, ticks: { color: '#aaa', font: { size: 10 }, callback: v => v + ' kWh' } },
                x: { grid: { display: false }, ticks: { color: '#aaa', font: { size: 10 } } }
            }
        }
    });

    // Update stats
    const diff = lastTotal > 0 ? (((thisTotal - lastTotal) / lastTotal) * 100).toFixed(1) : 0;
    const el = id => document.getElementById(id);
    if (el('compThisWeek')) el('compThisWeek').textContent = thisTotal.toFixed(1) + ' kWh';
    if (el('compLastWeek')) {
        el('compLastWeek').textContent = lastTotal > 0 ? lastTotal.toFixed(1) + ' kWh' : 'No data';
        el('compLastWeek').style.color = lastTotal > 0 ? '' : '#555';
    }
    if (el('compDiff')) {
        if (lastTotal > 0) {
            el('compDiff').textContent = (diff > 0 ? '+' : '') + diff + '%';
            el('compDiff').style.color = diff <= 0 ? '#43e97b' : '#ff6b35';
        } else {
            el('compDiff').textContent = '—';
            el('compDiff').style.color = '#555';
        }
    }
}

// ── Peak Hours ────────────────────────────────────────────────────────
async function renderPeakHours() {
    if (peakChart) { peakChart.destroy(); peakChart = null; }
    const ctx = document.getElementById('peakHoursChart');
    if (!ctx) return;

    // Full 24-hour array initialised to 0
    const hourlyAvg = Array(24).fill(0);
    let peakHour = 18, offPeakHour = 3;
    let hasRealData = false;

    try {
        const res  = await fetch(`${API_BASE}/analytics/hourly`, { headers: getAuthHeaders() });
        const resp = await res.json();
        if (resp.hasData && resp.hourly?.length) {
            hasRealData = true;
            resp.hourly.forEach(h => { hourlyAvg[h.hour] = h.avg_kw || 0; });

            // Find real peak (highest avg) and off-peak (lowest non-zero avg)
            const nonZero = resp.hourly.filter(h => h.avg_kw > 0);
            if (nonZero.length >= 2) {
                peakHour    = nonZero.reduce((m, h) => h.avg_kw > m.avg_kw ? h : m, nonZero[0]).hour;
                offPeakHour = nonZero.reduce((m, h) => h.avg_kw < m.avg_kw ? h : m, nonZero[0]).hour;
            } else if (nonZero.length === 1) {
                peakHour    = nonZero[0].hour;
                offPeakHour = null; // only 1 active hour — no off-peak
            }
        }
    } catch (e) { /* empty */ }

    // Show every 3 hours on x-axis but include all data
    const labels = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2,'0') + ':00');
    const mx     = Math.max(...hourlyAvg, 0.01);

    // Color: peak = orange, off-peak = yellow (#FFD700), others = dim gold, empty = near-invisible
    const colors = hourlyAvg.map((v, i) => {
        if (i === peakHour)                          return 'rgba(255,107,53,0.9)';   // orange — peak
        if (offPeakHour !== null && i === offPeakHour && v > 0) return 'rgba(255,215,0,0.95)';  // yellow — off-peak
        return v > 0 ? 'rgba(255,215,0,0.45)' : 'rgba(255,255,255,0.04)';
    });

    peakChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Avg kW',
                data: hourlyAvg,
                backgroundColor: colors,
                borderRadius: 3,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1a1a1a',
                    titleColor: '#fff',
                    bodyColor: '#aaa',
                    callbacks: {
                        label: c => ` ${c.raw > 0 ? c.raw + ' kW' : 'No data'}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.07)' },
                    ticks: { color: '#aaa', font: { size: 10 }, callback: v => v + ' kW' }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#aaa',
                        font: { size: 9 },
                        maxRotation: 0,
                        // Show label every 3 hours
                        callback: (val, i) => i % 3 === 0 ? labels[i] : ''
                    }
                }
            }
        }
    });

    // Update Peak Time and Off-Peak Time text from real data
    const fmt = h => {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12  = h % 12 || 12;
        return `${h12}:00 ${ampm}`;
    };

    const peakEl    = document.getElementById('peakTimeText');
    const offPeakEl = document.getElementById('offPeakTimeText');

    if (hasRealData) {
        if (peakEl)    peakEl.textContent    = fmt(peakHour) + ' – ' + fmt((peakHour + 1) % 24);
        if (offPeakEl) offPeakEl.textContent = offPeakHour !== null
            ? fmt(offPeakHour) + ' – ' + fmt((offPeakHour + 1) % 24)
            : 'Not enough data';
    } else {
        if (peakEl)    peakEl.textContent    = 'No data yet';
        if (offPeakEl) offPeakEl.textContent = 'No data yet';
    }
}

// ── K-Means Clusters ──────────────────────────────────────────────────
let clusterPieChart = null;
let clusterProfileChart = null;
async function renderClusters() {
    let dist    = { Low: 0, Medium: 0, High: 0 };
    let profile = [];

    try {
        const res  = await fetch(`${API_BASE}/ml/clusters`, { headers: getAuthHeaders() });
        const json = await res.json();
        const data = json.data || json;
        if (data.distribution)  dist    = data.distribution;
        if (data.hourly_profile) profile = data.hourly_profile;
    } catch (e) { /* empty */ }

    const pieCtx = document.getElementById('clusterPieChart');
    if (pieCtx) {
        if (clusterPieChart) { clusterPieChart.destroy(); clusterPieChart = null; }

        // If all zeros, show placeholder
        const hasData = dist.Low > 0 || dist.Medium > 0 || dist.High > 0;
        const pieData  = hasData ? [dist.Low, dist.Medium, dist.High] : [33.3, 33.3, 33.4];
        const pieColors = ['#b8960c', '#FFD700', '#ff6b35']; // Low=dark gold, Medium=yellow, High=orange

        clusterPieChart = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: ['Low Usage', 'Medium Usage', 'High Usage'],
                datasets: [{
                    data: pieData,
                    backgroundColor: pieColors,
                    borderWidth: 3,
                    borderColor: '#111'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { color: '#aaa', font: { size: 10 }, padding: 8, usePointStyle: true } },
                    tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + (hasData ? c.raw + '%' : 'No data') } }
                }
            }
        });
    }

    const profCtx = document.getElementById('clusterProfileChart');
    if (profCtx && profile.length) {
        if (clusterProfileChart) { clusterProfileChart.destroy(); clusterProfileChart = null; }
        clusterProfileChart = new Chart(profCtx, {
            type: 'line',
            data: {
                labels: profile.map(h => h.hour + ':00'),
                datasets: [
                    { label: 'Low',    data: profile.map(h => h.Low    || 0), borderColor: '#b8960c', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4 },
                    { label: 'Medium', data: profile.map(h => h.Medium || 0), borderColor: '#FFD700', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4 },
                    { label: 'High',   data: profile.map(h => h.High   || 0), borderColor: '#ff6b35', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, labels: { color: '#aaa', font: { size: 10 } } } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#aaa', maxTicksLimit: 4, font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: '#aaa', maxTicksLimit: 8, font: { size: 10 } } }
                }
            }
        });
    }
}

// ── Cost Breakdown (from analytics/summary) ───────────────────────────
async function renderCostBreakdown() {
    try {
        const res  = await fetch(`${API_BASE}/analytics/summary`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.hasData || !data.bill) return;

        const b  = data.bill;
        const el = id => document.getElementById(id);
        if (el('billEnergy'))    el('billEnergy').textContent    = '₹' + b.energy_charge.toLocaleString();
        if (el('billFixed'))     el('billFixed').textContent     = '₹' + b.fixed_charge.toLocaleString();
        if (el('billTax'))       el('billTax').textContent       = '₹' + b.tax.toLocaleString();
        if (el('billTotal'))     el('billTotal').textContent     = '₹' + b.total.toLocaleString();
        if (el('billRatePerKwh')) el('billRatePerKwh').textContent = '₹' + b.rate_per_kwh + '/kWh (effective)';
        if (el('billKwh'))       el('billKwh').textContent       = data.total_consumption_kwh + ' kWh';
        if (el('billCo2'))       el('billCo2').textContent       = data.co2_emissions_kg + ' kg CO₂';
    } catch (e) { /* section stays with placeholder values */ }
}
// ── Weekly Radar ──────────────────────────────────────────────────────
let weeklyPatternChart = null;
async function renderWeeklyPattern() {
    const ctx = document.getElementById('weeklyPatternChart');
    if (!ctx) return;
    if (weeklyPatternChart) { weeklyPatternChart.destroy(); weeklyPatternChart = null; }

    let data = [0, 0, 0, 0, 0, 0, 0];
    try {
        const res  = await fetch(`${API_BASE}/analytics/weekly-comparison`, { headers: getAuthHeaders() });
        const resp = await res.json();
        if (resp.hasData && resp.this_week?.length === 7) {
            data = resp.this_week.map(d => d.kwh);
        }
    } catch (e) { /* empty */ }

    weeklyPatternChart = new Chart(ctx, {
        type: 'radar',
        data: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], datasets: [{ label: 'kWh', data, borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.15)', borderWidth: 2, pointBackgroundColor: '#FFD700' }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { r: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#aaa', backdropColor: 'transparent', font: { size: 9 } }, pointLabels: { color: '#aaa', font: { size: 10 } } } }
        }
    });
}
