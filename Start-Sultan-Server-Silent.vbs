Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Launch node server.js completely hidden
WshShell.CurrentDirectory = strDir
WshShell.Run "node server.js", 0, False
