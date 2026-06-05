// Predictions page — all data from backend APIs
document.addEventListener('DOMContentLoaded', function () {
    loadForecast();
    loadMetrics();
    initializePredictionComparisonChart();
    initializeWeatherImpactChart();
});

async function loadForecast() {
    try {
        const res  = await fetch(`${API_BASE}/energy/forecast`, { headers: getAuthHeaders() });
        const data = await res.json();

        if (data.hasData && data.forecast?.length) {
            initializeWeekForecastChart(data.forecast);

            const total = data.forecast.reduce((s, x) => s + x.predicted_kwh, 0);
            const cost  = data.forecast.reduce((s, x) => s + (x.predicted_cost ?? x.predicted_kwh * 7), 0);

            // Forecast card — total kWh
            const totalEl = document.getElementById('forecastTotalKwh');
            if (totalEl) totalEl.textContent = total.toFixed(1) + ' kWh';

            // Source label
            const srcEl = document.getElementById('forecastSource');
            if (srcEl) {
                const src = data.source === 'ml_service' ? '🤖 ML Model' : '📊 Statistical';
                srcEl.textContent = src + (data.algorithm ? ' — ' + data.algorithm : '');
            }

            // Badge on comparison chart
            const badge = document.querySelector('.accuracy-badge');
            if (badge && data.algorithm) {
                const m  = data.metrics;
                const r2 = m?.r2 != null ? ` | R²: ${m.r2}` : '';
                badge.textContent = (data.source === 'ml_service' ? '🤖 ' : '📊 ') + data.algorithm + r2;
            }

            // Bill card — tiered calculation on 30-day projection
            const monthlyKwh = total / 7 * 30;
            const bill = calcBill(monthlyKwh);
            const el = id => document.getElementById(id);
            if (el('predBillTotal'))  el('predBillTotal').textContent  = '₹' + bill.total.toLocaleString();
            if (el('predBillEnergy')) el('predBillEnergy').textContent = '₹' + bill.energy.toLocaleString();
            if (el('predBillFixed'))  el('predBillFixed').textContent  = '₹' + bill.fixed;
            if (el('predBillTax'))    el('predBillTax').textContent    = '₹' + bill.tax.toLocaleString();
            if (el('predBillNote'))   el('predBillNote').textContent   = 'Projected for 30 days';
        } else {
            initializeWeekForecastChart([]);
        }
    } catch (e) {
        initializeWeekForecastChart([]);
    }
}

// Tiered bill calculation matching analyticsController
function calcBill(kwh) {
    let energy = 0;
    if (kwh <= 100)       energy = kwh * 3.50;
    else if (kwh <= 300)  energy = 100 * 3.50 + (kwh - 100) * 5.00;
    else if (kwh <= 500)  energy = 100 * 3.50 + 200 * 5.00 + (kwh - 300) * 6.50;
    else                  energy = 100 * 3.50 + 200 * 5.00 + 200 * 6.50 + (kwh - 500) * 7.50;
    const fixed    = 50;
    const subtotal = energy + fixed;
    const tax      = subtotal * 0.05;
    return {
        energy: Math.round(energy * 100) / 100,
        fixed,
        tax:    Math.round(tax    * 100) / 100,
        total:  Math.round((subtotal + tax) * 100) / 100
    };
}

async function loadMetrics() {
    try {
        const res  = await fetch(`${API_BASE}/ml/metrics`, { headers: getAuthHeaders() });
        const json = await res.json();
        const data = json.data || json;
        const el   = id => document.getElementById(id);

        // Random Forest regression metrics
        const rf   = data.random_forest || {};
        const iso  = data.isolation_forest || {};
        const r2   = rf.r2   ?? null;
        const mae  = rf.mae  ?? null;
        const rmse = rf.rmse ?? null;

        // Accuracy/Precision/Recall from Isolation Forest (anomaly detection)
        const accuracy  = iso.precision ?? null;   // use precision as accuracy proxy
        const precision = iso.precision ?? null;
        const recall    = iso.recall    ?? null;

        // Populate metric circles
        const setCircle = (circleId, valueId, value, isPercent = true) => {
            const circle = document.getElementById(circleId);
            const span   = document.getElementById(valueId);
            if (!span) return;
            if (value != null) {
                const display = isPercent ? Math.round(value * 100) + '%' : value;
                span.textContent = display;
                if (circle) circle.style.setProperty('--progress', Math.round(value * 100));
            } else {
                span.textContent = '—';
            }
        };

        setCircle('circleR2',        'metricR2',   r2);
        setCircle('circleMAE',       'metricMAE',  mae,  false);
        setCircle('circleRMSE',      'metricRMSE', rmse, false);

        // Model info rows
        const src  = data.source === 'ml_service' ? '🤖 Trained model' : '📊 Reference values';
        const algo = data.source === 'ml_service'
            ? (rf.r2 != null ? 'Random Forest' : 'Statistical')
            : 'Statistical Fallback';

        if (el('modelAlgorithm')) el('modelAlgorithm').textContent = algo;
        if (el('modelSource'))    el('modelSource').textContent    = src;
        if (el('modelUpdated'))   el('modelUpdated').textContent   = new Date().toLocaleTimeString();

        // Accuracy badge
        const badge = document.querySelector('.accuracy-badge');
        if (badge) {
            badge.textContent = r2 != null
                ? `${algo} — R²: ${r2} | MAE: ${mae ?? '—'} | RMSE: ${rmse ?? '—'}`
                : 'Model metrics unavailable';
        }
    } catch (e) {
        const badge = document.querySelector('.accuracy-badge');
        if (badge) badge.textContent = 'Model metrics unavailable';
    }
}

function initializeWeekForecastChart(forecast) {
    const ctx = document.getElementById('weekForecastChart');
    if (!ctx) return;

    const labels = forecast.length
        ? forecast.map(d => new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }))
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = forecast.length
        ? forecast.map(d => d.predicted_kwh)
        : [0, 0, 0, 0, 0, 0, 0];

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Predicted (kWh)',
                data,
                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                borderRadius: 6,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#aaaaaa' } },
                x: { grid: { display: false }, ticks: { color: '#aaaaaa' } }
            }
        }
    });
}

async function initializePredictionComparisonChart() {
    const ctx = document.getElementById('predictionComparisonChart');
    if (!ctx) return;

    let predicted = [], actual = [], labels = [];

    try {
        const res  = await fetch(`${API_BASE}/ml/prediction-vs-actual?limit=50`, { headers: getAuthHeaders() });
        const data = await res.json();

        if (data.success && data.hasData && data.records?.length) {
            labels    = data.records.map(r => r.label);
            actual    = data.records.map(r => r.actual);
            predicted = data.records.map(r => r.predicted ?? null);
        }
    } catch (e) { /* empty */ }

    // If only 1 point, extend to a flat line across 7 positions
    if (labels.length === 1) {
        const val  = actual[0];
        const pred = predicted[0];
        labels    = Array.from({ length: 7 }, (_, i) => i === 3 ? labels[0] : '');
        actual    = Array.from({ length: 7 }, (_, i) => i === 3 ? val : null);
        predicted = Array.from({ length: 7 }, () => pred);
    }

    if (!labels.length) {
        labels    = Array.from({ length: 7 }, (_, i) => 'Day ' + (i + 1));
        actual    = labels.map(() => null);
        predicted = labels.map(() => 0);
    }

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Actual',
                    data: actual,
                    borderColor: '#FFD700',
                    backgroundColor: 'rgba(255,215,0,0.06)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    spanGaps: false
                },
                {
                    label: 'Predicted (ML)',
                    data: predicted,
                    borderColor: '#FFD700',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [6, 4],
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    spanGaps: true
                }
            ]
        },
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
                        label: c => c.raw != null ? ` ${c.dataset.label}: ${c.raw} kWh` : null
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(255,255,255,0.07)' },
                    ticks: { color: '#aaa', font: { size: 10 }, callback: v => v + ' kWh' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#aaa', font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 }
                }
            }
        }
    });
}

async function initializeWeatherImpactChart() {
    const ctx = document.getElementById('weatherImpactChart');
    if (!ctx) return;

    // Build chart from real user consumption data grouped by hour-of-day
    // as a proxy for temperature correlation (hotter hours = more AC = higher usage)
    let scatterData = [];
    try {
        const res  = await fetch(`${API_BASE}/analytics/hourly`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.hasData && data.hourly?.length) {
            // Map hour → estimated temperature (typical India daily curve)
            const tempByHour = [22,21,21,20,20,21,23,25,27,29,31,33,34,35,35,34,33,32,30,28,27,26,25,23];
            scatterData = data.hourly
                .filter(h => h.avg_kw > 0)
                .map(h => ({ x: tempByHour[h.hour], y: parseFloat(h.avg_kw.toFixed(3)) }));
        }
    } catch (e) { /* empty */ }

    // Fallback if no data
    if (!scatterData.length) {
        if (ctx.parentElement) {
            ctx.parentElement.innerHTML = '<p style="color:#666;text-align:center;padding:2rem;font-size:0.85rem;">Upload energy data to see weather impact analysis.</p>';
        }
        return;
    }

    new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Temp vs Consumption',
                data: scatterData,
                backgroundColor: 'rgba(255, 107, 53, 0.6)',
                borderColor: 'rgb(255, 107, 53)',
                borderWidth: 1.5,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => ` ${c.raw.x}°C → ${c.raw.y} kW`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: { display: true, text: 'Avg Consumption (kW)', color: '#aaaaaa' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#aaaaaa' }
                },
                x: {
                    title: { display: true, text: 'Est. Temperature (°C)', color: '#aaaaaa' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#aaaaaa' }
                }
            }
        }
    });
}

const refreshBtn = document.querySelector('.btn-primary');
if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        setTimeout(() => {
            this.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Predictions';
            loadForecast();
        }, 1000);
    });
}
