@echo off
rem Launch WorshipSessions on http://127.0.0.1:3001 (config in .env)
rem Runs node hidden/detached so a Scheduled Task can fire-and-forget this at logon.
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory 'C:\Users\jayel\WorshipSessions' -WindowStyle Hidden"
