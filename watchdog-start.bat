@echo off
REM 9router Protocol Killer — Watchdog Active Script (Windows)
REM Background me watchdog chalata hai, har 30s check karta hai
REM Double-click karo aur bhul jao — apne aap kaam karega

title 9router Protocol Killer (Watchdog Active)
cd /d "C:\Users\Unkno\9router-protocal-killer"

echo =============================================
echo  9router Protocol Killer v2 — Watchdog Active
echo =============================================
echo.
echo Mode: SAFE CLEAN (files preserve, sirf protocol hatega)
echo.
echo Watchdog ab background me chal raha hai...
echo Har 30 second me sab files check karega.
echo.
echo Is window ko band mat karo — minimise kar do.
echo Band karoge to watchdog band ho jayega.
echo.
echo =============================================

node watchdog.js --watch
pause
