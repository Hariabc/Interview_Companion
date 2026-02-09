@echo off
echo Stopping any existing instances...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1

echo Starting Interview Companion Services...

:: Start ML Service
start "ML Service (Port 8000)" cmd /k "cd ml_service && venv\Scripts\python -m uvicorn app.main:app --reload --port 8000"

:: Start Backend
start "Backend API (Port 5000)" cmd /k "cd backend && npm run dev"

:: Start Frontend
start "Frontend App (Port 3000)" cmd /k "cd frontend && npm run dev"

echo.
echo All services are starting in new windows!
echo - ML Service: http://localhost:8000/docs
echo - Backend API: http://localhost:5000
echo - Frontend: http://localhost:3000
echo.
pause
