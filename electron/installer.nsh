!macro customInstall
  ; Force shell variable context to current user (not elevated admin)
  ; This ensures $LOCALAPPDATA resolves to the logged-in user's path
  ; even when the installer runs with admin elevation
  SetShellVarContext current

  ; Initialize installer log
  CreateDirectory "$LOCALAPPDATA\Cloud POS\logs"
  FileOpen $0 "$LOCALAPPDATA\Cloud POS\logs\installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "$\r$\n================================================================================$\r$\n"
  FileWrite $0 "  CLOUD POS INSTALLER - INSTALL LOG$\r$\n"
  FileWrite $0 "  Install Directory: $INSTDIR$\r$\n"
  FileWrite $0 "================================================================================$\r$\n"
  FileClose $0

  ; Create POS Mode shortcut on desktop
  CreateShortCut "$DESKTOP\Cloud POS.lnk" "$INSTDIR\Cloud POS.exe" "--pos" "$INSTDIR\Cloud POS.exe" 0
  FileOpen $0 "$LOCALAPPDATA\Cloud POS\logs\installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "[OK] Desktop shortcut created: Cloud POS.lnk$\r$\n"
  FileClose $0
  
  ; Create KDS Mode shortcut on desktop
  CreateShortCut "$DESKTOP\Cloud KDS.lnk" "$INSTDIR\Cloud POS.exe" "--kds" "$INSTDIR\Cloud POS.exe" 0
  FileOpen $0 "$LOCALAPPDATA\Cloud POS\logs\installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "[OK] Desktop shortcut created: Cloud KDS.lnk$\r$\n"
  FileClose $0
  
  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\Cloud POS"
  CreateShortCut "$SMPROGRAMS\Cloud POS\Cloud POS.lnk" "$INSTDIR\Cloud POS.exe" "--pos" "$INSTDIR\Cloud POS.exe" 0
  CreateShortCut "$SMPROGRAMS\Cloud POS\Cloud KDS.lnk" "$INSTDIR\Cloud POS.exe" "--kds" "$INSTDIR\Cloud POS.exe" 0
  CreateShortCut "$SMPROGRAMS\Cloud POS\Cloud POS (Kiosk).lnk" "$INSTDIR\Cloud POS.exe" "--pos --kiosk" "$INSTDIR\Cloud POS.exe" 0
  CreateShortCut "$SMPROGRAMS\Cloud POS\Cloud KDS (Kiosk).lnk" "$INSTDIR\Cloud POS.exe" "--kds --kiosk" "$INSTDIR\Cloud POS.exe" 0
  FileOpen $0 "$LOCALAPPDATA\Cloud POS\logs\installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "[OK] Start Menu shortcuts created (POS, KDS, POS Kiosk, KDS Kiosk)$\r$\n"
  FileClose $0

  ; Create data directories for offline database and print agent
  CreateDirectory "$LOCALAPPDATA\Cloud POS\config"
  CreateDirectory "$LOCALAPPDATA\Cloud POS\data"
  FileOpen $0 "$LOCALAPPDATA\Cloud POS\logs\installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "[OK] Data directories created: config, data, logs$\r$\n"
  FileClose $0
  
  ; Set auto-launch in Windows registry for the current user (HKCU stays in current context)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CloudPOS" '"$INSTDIR\Cloud POS.exe" --pos'
  FileOpen $0 "$LOCALAPPDATA\Cloud POS\logs\installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "[OK] Auto-launch registry entry set (HKCU\Run\CloudPOS)$\r$\n"
  FileClose $0
  
  ; Switch to all-users context only for machine-wide HKLM registry entries
  SetShellVarContext all

  ; Write uninstall info for Windows Add/Remove Programs
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "DisplayName" "Cloud POS"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "UninstallString" '"$INSTDIR\Uninstall Cloud POS.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "DisplayIcon" "$INSTDIR\Cloud POS.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "Publisher" "Cloud POS Systems"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "NoRepair" 1

  ; Switch back to current user context for logging and remaining operations
  SetShellVarContext current

  FileOpen $0 "$LOCALAPPDATA\Cloud POS\logs\installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "[OK] Windows Add/Remove Programs registry entries written$\r$\n"
  FileClose $0
  
  ; Add Windows Firewall exception for print agent TCP communication
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Cloud POS Print Agent" dir=out action=allow protocol=tcp remoteport=9100 program="$INSTDIR\Cloud POS.exe"'
  Pop $1
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Cloud POS Print Agent Inbound" dir=in action=allow protocol=tcp localport=9100 program="$INSTDIR\Cloud POS.exe"'
  Pop $2
  FileOpen $0 "$LOCALAPPDATA\Cloud POS\logs\installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "[OK] Firewall rules added (outbound port 9100 result: $1, inbound port 9100 result: $2)$\r$\n"
  FileWrite $0 "================================================================================$\r$\n"
  FileWrite $0 "  INSTALLATION COMPLETE$\r$\n"
  FileWrite $0 "  Install Path: $INSTDIR$\r$\n"
  FileWrite $0 "  Data Path: $LOCALAPPDATA\Cloud POS$\r$\n"
  FileWrite $0 "  Log Path: $LOCALAPPDATA\Cloud POS\logs$\r$\n"
  FileWrite $0 "================================================================================$\r$\n"
  FileClose $0
!macroend

!macro customUnInstall
  ; Force current user context for correct path resolution
  SetShellVarContext current

  ; Log uninstall start
  FileOpen $0 "$LOCALAPPDATA\Cloud POS\logs\installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "$\r$\n================================================================================$\r$\n"
  FileWrite $0 "  CLOUD POS INSTALLER - UNINSTALL LOG$\r$\n"
  FileWrite $0 "================================================================================$\r$\n"
  FileClose $0

  ; Remove desktop shortcuts
  Delete "$DESKTOP\Cloud POS.lnk"
  Delete "$DESKTOP\Cloud KDS.lnk"
  
  ; Remove Start Menu shortcuts
  Delete "$SMPROGRAMS\Cloud POS\Cloud POS.lnk"
  Delete "$SMPROGRAMS\Cloud POS\Cloud KDS.lnk"
  Delete "$SMPROGRAMS\Cloud POS\Cloud POS (Kiosk).lnk"
  Delete "$SMPROGRAMS\Cloud POS\Cloud KDS (Kiosk).lnk"
  RMDir "$SMPROGRAMS\Cloud POS"
  
  ; Remove auto-launch registry entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CloudPOS"
  
  ; Switch to all-users context for machine-wide registry cleanup
  SetShellVarContext all

  ; Remove uninstall registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS"
  
  ; Remove firewall rules
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Cloud POS Print Agent"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Cloud POS Print Agent Inbound"'

  ; Switch back to current user for logging
  SetShellVarContext current

  ; Log uninstall complete
  FileOpen $0 "$LOCALAPPDATA\Cloud POS\logs\installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "[OK] Shortcuts removed$\r$\n"
  FileWrite $0 "[OK] Registry entries removed$\r$\n"
  FileWrite $0 "[OK] Firewall rules removed$\r$\n"
  FileWrite $0 "  UNINSTALL COMPLETE$\r$\n"
  FileWrite $0 "================================================================================$\r$\n"
  FileClose $0
!macroend
