// ── API endpoints ─────────────────────────────────────────────────────
// In production these are set via environment at build time.
// For local dev, both point to localhost.
const IS_PROD = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

const API_BASE = IS_PROD
    ? 'https://energyai-backend.onrender.com/api'
    : 'http://localhost:5000/api';

const ML_BASE = IS_PROD
    ? 'https://energy-ml.onrender.com'
    : 'http://localhost:5001';

function getToken() {
    return sessionStorage.getItem('energyai_token') || localStorage.getItem('energyai_token');
}

function getAuthHeaders(contentType = true) {
    const token = getToken();
    const headers = {};
    if (contentType) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
}
