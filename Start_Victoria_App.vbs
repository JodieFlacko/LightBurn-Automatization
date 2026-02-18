' Victoria Laser App - Silent Launcher
' Launches the app with the terminal completely hidden in the background

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Build the path to the batch file
batchFile = scriptDir & "\Start_Victoria_App.bat"

' Launch the batch file completely hidden
' Window style 0 = Hidden (no window shown at all)
WshShell.Run """" & batchFile & """", 0, False
