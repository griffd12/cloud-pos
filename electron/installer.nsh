!macro customInstall
  ; Create POS Mode shortcut on desktop
  CreateShortCut "$DESKTOP\Cloud POS.lnk" "$INSTDIR\Cloud POS.exe" "--pos" "$INSTDIR\Cloud POS.exe" 0
  
  ; Create KDS Mode shortcut on desktop
  CreateShortCut "$DESKTOP\Cloud KDS.lnk" "$INSTDIR\Cloud POS.exe" "--kds" "$INSTDIR\Cloud POS.exe" 0
  
  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\Cloud POS"
  CreateShortCut "$SMPROGRAMS\Cloud POS\Cloud POS.lnk" "$INSTDIR\Cloud POS.exe" "--pos" "$INSTDIR\Cloud POS.exe" 0
  CreateShortCut "$SMPROGRAMS\Cloud POS\Cloud KDS.lnk" "$INSTDIR\Cloud POS.exe" "--kds" "$INSTDIR\Cloud POS.exe" 0
  CreateShortCut "$SMPROGRAMS\Cloud POS\Cloud POS (Kiosk).lnk" "$INSTDIR\Cloud POS.exe" "--pos --kiosk" "$INSTDIR\Cloud POS.exe" 0
  CreateShortCut "$SMPROGRAMS\Cloud POS\Cloud KDS (Kiosk).lnk" "$INSTDIR\Cloud POS.exe" "--kds --kiosk" "$INSTDIR\Cloud POS.exe" 0

  ; Create data directories for offline database and print agent
  CreateDirectory "$LOCALAPPDATA\Cloud POS\config"
  CreateDirectory "$LOCALAPPDATA\Cloud POS\data"
  
  ; Set auto-launch in Windows registry (POS mode by default)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CloudPOS" '"$INSTDIR\Cloud POS.exe" --pos'
  
  ; Write uninstall info for Windows Add/Remove Programs
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "DisplayName" "Cloud POS"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "UninstallString" '"$INSTDIR\Uninstall Cloud POS.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "DisplayIcon" "$INSTDIR\Cloud POS.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "Publisher" "Cloud POS Systems"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS" "NoRepair" 1
  
  ; Add Windows Firewall exception for print agent TCP communication
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Cloud POS Print Agent" dir=out action=allow protocol=tcp remoteport=9100 program="$INSTDIR\Cloud POS.exe"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Cloud POS Print Agent Inbound" dir=in action=allow protocol=tcp localport=9100 program="$INSTDIR\Cloud POS.exe"'
!macroend

!macro customUnInstall
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
  
  ; Remove uninstall registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\CloudPOS"
  
  ; Remove firewall rules
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Cloud POS Print Agent"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Cloud POS Print Agent Inbound"'
!macroend
