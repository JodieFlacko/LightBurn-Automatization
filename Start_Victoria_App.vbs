' Victoria Laser App - Silent Launcher
' Launches the app with the terminal completely hidden in the background

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Build the path to the PowerShell script
psScript = scriptDir & "\Start_Victoria_App.ps1"

' Launch PowerShell script with hidden window
' -ExecutionPolicy Bypass allows the script to run without policy restrictions
' -WindowStyle Hidden keeps it completely invisible
' -File specifies the script to run
command = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """"
WshShell.Run command, 0, False
