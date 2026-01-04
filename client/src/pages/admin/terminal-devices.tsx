import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertTerminalDeviceSchema, type TerminalDevice, type InsertTerminalDevice, type Property, type Workstation, type PaymentProcessor } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wifi, WifiOff, Loader2, CreditCard, RefreshCw } from "lucide-react";

const MODEL_LABELS: Record<string, string> = {
  pax_a920: "PAX A920",
  pax_s300: "PAX S300",
  verifone_vx520: "Verifone VX520",
  verifone_vx820: "Verifone VX820",
  verifone_p400: "Verifone P400",
  ingenico_lane_3000: "Ingenico Lane 3000",
  ingenico_lane_5000: "Ingenico Lane 5000",
  stripe_s700: "Stripe S700",
  stripe_m2: "Stripe M2",
  stripe_wisepos_e: "Stripe WisePOS E",
  bbpos_chipper: "BBPOS Chipper",
  generic: "Generic Terminal",
};

const CONNECTION_TYPE_LABELS: Record<string, string> = {
  ethernet: "Ethernet",
  wifi: "WiFi",
  usb: "USB",
  bluetooth: "Bluetooth",
  cloud: "Cloud",
};

const STATUS_COLORS: Record<string, string> = {
  online: "bg-green-600",
  offline: "bg-gray-500",
  busy: "bg-yellow-500",
  error: "bg-red-500",
  maintenance: "bg-blue-500",
};

export default function TerminalDevicesPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TerminalDevice | null>(null);

  const { data: devices = [], isLoading } = useQuery<TerminalDevice[]>({
    queryKey: ["/api/terminal-devices"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: workstations = [] } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations"],
  });

  const { data: processors = [] } = useQuery<PaymentProcessor[]>({
    queryKey: ["/api/payment-processors"],
  });

  const { data: metadata } = useQuery<{ models: string[]; connectionTypes: string[]; statuses: string[] }>({
    queryKey: ["/api/terminal-devices/metadata"],
  });

  const columns: Column<TerminalDevice>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "model",
      header: "Model",
      render: (value) => (
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          <span>{MODEL_LABELS[value as string] || value}</span>
        </div>
      ),
    },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "workstationId",
      header: "Workstation",
      render: (value) => workstations.find((w) => w.id === value)?.name || "-",
    },
    {
      key: "paymentProcessorId",
      header: "Processor",
      render: (value) => {
        const processor = processors.find((p) => p.id === value);
        return processor ? (
          <Badge variant="outline">{processor.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      key: "connectionType",
      header: "Connection",
      render: (value) => (
        <Badge variant="secondary">
          {CONNECTION_TYPE_LABELS[value as string] || value}
        </Badge>
      ),
    },
    { key: "networkAddress", header: "IP/Address" },
    {
      key: "status",
      header: "Status",
      render: (value, row) => {
        const statusLabel = (value as string || "offline").charAt(0).toUpperCase() + (value as string || "offline").slice(1);
        return (
          <div className="flex items-center gap-2">
            {value === "online" ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground" />
            )}
            <Badge className={STATUS_COLORS[value as string] || "bg-gray-500"}>
              {statusLabel}
            </Badge>
          </div>
        );
      },
    },
    {
      key: "active",
      header: "Active",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const form = useForm<InsertTerminalDevice>({
    resolver: zodResolver(insertTerminalDeviceSchema),
    defaultValues: {
      name: "",
      model: "generic",
      propertyId: "",
      workstationId: undefined,
      paymentProcessorId: undefined,
      serialNumber: "",
      terminalId: "",
      connectionType: "ethernet",
      networkAddress: "",
      port: undefined,
      cloudDeviceId: "",
      status: "offline",
      capabilities: { contactless: true, chip: true, swipe: true, pinDebit: true },
      active: true,
    },
  });

  const selectedPropertyId = form.watch("propertyId");
  const connectionType = form.watch("connectionType");

  const filteredWorkstations = useMemo(() => {
    if (!selectedPropertyId) return workstations;
    return workstations.filter((w) => w.propertyId === selectedPropertyId);
  }, [selectedPropertyId, workstations]);

  const filteredProcessors = useMemo(() => {
    if (!selectedPropertyId) return processors;
    return processors.filter((p) => p.propertyId === selectedPropertyId);
  }, [selectedPropertyId, processors]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertTerminalDevice) => {
      const response = await apiRequest("POST", "/api/terminal-devices", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices"] });
      setFormOpen(false);
      toast({ title: "Terminal device created" });
    },
    onError: () => {
      toast({ title: "Failed to create terminal device", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: TerminalDevice) => {
      const response = await apiRequest("PATCH", "/api/terminal-devices/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Terminal device updated" });
    },
    onError: () => {
      toast({ title: "Failed to update terminal device", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/terminal-devices/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices"] });
      toast({ title: "Terminal device deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete terminal device", variant: "destructive" });
    },
  });

  const pingMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/terminal-devices/${id}/heartbeat`, { status: "online" });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminal-devices"] });
      toast({ title: "Terminal pinged successfully" });
    },
    onError: () => {
      toast({ title: "Failed to ping terminal", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (editingItem) {
      form.reset({
        name: editingItem.name,
        model: editingItem.model,
        propertyId: editingItem.propertyId,
        workstationId: editingItem.workstationId || undefined,
        paymentProcessorId: editingItem.paymentProcessorId || undefined,
        serialNumber: editingItem.serialNumber || "",
        terminalId: editingItem.terminalId || "",
        connectionType: editingItem.connectionType || "ethernet",
        networkAddress: editingItem.networkAddress || "",
        port: editingItem.port || undefined,
        cloudDeviceId: editingItem.cloudDeviceId || "",
        status: editingItem.status || "offline",
        capabilities: (editingItem.capabilities as any) || { contactless: true, chip: true, swipe: true, pinDebit: true },
        active: editingItem.active ?? true,
      });
    } else {
      form.reset({
        name: "",
        model: "generic",
        propertyId: "",
        workstationId: undefined,
        paymentProcessorId: undefined,
        serialNumber: "",
        terminalId: "",
        connectionType: "ethernet",
        networkAddress: "",
        port: undefined,
        cloudDeviceId: "",
        status: "offline",
        capabilities: { contactless: true, chip: true, swipe: true, pinDebit: true },
        active: true,
      });
    }
  }, [editingItem, form]);

  const onSubmit = (data: InsertTerminalDevice) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Terminal Devices</h1>
          <p className="text-muted-foreground">Manage EMV card readers and payment terminals</p>
        </div>
      </div>

      <DataTable
        data={devices}
        columns={columns}
        isLoading={isLoading}
        onAdd={() => {
          setEditingItem(null);
          setFormOpen(true);
        }}
        onEdit={(item) => {
          setEditingItem(item);
          setFormOpen(true);
        }}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        addLabel="Add Terminal"
        searchPlaceholder="Search terminals..."
        customActions={[(item: TerminalDevice) => (
          <Button
            key="ping"
            size="icon"
            variant="ghost"
            onClick={() => pingMutation.mutate(item.id)}
            disabled={pingMutation.isPending}
            data-testid={`button-ping-${item.id}`}
          >
            {pingMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        )]}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Terminal Device" : "Add Terminal Device"}</DialogTitle>
            <DialogDescription>
              Configure an EMV card reader or payment terminal for processing card payments.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Front Counter Terminal" data-testid="input-terminal-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-model">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(metadata?.models || Object.keys(MODEL_LABELS)).map((model) => (
                            <SelectItem key={model} value={model}>
                              {MODEL_LABELS[model] || model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-property">
                            <SelectValue placeholder="Select property" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {properties.map((property) => (
                            <SelectItem key={property.id} value={property.id}>
                              {property.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="workstationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workstation (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-workstation">
                            <SelectValue placeholder="Assign to workstation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None (Floating)</SelectItem>
                          {filteredWorkstations.map((ws) => (
                            <SelectItem key={ws.id} value={ws.id}>
                              {ws.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Leave blank for roaming/shared terminals</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="paymentProcessorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Processor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-processor">
                          <SelectValue placeholder="Select processor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Use property default</SelectItem>
                        {filteredProcessors.map((proc) => (
                          <SelectItem key={proc.id} value={proc.id}>
                            {proc.name} ({proc.gatewayType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Which payment processor handles this terminal's transactions
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="serialNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Serial Number</FormLabel>
                      <FormControl>
                        <Input placeholder="SN123456789" data-testid="input-serial" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="terminalId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terminal ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Processor-assigned ID" data-testid="input-terminal-id" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormDescription>ID assigned by payment processor</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="connectionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connection Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "ethernet"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-connection">
                            <SelectValue placeholder="Select connection type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(metadata?.connectionTypes || Object.keys(CONNECTION_TYPE_LABELS)).map((type) => (
                            <SelectItem key={type} value={type}>
                              {CONNECTION_TYPE_LABELS[type] || type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {(connectionType === "ethernet" || connectionType === "wifi") && (
                  <FormField
                    control={form.control}
                    name="networkAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Network Address</FormLabel>
                        <FormControl>
                          <Input placeholder="192.168.1.100" data-testid="input-network-address" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {connectionType === "cloud" && (
                  <FormField
                    control={form.control}
                    name="cloudDeviceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cloud Device ID</FormLabel>
                        <FormControl>
                          <Input placeholder="tmr_xxx" data-testid="input-cloud-id" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription>Device ID from processor dashboard</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Inactive terminals won't appear in POS
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-active" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingItem ? "Save Changes" : "Create Terminal"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
