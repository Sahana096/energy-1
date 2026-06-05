@echo off
echo Installing Node dependencies...
cd backend
call npm install
cd ..

echo Installing Python ML dependencies...
cd ml-service
call pip install -r requirements.txt
cd ..

echo.
echo Generating energy data and training models...
cd ml-service
python generate_data.py
python train.py
cd ..

echo.
echo Starting ML Microservice on http://localhost:5001
start "ML Microservice" cmd /k "cd ml-service && python app.py"

timeout /t 3 >nul

echo.
echo Starting EnergyAI Node API on http://localhost:5000
cd backend
npm start
