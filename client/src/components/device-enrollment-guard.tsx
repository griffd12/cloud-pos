import { useDeviceEnrollment } from "@/hooks/use-device-enrollment";
import { Loader2, ShieldX, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface DeviceEnrollmentGuardProps {
  children: React.ReactNode;
  requiredDeviceType?: "pos_workstation" | "kds_display";
}

export function DeviceEnrollmentGuard({ 
  children, 
  requiredDeviceType 
}: DeviceEnrollmentGuardProps) {
  const { isEnrolled, isValidating, deviceInfo, error, validateEnrollment } = useDeviceEnrollment();

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

            <div className="bg-muted/50 rounded-lg p-4 text-left text-sm space-y-2">
              <p className="font-medium">To enroll this device:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Open the CAL Setup Wizard on this device</li>
                <li>Log in with EMC administrator credentials</li>
                <li>Select the property and workstation/KDS</li>
                <li>Complete the setup process</li>
              </ol>
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
                className="flex-1"
                onClick={() => window.location.href = "/cal-setup-wizard/index.html"}
                data-testid="button-open-wizard"
              >
                <Laptop className="h-4 w-4 mr-2" />
                Run Setup Wizard
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
