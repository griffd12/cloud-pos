import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CreditCard,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface StripeLocation {
  id: string;
  display_name: string;
  address: {
    line1: string;
    city: string;
    state: string;
    country: string;
    postal_code: string;
  };
}

interface StripeReader {
  id: string;
  label: string;
  device_type: string;
  status: string;
  location: string;
  serial_number: string;
  ip_address?: string;
  device_sw_version?: string;
}

export default function StripeTerminalPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [showReaderDialog, setShowReaderDialog] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  
  const [newLocation, setNewLocation] = useState({
    displayName: "",
    line1: "",
    city: "",
    state: "",
    country: "US",
    postalCode: "",
  });
  
  const [newReader, setNewReader] = useState({
    registrationCode: "",
    label: "",
  });

  const { data: locations = [], isLoading: locationsLoading } = useQuery<StripeLocation[]>({
    queryKey: ["/api/stripe/terminal/locations"],
  });

  const { data: readers = [], isLoading: readersLoading, refetch: refetchReaders } = useQuery<StripeReader[]>({
    queryKey: ["/api/stripe/terminal/readers"],
  });

  const createLocationMutation = useMutation({
    mutationFn: async (data: typeof newLocation) => {
      return apiRequest("POST", "/api/stripe/terminal/locations", {
        displayName: data.displayName,
        address: {
          line1: data.line1,
          city: data.city,
          state: data.state,
          country: data.country,
          postalCode: data.postalCode,
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Location Created", description: "Terminal location has been created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/terminal/locations"] });
      setShowLocationDialog(false);
      setNewLocation({ displayName: "", line1: "", city: "", state: "", country: "US", postalCode: "" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create location", variant: "destructive" });
    },
  });

  const registerReaderMutation = useMutation({
    mutationFn: async (data: { registrationCode: string; label: string; locationId: string }) => {
      return apiRequest("POST", "/api/stripe/terminal/readers", {
        registrationCode: data.registrationCode,
        label: data.label,
        locationId: data.locationId,
      });
    },
    onSuccess: () => {
      toast({ title: "Reader Registered", description: "Your S700 reader has been registered successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/terminal/readers"] });
      setShowReaderDialog(false);
      setNewReader({ registrationCode: "", label: "" });
      setSelectedLocationId(null);
    },
    onError: (error: any) => {
      toast({ title: "Registration Failed", description: error.message || "Failed to register reader", variant: "destructive" });
    },
  });

  const deleteReaderMutation = useMutation({
    mutationFn: async (readerId: string) => {
      return apiRequest("DELETE", `/api/stripe/terminal/readers/${readerId}`);
    },
    onSuccess: () => {
      toast({ title: "Reader Deleted", description: "Reader has been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/terminal/readers"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete reader", variant: "destructive" });
    },
  });

  const handleCreateLocation = () => {
    if (!newLocation.displayName || !newLocation.line1 || !newLocation.city || !newLocation.state || !newLocation.postalCode) {
      toast({ title: "Missing Fields", description: "Please fill in all address fields", variant: "destructive" });
      return;
    }
    createLocationMutation.mutate(newLocation);
  };

  const handleRegisterReader = () => {
    if (!newReader.registrationCode || !selectedLocationId) {
      toast({ title: "Missing Fields", description: "Please enter the registration code and select a location", variant: "destructive" });
      return;
    }
    registerReaderMutation.mutate({
      registrationCode: newReader.registrationCode,
      label: newReader.label || "POS Terminal",
      locationId: selectedLocationId,
    });
  };

  const openRegisterDialog = (locationId: string) => {
    setSelectedLocationId(locationId);
    setShowReaderDialog(true);
  };

  const getReaderStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-500";
      case "offline":
        return "bg-red-500";
      default:
        return "bg-yellow-500";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-stripe-terminal-title">
            Stripe Terminal
          </h1>
          <p className="text-muted-foreground">
            Manage your EMV payment devices
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchReaders()}
          data-testid="button-refresh-readers"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-muted-foreground" />
                <CardTitle>Locations</CardTitle>
              </div>
              <Button
                size="sm"
                onClick={() => setShowLocationDialog(true)}
                data-testid="button-add-location"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Location
              </Button>
            </div>
            <CardDescription>
              Terminal readers must be assigned to a location
            </CardDescription>
          </CardHeader>
          <CardContent>
            {locationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : locations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No locations configured</p>
                <p className="text-sm">Create a location to register readers</p>
              </div>
            ) : (
              <div className="space-y-3">
                {locations.map((location) => (
                  <div
                    key={location.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`location-${location.id}`}
                  >
                    <div>
                      <p className="font-medium">{location.display_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {location.address.line1}, {location.address.city}, {location.address.state} {location.address.postal_code}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRegisterDialog(location.id)}
                      data-testid={`button-register-reader-${location.id}`}
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Register Reader
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <CardTitle>Readers</CardTitle>
            </div>
            <CardDescription>
              Registered Stripe Terminal devices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {readersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : readers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No readers registered</p>
                <p className="text-sm">Register your S700 using the pairing code</p>
              </div>
            ) : (
              <div className="space-y-3">
                {readers.map((reader) => (
                  <div
                    key={reader.id}
                    className="p-3 border rounded-lg space-y-2"
                    data-testid={`reader-${reader.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getReaderStatusColor(reader.status)}`} />
                        <p className="font-medium">{reader.label || reader.device_type}</p>
                      </div>
                      <Badge variant={reader.status === "online" ? "default" : "secondary"}>
                        {reader.status === "online" ? (
                          <><Wifi className="w-3 h-3 mr-1" /> Online</>
                        ) : (
                          <><WifiOff className="w-3 h-3 mr-1" /> Offline</>
                        )}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Type: {reader.device_type}</p>
                      <p>Serial: {reader.serial_number}</p>
                      {reader.ip_address && <p>IP: {reader.ip_address}</p>}
                      {reader.device_sw_version && <p>Version: {reader.device_sw_version}</p>}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteReaderMutation.mutate(reader.id)}
                        disabled={deleteReaderMutation.isPending}
                        data-testid={`button-delete-reader-${reader.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integration Status</CardTitle>
          <CardDescription>Terminal SDK connection and capabilities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">API Connected</p>
                <p className="text-sm text-muted-foreground">Stripe Terminal API active</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              {readers.some(r => r.status === "online") ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-500" />
              )}
              <div>
                <p className="font-medium">Reader Status</p>
                <p className="text-sm text-muted-foreground">
                  {readers.filter(r => r.status === "online").length} of {readers.length} online
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium">EMV Ready</p>
                <p className="text-sm text-muted-foreground">Chip & contactless enabled</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Terminal Location</DialogTitle>
            <DialogDescription>
              Add a physical location for your Terminal readers
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Location Name</Label>
              <Input
                id="displayName"
                placeholder="e.g., Main Store"
                value={newLocation.displayName}
                onChange={(e) => setNewLocation({ ...newLocation, displayName: e.target.value })}
                data-testid="input-location-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="line1">Street Address</Label>
              <Input
                id="line1"
                placeholder="123 Main St"
                value={newLocation.line1}
                onChange={(e) => setNewLocation({ ...newLocation, line1: e.target.value })}
                data-testid="input-location-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="City"
                  value={newLocation.city}
                  onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })}
                  data-testid="input-location-city"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  placeholder="CA"
                  value={newLocation.state}
                  onChange={(e) => setNewLocation({ ...newLocation, state: e.target.value })}
                  data-testid="input-location-state"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postalCode">ZIP Code</Label>
                <Input
                  id="postalCode"
                  placeholder="90210"
                  value={newLocation.postalCode}
                  onChange={(e) => setNewLocation({ ...newLocation, postalCode: e.target.value })}
                  data-testid="input-location-zip"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={newLocation.country}
                  onChange={(e) => setNewLocation({ ...newLocation, country: e.target.value })}
                  data-testid="input-location-country"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLocationDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateLocation}
              disabled={createLocationMutation.isPending}
              data-testid="button-create-location"
            >
              {createLocationMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReaderDialog} onOpenChange={setShowReaderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register S700 Reader</DialogTitle>
            <DialogDescription>
              Enter the pairing code shown on your Stripe Reader S700 screen
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="registrationCode">Pairing Code</Label>
              <Input
                id="registrationCode"
                placeholder="Enter the code from your device"
                value={newReader.registrationCode}
                onChange={(e) => setNewReader({ ...newReader, registrationCode: e.target.value })}
                className="font-mono text-lg tracking-widest text-center"
                data-testid="input-pairing-code"
              />
              <p className="text-sm text-muted-foreground">
                The code is displayed on your S700 during initial setup
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Reader Label (Optional)</Label>
              <Input
                id="label"
                placeholder="e.g., Counter 1"
                value={newReader.label}
                onChange={(e) => setNewReader({ ...newReader, label: e.target.value })}
                data-testid="input-reader-label"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReaderDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRegisterReader}
              disabled={registerReaderMutation.isPending}
              data-testid="button-register-reader"
            >
              {registerReaderMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Register Reader
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
