@echo off
echo Installing ML Service Dependencies...

cd ml_service

:: Create venv if it doesn't exist
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

:: Activate the venv and upgrade pip
echo Upgrading pip...
venv\Scripts\python -m pip install --upgrade pip

:: Install requirements
echo Installing core packages from requirements.txt...
venv\Scripts\python -m pip install -r requirements.txt

:: Install potentially missed dependencies explicitly
echo Installing critical dependencies...
venv\Scripts\python -m pip install groq pdfminer.six pydub

:: Install Spacy model separately just in case
echo Installing Spacy Language Model...
venv\Scripts\python -m spacy download en_core_web_sm

echo.
echo ==========================================
echo Dependencies installation complete!
echo You can now run start_app.bat
echo ==========================================
pause
