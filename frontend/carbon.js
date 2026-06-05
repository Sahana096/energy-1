// Carbon Footprint page — all data from backend APIs
document.addEventListener('DOMContentLoaded', function () {
    loadCarbonMetrics();
    loadCarbonBreakdown();
    loadCarbonGoals();
});

let trendPeriod = 'monthly';
let trendChart  = null;

// ── Metrics ───────────────────────────────────────────────────────────
async function loadCarbonMetrics() {
    const el = id => document.getElementById(id);
    try {
        const res  = await fetch(`${API_BASE}/carbon/metrics`, { headers: getAuthHeaders() });
        const json = await res.json();

        if (!json.success || !json.hasData) {
            showNoData('carbon-metrics-section', 'Upload energy data to see your carbon footprint.');
            loadTrendChart(); // still try to render (will show no-data)
            return;
        }

        const d = json;

        if (el('todayCo2'))  el('todayCo2').textContent  = d.today.co2_kg + ' kg';
        if (el('todayKwh'))  el('todayKwh').textContent  = d.today.kwh.toFixed(1) + ' kWh';
        if (el('monthCo2'))  el('monthCo2').textContent  = d.month.co2_kg + ' kg';
        if (el('monthKwh'))  el('monthKwh').textContent  = d.month.kwh.toFixed(1) + ' kWh';
        if (el('yearCo2'))   el('yearCo2').textContent   = d.year.co2_kg + ' kg';
        if (el('yearTrees')) el('yearTrees').textContent = d.year.trees + ' trees';

        // Show emission factor used
        if (el('emissionFactor') && d.emission_factor) {
            el('emissionFactor').textContent =
                `Emission factor: ${d.emission_factor.value} ${d.emission_factor.unit} (${d.emission_factor.source})`;
        }

        const diff  = d.vsNationalAvg?.percent_diff ?? 0;
        const vsEl  = el('vsAvg');
        const badge = el('avgBadge');
        if (vsEl)  vsEl.textContent = Math.abs(diff) + '%';
        if (badge) {
            badge.className = 'comparison-badge ' + (diff <= 0 ? 'better' : 'worse');
            badge.innerHTML = diff <= 0
                ? '<i class="fas fa-arrow-down"></i> <span>Below average</span>'
                : '<i class="fas fa-arrow-up"></i> <span>Above average</span>';
        }
    } catch (e) {
        console.error('[carbon/metrics]', e.message);
        showNoData('carbon-metrics-section', 'Carbon metrics unavailable. Ensure the backend is running.');
    }
    loadTrendChart();
}

// ── Trend chart ───────────────────────────────────────────────────────
async function loadTrendChart() {
    const chartEl = document.getElementById('carbonTrendChart');
    if (!chartEl) return;

    try {
        const res  = await fetch(`${API_BASE}/carbon/trends`, { headers: getAuthHeaders() });
        const json = await res.json();

        if (!json.success || !json.hasData) {
            if (trendChart) trendChart.destroy();
            chartEl.parentElement.innerHTML =
                '<p style="color:#666;text-align:center;padding:2rem;">No trend data yet. Upload energy data to see trends.</p>';
            return;
        }

        const dataset = trendPeriod === 'monthly' ? json.monthly : json.weekly;
        if (!dataset?.length) {
            if (trendChart) trendChart.destroy();
            chartEl.parentElement.innerHTML =
                '<p style="color:#666;text-align:center;padding:2rem;">Not enough data for this period.</p>';
            return;
        }
        renderTrendChart(dataset);
    } catch (e) {
        console.error('[carbon/trends]', e.message);
        if (trendChart) trendChart.destroy();
        chartEl.parentElement.innerHTML =
            '<p style="color:#666;text-align:center;padding:2rem;">Trend data unavailable.</p>';
    }
}

function renderTrendChart(dataset) {
    const ctx = document.getElementById('carbonTrendChart');
    if (!ctx) return;
    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dataset.map(d => d.label),
            datasets: [{
                label: 'CO₂ Emissions (kg)',
                data: dataset.map(d => d.co2_kg),
                borderColor: '#43e97b',
                backgroundColor: 'rgba(67, 233, 123, 0.1)',
                borderWidth: 3,
                fill: false,
                tension: 0.4,
                pointBackgroundColor: '#43e97b',
                pointBorderColor: '#000',
                pointBorderWidth: 2,
                pointRadius: 5
            }, {
                label: 'Energy (kWh)',
                data: dataset.map(d => d.kwh),
                borderColor: '#FFD700',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#aaaaaa', usePointStyle: true } },
                tooltip: {
                    backgroundColor: '#111', titleColor: '#fff',
                    bodyColor: '#aaa', borderColor: '#2a2a2a', borderWidth: 1
                }
            },
            scales: {
                y:  {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#aaaaaa', callback: v => v + ' kg' },
                    title: { display: true, text: 'CO₂ (kg)', color: '#aaaaaa', font: { size: 11 } }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#FFD700', callback: v => v + ' kWh' },
                    title: { display: true, text: 'kWh', color: '#FFD700', font: { size: 11 } }
                },
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#aaaaaa' } }
            }
        }
    });
}

function toggleTrendPeriod() {
    trendPeriod = trendPeriod === 'monthly' ? 'weekly' : 'monthly';
    loadTrendChart();
}

// ── Breakdown ─────────────────────────────────────────────────────────
async function loadCarbonBreakdown() {
    const chartEl = document.getElementById('carbonBreakdownChart');
    try {
        const res  = await fetch(`${API_BASE}/carbon/breakdown`, { headers: getAuthHeaders() });
        const json = await res.json();

        if (!json.success || !json.hasData || !json.categories?.length) {
            if (chartEl) chartEl.parentElement.innerHTML =
                '<p style="color:#666;text-align:center;padding:2rem;">No breakdown data yet.</p>';
            return;
        }
        renderBreakdownChart(json.categories);
    } catch (e) {
        console.error('[carbon/breakdown]', e.message);
        if (chartEl) chartEl.parentElement.innerHTML =
            '<p style="color:#666;text-align:center;padding:2rem;">Breakdown unavailable.</p>';
    }
}

function renderBreakdownChart(categories) {
    const ctx = document.getElementById('carbonBreakdownChart');
    if (!ctx) return;

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories.map(c => c.name),
            datasets: [{
                data: categories.map(c => c.percent),
                backgroundColor: categories.map(c => c.color),
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#111', bodyColor: '#fff',
                    borderColor: '#2a2a2a', borderWidth: 1,
                    callbacks: {
                        label: c => {
                            const cat = categories[c.dataIndex];
                            return ` ${cat.name}: ${cat.percent}% — ${cat.co2_kg} kg CO₂`;
                        }
                    }
                }
            }
        }
    });

    const legend = document.getElementById('carbonLegend');
    if (legend) {
        legend.innerHTML = categories.map(c => `
            <div class="legend-item">
                <span class="legend-color" style="background:${c.color};"></span>
                <span>${c.name} (${c.percent}%)</span>
            </div>`).join('');
    }
}

// ── Goals ─────────────────────────────────────────────────────────────
async function loadCarbonGoals() {
    const gc = document.getElementById('goalsContainer');
    const oc = document.getElementById('offsetContainer');
    try {
        const res  = await fetch(`${API_BASE}/carbon/goals`, { headers: getAuthHeaders() });
        const json = await res.json();

        if (!json.success || !json.hasData) {
            if (gc) gc.innerHTML = '<p style="color:#666;text-align:center;padding:1rem;">Upload energy data to track goals.</p>';
            if (oc) oc.innerHTML = '<p style="color:#666;text-align:center;padding:1rem;">No offset data available.</p>';
            return;
        }
        if (json.goals)   renderGoals(json.goals);
        if (json.offsets) renderOffsets(json.offsets);
    } catch (e) {
        console.error('[carbon/goals]', e.message);
        if (gc) gc.innerHTML = '<p style="color:#666;text-align:center;padding:1rem;">Goals unavailable.</p>';
        if (oc) oc.innerHTML = '<p style="color:#666;text-align:center;padding:1rem;">Offsets unavailable.</p>';
    }
}

function renderGoals(goals) {
    const container = document.getElementById('goalsContainer');
    if (!container) return;
    container.innerHTML = goals.map(g => {
        const isCompleted = g.status === 'completed';
        // For "reduce" goals current should be ≤ target; for "offset" goals current/target
        const pct = Math.min(100, Math.round(
            isCompleted ? 100 : (g.current_co2_kg / g.target_co2_kg) * 100
        ));
        return `
            <div class="goal-item">
                <div class="goal-status ${isCompleted ? 'completed' : 'active'}">
                    <i class="fas fa-${isCompleted ? 'check' : 'bullseye'}"></i>
                </div>
                <div class="goal-info">
                    <h4>${g.title}</h4>
                    <p>${g.description || 'Deadline: ' + g.deadline}</p>
                </div>
                <div class="goal-progress">
                    <div class="goal-progress-bar">
                        <div class="goal-progress-fill" style="width:${pct}%;"></div>
                    </div>
                    <div class="goal-progress-text">${pct}% (${g.current_co2_kg}/${g.target_co2_kg} kg)</div>
                </div>
            </div>`;
    }).join('');
}

function renderOffsets(offsets) {
    const container = document.getElementById('offsetContainer');
    if (!container) return;
    container.innerHTML = offsets.map(o => `
        <div class="offset-card">
            <div class="offset-header">
                <i class="fas fa-${getOffsetIcon(o.type)}"></i>
                <h4>${o.type}</h4>
            </div>
            <div class="offset-stat"><span>Save CO₂</span><span>${o.saved_kg} kg/yr</span></div>
            <div class="offset-stat"><span>Cost</span><span>₹${o.cost.toLocaleString()}</span></div>
            <div class="offset-stat"><span>Payback</span><span>${o.roi_years === 0 ? 'Immediate' : o.roi_years + ' yrs'}</span></div>
        </div>`).join('');
}

function getOffsetIcon(type) {
    const map = {
        'Solar Panels':     'solar-panel',
        'Tree Planting':    'tree',
        'LED Upgrade':      'lightbulb',
        'Smart Thermostat': 'temperature-high'
    };
    return map[type] || 'leaf';
}

function showNoData(sectionId, message) {
    const el = document.getElementById(sectionId);
    if (el) el.innerHTML = `<p style="color:#666;text-align:center;padding:2rem;">${message}</p>`;
}
