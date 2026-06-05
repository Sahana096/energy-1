const API_BASE = 'http://localhost:5000/api';

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
