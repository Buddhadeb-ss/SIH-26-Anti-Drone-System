@echo off
echo ========================================================
echo SIH26050: Python Hardware Bridge (WebSocket - Serial)
echo ========================================================
echo Starting Python bridge on ws://localhost:8765 ...
python "%~dp0bridge.py" %*
pause
