@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe

echo [1/2] Generating multi-resolution Antigravity app icons...
"%CSC%" /nologo /optimize+ /r:System.Drawing.dll /out:desktop\GenerateIcons.exe desktop\GenerateIcons.cs
if errorlevel 1 exit /b 1
desktop\GenerateIcons.exe static
if errorlevel 1 exit /b 1
del /q desktop\GenerateIcons.exe >nul 2>&1

echo [2/2] Compiling AntigravityStudio.exe (Frameless Win11 WebView2 App)...
"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /win32icon:static\icon.ico /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:desktop\lib\Microsoft.Web.WebView2.Core.dll /r:desktop\lib\Microsoft.Web.WebView2.WinForms.dll /out:AntigravityStudio.exe desktop\AntigravityStudioLauncher.cs
if errorlevel 1 exit /b 1

copy /y desktop\AntigravityStudio.exe.config AntigravityStudio.exe.config >nul
if errorlevel 1 exit /b 1

echo Build succeeded: %CD%\AntigravityStudio.exe
