@echo off
echo ================================================================
echo  SIH26050 STM32 Firmware Serial Verification Test
echo ================================================================
echo.
python firmware_serial_test.py %*
echo.
pause
