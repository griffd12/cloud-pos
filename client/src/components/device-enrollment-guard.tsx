import { useState } from "react";
import { useDeviceEnrollment } from "@/hooks/use-device-enrollment";
import { useDeviceContext } from "@/lib/device-context";
import { Loader2, ShieldX, Laptop, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DeviceEnrollmentGuardProps {
  children: React.ReactNode;
  requiredDeviceType?: "pos_workstation" | "kds_display";
}

export function DeviceEnrollmentGuard({ 
  children, 
  requiredDeviceType 
}: DeviceEnrollmentGuardProps) {
  const { isEnrolled, isValidating, deviceInfo, error, validateEnrollment } = useDeviceEnrollment();
  const { enrollDevice } = useDeviceContext();
  const { toast } = useToast();
  const [claimCode, setClaimCode] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const handleClaim = async () => {
    if (claimCode.length !== 6) {
      setClaimError("Please enter a 6-digit claim code");
      return;
    }
    
    setIsClaiming(true);
    setClaimError(null);
    
    try {
      const response = await apiRequest("POST", "/api/cal-setup/claim", { claimCode });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Failed to claim device");
      }
      
      enrollDevice(data.deviceToken, {
        id: data.registeredDeviceId,
        name: data.deviceName,
        deviceType: data.deviceType,
        propertyId: data.propertyId,
        workstationId: data.deviceType === "pos_workstation" ? data.deviceId : null,
        kdsDeviceId: data.deviceType === "kds_display" ? data.deviceId : null,
        status: "enrolled",
      });
      
      toast({
        title: "Device Enrolled",
        description: `Successfully enrolled as ${data.deviceName}`,
      });
      
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (err: any) {
      setClaimError(err.message || "Invalid or expired claim code");
    } finally {
      setIsClaiming(false);
    }
  };

  if (isValidating) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background" data-testid="device-validating">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Validating device enrollment...</p>
        </div>
      </div>
    );
  }

  if (!isEnrolled || error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4" data-testid="device-not-enrolled">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldX className="h-8 w-8 text-destructive" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Device Not Enrolled</h1>
              <p className="text-muted-foreground text-sm">
                {error || "This device is not authorized to access the POS system."}
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 text-left space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Have a claim code?</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter the 6-digit code shown in the CAL Setup Wizard
                </p>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="000000"
                    value={claimCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setClaimCode(val);
                      setClaimError(null);
                    }}
                    className="font-mono text-center text-lg tracking-widest"
                    maxLength={6}
                    data-testid="input-claim-code"
                  />
                  <Button 
                    onClick={handleClaim} 
                    disabled={isClaiming || claimCode.length !== 6}
                    data-testid="button-claim-device"
                  >
                    {isClaiming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim"}
                  </Button>
                </div>
                {claimError && (
                  <p className="text-xs text-destructive">{claimError}</p>
                )}
              </div>
              
              <div className="border-t pt-4 space-y-2">
                <p className="font-medium text-sm">No claim code?</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
                  <li>Download the CAL Setup Wizard</li>
                  <li>Log in with EMC administrator credentials</li>
                  <li>Select the property and workstation/KDS</li>
                  <li>Complete setup to get your claim code</li>
                </ol>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => validateEnrollment()}
                data-testid="button-retry-validation"
              >
                Retry Validation
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  alert("The CAL Setup Wizard is a desktop application.\n\nPlease download and run it on this device to complete enrollment.\n\nContact your system administrator for the wizard installer.");
                }}
                data-testid="button-wizard-help"
              >
                <Laptop className="h-4 w-4 mr-2" />
                Get Wizard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (requiredDeviceType && deviceInfo?.deviceType !== requiredDeviceType) {
    const expected = requiredDeviceType === "pos_workstation" ? "POS Workstation" : "KDS Display";
    const actual = deviceInfo?.deviceType === "pos_workstation" ? "POS Workstation" : "KDS Display";
    
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4" data-testid="device-type-mismatch">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
              <ShieldX className="h-8 w-8 text-warning" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Wrong Device Type</h1>
              <p className="text-muted-foreground text-sm">
                This device is enrolled as a <strong>{actual}</strong>, 
                but this page requires a <strong>{expected}</strong>.
              </p>
            </div>

            <Button
              onClick={() => {
                if (deviceInfo?.deviceType === "pos_workstation") {
                  window.location.href = "/pos";
                } else {
                  window.location.href = "/kds";
                }
              }}
              data-testid="button-go-to-correct-page"
            >
              Go to {actual}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
