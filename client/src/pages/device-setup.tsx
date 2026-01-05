import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useDeviceContext } from "@/lib/device-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monitor, ChefHat, ArrowRight, Settings } from "lucide-react";

interface Property {
  id: string;
  name: string;
}

interface Workstation {
  id: string;
  name: string;
  propertyId: string;
}

interface KdsDevice {
  id: string;
  name: string;
  stationType: string;
  propertyId: string;
}

export default function DeviceSetupPage() {
  const [, navigate] = useLocation();
  const { configureAsPos, configureAsKds } = useDeviceContext();
  
  const [step, setStep] = useState<"choose" | "pos-setup" | "kds-setup">("choose");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: workstations = [] } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations"],
    enabled: step === "pos-setup",
  });

  const { data: kdsDevices = [] } = useQuery<KdsDevice[]>({
    queryKey: ["/api/kds-devices"],
    enabled: step === "kds-setup",
  });

  const filteredWorkstations = selectedPropertyId
    ? workstations.filter(w => w.propertyId === selectedPropertyId)
    : workstations;

  const filteredKdsDevices = selectedPropertyId
    ? kdsDevices.filter(d => d.propertyId === selectedPropertyId)
    : kdsDevices;

  const handlePosSetup = () => {
    const workstation = workstations.find(w => w.id === selectedDeviceId);
    if (workstation) {
      configureAsPos(workstation.id, workstation.name);
      navigate("/login");
    }
  };

  const handleKdsSetup = () => {
    const device = kdsDevices.find(d => d.id === selectedDeviceId);
    if (device) {
      configureAsKds(device.id, device.name);
      navigate("/kds");
    }
  };

  if (step === "choose") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-6">
          <div className="text-center space-y-2">
            <Settings className="w-12 h-12 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-bold" data-testid="text-device-setup-title">Device Setup</h1>
            <p className="text-muted-foreground">
              Configure this device for your restaurant
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card 
              className="cursor-pointer hover-elevate"
              onClick={() => setStep("pos-setup")}
              data-testid="card-choose-pos"
            >
              <CardHeader className="text-center pb-2">
                <Monitor className="w-16 h-16 mx-auto text-primary mb-2" />
                <CardTitle>POS Workstation</CardTitle>
                <CardDescription>
                  Front-of-house terminal for taking orders and processing payments
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button className="w-full" variant="outline">
                  Set Up as POS
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover-elevate"
              onClick={() => setStep("kds-setup")}
              data-testid="card-choose-kds"
            >
              <CardHeader className="text-center pb-2">
                <ChefHat className="w-16 h-16 mx-auto text-orange-500 mb-2" />
                <CardTitle>Kitchen Display</CardTitle>
                <CardDescription>
                  Kitchen or bar display for viewing and managing orders
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button className="w-full" variant="outline">
                  Set Up as KDS
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (step === "pos-setup") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Monitor className="w-6 h-6 text-primary" />
              <CardTitle>POS Workstation Setup</CardTitle>
            </div>
            <CardDescription>
              Select which workstation this device will operate as
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {properties.length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Property</label>
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger data-testid="select-property">
                    <SelectValue placeholder="Select property..." />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Workstation</label>
              <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                <SelectTrigger data-testid="select-workstation">
                  <SelectValue placeholder="Select workstation..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredWorkstations.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setStep("choose");
                  setSelectedDeviceId("");
                }}
                data-testid="button-back"
              >
                Back
              </Button>
              <Button 
                className="flex-1"
                disabled={!selectedDeviceId}
                onClick={handlePosSetup}
                data-testid="button-confirm-pos"
              >
                Confirm Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "kds-setup") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ChefHat className="w-6 h-6 text-orange-500" />
              <CardTitle>Kitchen Display Setup</CardTitle>
            </div>
            <CardDescription>
              Select which KDS station this display will show
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {properties.length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Property</label>
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger data-testid="select-property-kds">
                    <SelectValue placeholder="Select property..." />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">KDS Station</label>
              <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                <SelectTrigger data-testid="select-kds-device">
                  <SelectValue placeholder="Select KDS station..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredKdsDevices.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.stationType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setStep("choose");
                  setSelectedDeviceId("");
                }}
                data-testid="button-back-kds"
              >
                Back
              </Button>
              <Button 
                className="flex-1"
                disabled={!selectedDeviceId}
                onClick={handleKdsSetup}
                data-testid="button-confirm-kds"
              >
                Confirm Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
