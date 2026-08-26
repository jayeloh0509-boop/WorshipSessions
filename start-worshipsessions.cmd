@echo off
rem Run the supervised WorshipSessions launcher for the Windows Scheduled Task.
rem The PowerShell process stays attached to the task and restarts Node after a crash.
cd /d "C:\Users\jayel\WorshipSessions"
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\jayel\WorshipSessions\scripts\run-worshipsessions.ps1"
