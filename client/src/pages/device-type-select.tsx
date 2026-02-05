import { useLocation } from "wouter";
import { useDeviceContext } from "@/lib/device-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Monitor, Tv, Smartphone, Maximize, Minimize } from "lucide-react";
import { useFullscreen } from "@/hooks/use-fullscreen";

export default function DeviceTypeSelectPage() {
  const [, navigate] = useLocation();
  const { setDeviceTypeOnly, deviceType, hasExplicitDeviceType } = useDeviceContext();
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreen();

  // If device type is already explicitly set, redirect to appropriate page
  if (hasExplicitDeviceType && deviceType) {
    if (deviceType === "kds") {
      navigate("/kds");
      return null;
    } else {
      navigate("/login");
      return null;
    }
  }

  const handleSelectPOS = () => {
    setDeviceTypeOnly("pos");
    navigate("/login");
  };

  const handleSelectKDS = () => {
    setDeviceTypeOnly("kds");
    navigate("/kds");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {fullscreenSupported && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            data-testid="button-fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
        )}
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Smartphone className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-xl font-semibold" data-testid="text-device-type-title">
            Device Setup
          </CardTitle>
          <CardDescription>
            What type of device is this? This setting will be remembered for future use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center gap-3 hover-elevate"
              onClick={handleSelectPOS}
              data-testid="button-select-pos"
            >
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Monitor className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center">
                <div className="font-semibold">POS Terminal</div>
                <div className="text-xs text-muted-foreground mt-1">
                  For taking orders and processing payments
                </div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center gap-3 hover-elevate"
              onClick={handleSelectKDS}
              data-testid="button-select-kds"
            >
              <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center">
                <Tv className="w-6 h-6 text-orange-500" />
              </div>
              <div className="text-center">
                <div className="font-semibold">Kitchen Display (KDS)</div>
                <div className="text-xs text-muted-foreground mt-1">
                  For displaying orders in the kitchen
                </div>
              </div>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center pt-4">
            This device will be locked to the selected mode. To change later, clear the device settings from the admin panel.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
