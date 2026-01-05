import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useDeviceContext } from "@/lib/device-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Monitor, Tv, Loader2, CheckCircle, AlertCircle, ArrowLeft, Key } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface EnrollmentResponse {
  success: boolean;
  deviceToken: string;
  device: {
    id: string;
    name: string;
    deviceType: string;
    propertyId: string;
    workstationId?: string | null;
    kdsDeviceId?: string | null;
    status: string;
  };
}

function getDeviceInfo() {
  return {
    osInfo: navigator.platform || "Unknown",
    browserInfo: navigator.userAgent,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    ipAddress: null,
  };
}

export default function DeviceSetupPage() {
  const [, navigate] = useLocation();
  const { enrollDevice, isConfigured, deviceType, deviceName, isValidating, validationError, clearDeviceConfig } = useDeviceContext();
  
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [enrollmentSuccess, setEnrollmentSuccess] = useState<EnrollmentResponse | null>(null);

  const enrollMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/registered-devices/enroll", {
        enrollmentCode: code.trim(),
        deviceInfo: getDeviceInfo(),
      });
      return response.json() as Promise<EnrollmentResponse>;
    },
    onSuccess: (data) => {
      if (data.success && data.deviceToken && data.device) {
        enrollDevice(data.deviceToken, data.device);
        setEnrollmentSuccess(data);
        setEnrollmentError(null);
      } else {
        setEnrollmentError("Enrollment failed. Please try again.");
      }
    },
    onError: (error: Error) => {
      setEnrollmentError(error.message || "Invalid or expired enrollment code");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (enrollmentCode.length !== 6) {
      setEnrollmentError("Please enter a 6-digit enrollment code");
      return;
    }
    setEnrollmentError(null);
    enrollMutation.mutate(enrollmentCode);
  };

  const handleContinue = () => {
    if (enrollmentSuccess?.device) {
      const deviceType = enrollmentSuccess.device.deviceType;
      if (deviceType === "kds_display") {
        navigate("/kds");
      } else {
        navigate("/login");
      }
    }
  };

  if (enrollmentSuccess) {
    const isKds = enrollmentSuccess.device.deviceType === "kds_display";
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle>Device Enrolled Successfully</CardTitle>
            <CardDescription>
              This device is now registered and ready to use
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                {isKds ? (
                  <Tv className="w-5 h-5 text-orange-500" />
                ) : (
                  <Monitor className="w-5 h-5 text-primary" />
                )}
                <span className="font-medium">{enrollmentSuccess.device.name}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Type: {isKds ? "Kitchen Display (KDS)" : "POS Workstation"}
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={handleContinue}
              data-testid="button-continue"
            >
              Continue to {isKds ? "Kitchen Display" : "Login"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isValidating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Validating device...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (validationError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>
            <CardTitle>Device Access Revoked</CardTitle>
            <CardDescription>
              {validationError}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              This device is no longer authorized to access the system. Please contact your administrator.
            </p>
            <Button 
              className="w-full" 
              variant="outline"
              onClick={clearDeviceConfig}
              data-testid="button-re-enroll"
            >
              <Key className="w-4 h-4 mr-2" />
              Re-enroll Device
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isConfigured && deviceType) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <CardTitle>Device Already Configured</CardTitle>
            <CardDescription>
              This device is already enrolled as a {deviceType === "kds" ? "Kitchen Display" : "POS Workstation"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                {deviceType === "kds" ? (
                  <Tv className="w-5 h-5 text-orange-500" />
                ) : (
                  <Monitor className="w-5 h-5 text-primary" />
                )}
                <span className="font-medium">{deviceName || "Unknown Device"}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline"
                className="flex-1"
                onClick={() => navigate(deviceType === "kds" ? "/kds" : "/login")}
                data-testid="button-continue-existing"
              >
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Key className="w-10 h-10 text-primary" />
          </div>
          <CardTitle data-testid="text-device-setup-title">Device Enrollment</CardTitle>
          <CardDescription>
            Enter the 6-digit enrollment code from your administrator
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Enrollment Code</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={enrollmentCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setEnrollmentCode(value);
                  setEnrollmentError(null);
                }}
                className="text-center text-2xl font-mono tracking-widest"
                autoComplete="off"
                autoFocus
                data-testid="input-enrollment-code"
              />
              <p className="text-xs text-muted-foreground text-center">
                Get this code from Admin &gt; Devices &gt; Registered Devices
              </p>
            </div>

            {enrollmentError && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span data-testid="text-error">{enrollmentError}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={enrollmentCode.length !== 6 || enrollMutation.isPending}
              data-testid="button-enroll"
            >
              {enrollMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enrolling...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Enroll Device
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Need an enrollment code?
              </p>
              <p className="text-xs text-muted-foreground">
                Contact your manager or administrator. They can generate a code from the Admin &gt; Registered Devices page.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
