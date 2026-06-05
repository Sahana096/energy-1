# EnergyAI — Deployment Guide

## Services & Platforms

| Part        | Platform       | Free? |
|-------------|---------------|-------|
| Frontend    | Netlify        | ✅ Yes |
| Backend     | Render         | ✅ Yes |
| ML Service  | Render         | ✅ Yes |
| Database    | MongoDB Atlas  | ✅ Yes |

---

## Step 1 — Install Git
Download from: https://git-scm.com/download/win
After install, restart VS Code terminal.

---

## Step 2 — Create GitHub Repo
1. Go to https://github.com/new
2. Name it: `energy-monitoring`
3. Set to **Public** (needed for free Render deploys)
4. Do NOT add README (keep empty)

---

## Step 3 — Push Code to GitHub
Open terminal in VS Code, run these commands:

```bash
cd "C:\Users\chava\OneDrive\Documents\Desktop\energy monitoring .final\energy monitoring"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/energy-monitoring.git
git push -u origin main
```

---

## Step 4 — MongoDB Atlas (Database)
1. Go to: https://mongodb.com/atlas/database
2. Sign up → Create free cluster (M0)
3. Create a database user (username + password)
4. Allow access from anywhere: Network Access → Add IP → 0.0.0.0/0
5. Get connection string: Connect → Drivers → Copy URI
   Looks like: `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/energy_monitoring`

---

## Step 5 — Deploy Backend on Render
1. Go to: https://render.com → Sign up with GitHub
2. New → Web Service → Connect your GitHub repo
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Add Environment Variables:
   | Key | Value |
   |-----|-------|
   | `MONGO_URI` | your MongoDB Atlas URI from Step 4 |
   | `JWT_SECRET` | `EnergyAI_Pr0d_S3cr3t_K3y_2025_xK9mN2pQ7vR4wL8` |
   | `NODE_ENV` | `production` |
   | `FRONTEND_URL` | your Netlify URL (add after Step 7) |
5. Click **Deploy** — wait ~3 mins
6. Copy your backend URL e.g. `https://energyai-backend.onrender.com`

---

## Step 6 — Deploy ML Service on Render
1. Render → New → Web Service → Same GitHub repo
2. Settings:
   - **Root Directory:** `ml-service`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT`
3. No environment variables needed
4. Click **Deploy** — wait ~5 mins (tensorflow is large)
5. Copy your ML URL e.g. `https://energyai-ml.onrender.com`

---

## Step 7 — Update Frontend Config
Open `frontend/config.js` and replace the URLs:

```js
const API_BASE = IS_PROD
    ? 'https://energyai-backend.onrender.com/api'  // ← your backend URL + /api
    : 'http://localhost:5000/api';

const ML_BASE = IS_PROD
    ? 'https://energyai-ml.onrender.com'           // ← your ML URL
    : 'http://localhost:5001';
```

Then commit and push:
```bash
git add frontend/config.js
git commit -m "Update production URLs"
git push
```

---

## Step 8 — Deploy Frontend on Netlify
1. Go to: https://netlify.com → Sign up
2. **Drag and drop** the `frontend` folder onto the Netlify dashboard
3. Done! You get a URL like `https://energyai-abc123.netlify.app`
4. Copy this URL and add it as `FRONTEND_URL` in Render backend env vars

---

## Step 9 — Verify Everything Works
1. Open your Netlify URL
2. Login with: `admin@energyai.com` / `admin123`
3. Check all pages load correctly

---

## ⚠️ Important Notes

- **Render free tier** spins down after 15 mins of inactivity. First request takes ~30 seconds to wake up.
- **ML service** takes longer to start due to TensorFlow (~2 mins cold start).
- **Tesseract OCR** is NOT available on Render free tier — bill image scanning won't work in production. It works locally only.
- To keep services always-on, upgrade Render to paid plan ($7/month each).

---

## Local Development (Already Working)
```
Backend:    http://localhost:5000
ML Service: http://localhost:5001
Frontend:   http://localhost:8000
Login:      admin@energyai.com / admin123
```
