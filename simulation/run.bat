@echo off
echo ========================================================
echo SIH26050: Anti-Drone System 3D Digital Twin Simulation
echo ========================================================
echo Starting local web server on port 8085...
start "" http://localhost:8085
python -m http.server 8085
pause
