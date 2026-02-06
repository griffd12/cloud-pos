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
!macroend
