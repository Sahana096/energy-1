// CO₂ emission factor — must match backend/config/constants.js CO2_KG_PER_KWH
const CO2_KG_PER_KWH = 0.82;

// Recommendations page — data from backend API
document.addEventListener('DOMContentLoaded', function () {
    loadRecommendations();
    initializeSavingsChart();
    initSavingsCalculator();
});

async function loadRecommendations() {
    const container = document.getElementById('recommendationsContainer');
    try {
        const res  = await fetch(`${API_BASE}/recommendations`, { headers: getAuthHeaders() });
        const data = await res.json();

        if (!data.hasData || !data.recommendations?.length) {
            if (container) container.innerHTML = '<p style="color:#666;text-align:center;padding:2rem;">Upload energy data to get personalised recommendations.</p>';
            return;
        }

        if (container) {
            container.innerHTML = data.recommendations.map(r => `
                <div class="recommendation-card" data-id="${r.id}">
                    <div class="rec-icon"><i class="fas fa-${r.icon || 'lightbulb'}"></i></div>
                    <div class="rec-content">
                        <div class="rec-header">
                            <h3>${r.title}</h3>
                            <span class="priority-badge priority-${r.priority}">${r.priority}</span>
                        </div>
                        <p>${r.description}</p>
                        ${r.potential_savings_kwh != null ? `
                        <div class="rec-savings">
                            <span><i class="fas fa-bolt"></i> ${r.potential_savings_kwh} kWh saved</span>
                            ${r.potential_savings_inr != null ? `<span><i class="fas fa-rupee-sign"></i> ₹${r.potential_savings_inr} saved</span>` : ''}
                            ${r.potential_savings_co2 != null ? `<span><i class="fas fa-leaf"></i> ${r.potential_savings_co2} kg CO₂</span>` : ''}
                        </div>` : ''}
                    </div>
                    <div class="rec-actions">
                        <button class="btn-primary" onclick="applyRec(this)"><i class="fas fa-check"></i> Apply</button>
                        <button class="btn-secondary" onclick="showDetails(this)"><i class="fas fa-info-circle"></i> Details</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        if (container) container.innerHTML = '<p style="color:#ff6b35;text-align:center;padding:2rem;">Could not load recommendations. Ensure the backend is running.</p>';
    }
}

function initSavingsCalculator() {
    const kwhInput       = document.getElementById('calcKwh');
    const rateInput      = document.getElementById('calcRate');
    const reductionInput = document.getElementById('calcReduction');
    const reductionVal   = document.getElementById('calcReductionVal');
    const savingsEl      = document.getElementById('calcSavings');
    const co2El          = document.getElementById('calcCo2');
    if (!kwhInput) return;

    function calculate() {
        const kwh       = parseFloat(kwhInput.value) || 0;
        const rate      = parseFloat(rateInput.value) || 0;
        const reduction = parseInt(reductionInput.value) || 0;
        reductionVal.textContent = reduction + '%';
        savingsEl.textContent = '₹' + (kwh * rate * (reduction / 100)).toFixed(2);
        co2El.textContent     = '~' + Math.round(kwh * (reduction / 100) * CO2_KG_PER_KWH) + ' kg CO₂ saved/month';
    }

    kwhInput.addEventListener('input', calculate);
    rateInput.addEventListener('input', calculate);
    reductionInput.addEventListener('input', calculate);
    calculate();
}

function initializeSavingsChart() {
    const ctx = document.getElementById('savingsChart');
    if (!ctx) return;
    ctx.parentElement.style.height    = '140px';
    ctx.parentElement.style.position  = 'relative';

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [
                { label: 'Savings (₹)', data: [2.5, 5.8, 9.2, 12.0], borderColor: 'rgb(255,215,0)', backgroundColor: 'rgba(255,215,0,0.1)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3 },
                { label: 'Target (₹)',  data: [3.75, 7.5, 11.25, 15], borderColor: 'rgb(184,150,12)', backgroundColor: 'transparent', borderWidth: 2, borderDash: [5, 5], fill: false, tension: 0, pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true, labels: { color: '#aaaaaa', usePointStyle: true, padding: 10, font: { size: 10 } } } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: '#aaaaaa', font: { size: 10 }, callback: v => '₹' + v } },
                x: { grid: { display: false }, ticks: { color: '#aaaaaa', font: { size: 10 } } }
            }
        }
    });
}

function applyRec(btn) {
    const card  = btn.closest('.recommendation-card');
    const title = card.querySelector('h3').textContent;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';
    btn.disabled  = true;
    setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-check"></i> Applied';
        btn.style.background = 'linear-gradient(135deg,#FFD700,#b8960c)';
        btn.style.color      = '#000';
        showNotification('Applied: ' + title, 'success');
        setTimeout(() => { card.style.opacity = '0.6'; card.style.transform = 'scale(0.98)'; }, 500);
    }, 1500);
}

function showDetails(btn) {
    const title = btn.closest('.recommendation-card').querySelector('h3').textContent;
    showNotification('Details: ' + title, 'info');
}

function showNotification(message, type) {
    const n = document.createElement('div');
    n.style.cssText = 'position:fixed;top:20px;right:20px;background:' +
        (type === 'success' ? 'rgba(255,215,0,0.95)' : 'rgba(184,150,12,0.95)') +
        ';color:#000;padding:0.75rem 1.25rem;border-radius:0.5rem;display:flex;align-items:center;gap:0.5rem;z-index:1000;font-size:0.9rem;font-weight:bold;';
    n.innerHTML = '<i class="fas fa-' + (type === 'success' ? 'check-circle' : 'info-circle') + '"></i><span>' + message + '</span>';
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3000);
}
