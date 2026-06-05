@echo off
echo Starting EnergyAI...
start "ML Microservice" cmd /k "cd ml-service && python app.py"
timeout /t 2 >nul
start "EnergyAI Backend" cmd /k "cd backend && npm start"
timeout /t 3 >nul
start "" "http://localhost:8000/index.html"
python -m http.server 8000 --directory frontend
