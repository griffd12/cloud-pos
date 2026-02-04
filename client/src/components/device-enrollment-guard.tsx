/**
 * DeviceEnrollmentGuard - SECURITY DISABLED
 * 
 * This component previously required device enrollment via CAL Setup Wizard.
 * Security features have been disabled - all devices now have unrestricted access.
 * The component is now a simple pass-through that renders children directly.
 */

interface DeviceEnrollmentGuardProps {
  children: React.ReactNode;
  requiredDeviceType?: "pos_workstation" | "kds_display";
}

export function DeviceEnrollmentGuard({ 
  children, 
}: DeviceEnrollmentGuardProps) {
  // Security disabled - always render children without any validation
  return <>{children}</>;
}
