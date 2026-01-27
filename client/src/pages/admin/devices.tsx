import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useEmc } from "@/lib/emc-context";
import { Plus, Edit, Trash2, Monitor, Tv, Server, RefreshCw, CheckCircle, XCircle, Clock, Key, Copy, Cpu, Activity, Download } from "lucide-react";
import type { Device, DeviceEnrollmentToken, Enterprise, Property } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";

const DEVICE_TYPES = [
  { value: "pos_workstation", label: "POS Workstation", icon: Monitor },
  { value: "kds_display", label: "KDS Display", icon: Tv },
  { value: "controller", label: "Controller", icon: Server },
  { value: "service_host", label: "Service", icon: Server },
  { value: "back_office", label: "Back Office", icon: Monitor },
];

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", variant: "outline", icon: Clock },
  active: { label: "Active", variant: "default", icon: CheckCircle },
  offline: { label: "Offline", variant: "secondary", icon: XCircle },
  maintenance: { label: "Maintenance", variant: "outline", icon: RefreshCw },
  decommissioned: { label: "Decommissioned", variant: "destructive", icon: XCircle },
};

export default function DevicesPage() {
  const { toast } = useToast();
  const { selectedEnterpriseId } = useEmc();
  const [tab, setTab] = useState("devices");
  const [formOpen, setFormOpen] = useState(false);
  const [tokenFormOpen, setTokenFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPropertyId, setImportPropertyId] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [filterEnterpriseId, setFilterEnterpriseId] = useState<string>("");
  const [filterPropertyId, setFilterPropertyId] = useState<string>("");
  const [filterDeviceType, setFilterDeviceType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  // Build URLs with enterprise filtering for multi-tenancy
  const enterpriseParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";

  const [formData, setFormData] = useState({
    name: "",
    deviceId: "",
    deviceType: "pos_workstation",
    enterpriseId: "",
    propertyId: "",
    osType: "",
    hardwareModel: "",
    serialNumber: "",
    ipAddress: "",
    macAddress: "",
  });

  const [tokenFormData, setTokenFormData] = useState({
    name: "",
    enterpriseId: "",
    propertyId: "",
    deviceType: "",
    maxUses: "",
    expiresInDays: "",
  });

  const { data: enterprises = [] } = useQuery<Enterprise[]>({
    queryKey: ["/api/enterprises", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/enterprises${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch enterprises");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/properties${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const buildDevicesQuery = () => {
    const params = new URLSearchParams();
    // Use selectedEnterpriseId from EMC context, or fall back to local filter
    const effectiveEnterpriseId = selectedEnterpriseId || filterEnterpriseId;
    if (effectiveEnterpriseId) params.set("enterpriseId", effectiveEnterpriseId);
    if (filterPropertyId) params.set("propertyId", filterPropertyId);
    if (filterDeviceType) params.set("deviceType", filterDeviceType);
    if (filterStatus) params.set("status", filterStatus);
    const queryStr = params.toString();
    return queryStr ? `/api/devices?${queryStr}` : "/api/devices";
  };

  const { data: devices = [], isLoading: devicesLoading } = useQuery<Device[]>({
    queryKey: ["/api/devices", { enterpriseId: selectedEnterpriseId }, filterEnterpriseId, filterPropertyId, filterDeviceType, filterStatus],
    queryFn: async () => {
      const res = await fetch(buildDevicesQuery());
      if (!res.ok) throw new Error("Failed to fetch devices");
      return res.json();
    },
  });

  const { data: enrollmentTokens = [], isLoading: tokensLoading } = useQuery<DeviceEnrollmentToken[]>({
    queryKey: ["/api/device-enrollment-tokens", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/device-enrollment-tokens${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch enrollment tokens");
      return res.json();
    },
  });

  const createDevice = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("POST", "/api/devices", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Device created successfully" });
      setFormOpen(false);
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Failed to create device", description: err.message, variant: "destructive" }),
  });

  const updateDevice = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof formData & { status: string }> }) =>
      apiRequest("PATCH", `/api/devices/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Device updated successfully" });
      setFormOpen(false);
      setSelectedDevice(null);
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Failed to update device", description: err.message, variant: "destructive" }),
  });

  const deleteDevice = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/devices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Device deleted successfully" });
    },
    onError: (err: Error) => toast({ title: "Failed to delete device", description: err.message, variant: "destructive" }),
  });

  const createToken = useMutation({
    mutationFn: (data: typeof tokenFormData) => {
      const payload: Record<string, unknown> = {
        name: data.name,
        enterpriseId: data.enterpriseId,
        active: true,
      };
      if (data.propertyId) payload.propertyId = data.propertyId;
      if (data.deviceType) payload.deviceType = data.deviceType;
      if (data.maxUses) payload.maxUses = parseInt(data.maxUses);
      if (data.expiresInDays) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(data.expiresInDays));
        payload.expiresAt = expiresAt;
      }
      return apiRequest("POST", "/api/device-enrollment-tokens", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-enrollment-tokens", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Enrollment token created successfully" });
      setTokenFormOpen(false);
      resetTokenForm();
    },
    onError: (err: Error) => toast({ title: "Failed to create token", description: err.message, variant: "destructive" }),
  });

  const deleteToken = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/device-enrollment-tokens/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-enrollment-tokens", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Token deleted successfully" });
    },
    onError: (err: Error) => toast({ title: "Failed to delete token", description: err.message, variant: "destructive" }),
  });

  // Import preview query
  const { data: importPreview, isLoading: importPreviewLoading, refetch: refetchImportPreview } = useQuery<{
    property: { id: string; name: string };
    enterprise: { id: string; name: string } | null;
    items: Array<{
      sourceId: string;
      sourceType: string;
      name: string;
      deviceType: string;
      deviceId: string;
      ipAddress?: string;
      alreadyExists: boolean;
    }>;
    summary: {
      total: number;
      workstations: number;
      kdsDevices: number;
      alreadyExists: number;
      toImport: number;
    };
  }>({
    queryKey: ["/api/devices/import-preview", importPropertyId],
    queryFn: async () => {
      const res = await fetch(`/api/devices/import-preview/${importPropertyId}`);
      if (!res.ok) throw new Error("Failed to fetch import preview");
      return res.json();
    },
    enabled: !!importPropertyId && importOpen,
  });

  const importDevices = useMutation({
    mutationFn: async (propertyId: string) => {
      const res = await apiRequest("POST", "/api/devices/import-from-property", { propertyId });
      return res.json() as Promise<{ imported: number; skipped: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: `Imported ${data.imported} devices`, description: data.skipped > 0 ? `${data.skipped} already existed` : undefined });
      setImportOpen(false);
      setImportPropertyId("");
    },
    onError: (err: Error) => toast({ title: "Failed to import devices", description: err.message, variant: "destructive" }),
  });

  // Refetch import preview when property changes
  useEffect(() => {
    if (importPropertyId && importOpen) {
      refetchImportPreview();
    }
  }, [importPropertyId, importOpen]);

  const resetForm = () => {
    setFormData({
      name: "",
      deviceId: "",
      deviceType: "pos_workstation",
      enterpriseId: "",
      propertyId: "",
      osType: "",
      hardwareModel: "",
      serialNumber: "",
      ipAddress: "",
      macAddress: "",
    });
  };

  const resetTokenForm = () => {
    setTokenFormData({
      name: "",
      enterpriseId: "",
      propertyId: "",
      deviceType: "",
      maxUses: "",
      expiresInDays: "",
    });
  };

  const openEditForm = (device: Device) => {
    setSelectedDevice(device);
    setFormData({
      name: device.name || "",
      deviceId: device.deviceId,
      deviceType: device.deviceType,
      enterpriseId: device.enterpriseId,
      propertyId: device.propertyId || "",
      osType: device.osType || "",
      hardwareModel: device.hardwareModel || "",
      serialNumber: device.serialNumber || "",
      ipAddress: device.ipAddress || "",
      macAddress: device.macAddress || "",
    });
    setFormOpen(true);
  };

  const openDetail = (device: Device) => {
    setSelectedDevice(device);
    setDetailOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.deviceId || !formData.enterpriseId) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    if (selectedDevice) {
      updateDevice.mutate({ id: selectedDevice.id, data: formData });
    } else {
      createDevice.mutate(formData);
    }
  };

  const handleTokenSubmit = () => {
    if (!tokenFormData.name || !tokenFormData.enterpriseId) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    createToken.mutate(tokenFormData);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const getEnterpriseName = (id: string) => enterprises.find((e) => e.id === id)?.name || "Unknown";
  const getPropertyName = (id: string | null | undefined) => (id ? properties.find((p) => p.id === id)?.name || "Unknown" : "-");

  const filteredProperties = formData.enterpriseId
    ? properties.filter((p) => p.enterpriseId === formData.enterpriseId)
    : properties;

  const tokenFilteredProperties = tokenFormData.enterpriseId
    ? properties.filter((p) => p.enterpriseId === tokenFormData.enterpriseId)
    : properties;

  const filterProperties = filterEnterpriseId
    ? properties.filter((p) => p.enterpriseId === filterEnterpriseId)
    : properties;

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Device Management</h1>
          <p className="text-muted-foreground text-sm">Manage POS terminals, KDS displays, and other devices</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="devices" data-testid="tab-devices">
            <Monitor className="w-4 h-4 mr-2" />
            Devices ({devices.length})
          </TabsTrigger>
          <TabsTrigger value="tokens" data-testid="tab-tokens">
            <Key className="w-4 h-4 mr-2" />
            Enrollment Tokens ({enrollmentTokens.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="devices" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
              <CardTitle className="text-lg">Registered Devices</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setImportOpen(true)}
                  data-testid="button-import-devices"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Import from Property
                </Button>
                <Button
                  onClick={() => {
                    resetForm();
                    setSelectedDevice(null);
                    setFormOpen(true);
                  }}
                  data-testid="button-add-device"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Device
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Select value={filterEnterpriseId || "_all"} onValueChange={(v) => setFilterEnterpriseId(v === "_all" ? "" : v)}>
                  <SelectTrigger className="w-48" data-testid="select-filter-enterprise">
                    <SelectValue placeholder="All Enterprises" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Enterprises</SelectItem>
                    {enterprises.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterPropertyId || "_all"} onValueChange={(v) => setFilterPropertyId(v === "_all" ? "" : v)}>
                  <SelectTrigger className="w-48" data-testid="select-filter-property">
                    <SelectValue placeholder="All Properties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Properties</SelectItem>
                    {filterProperties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterDeviceType || "_all"} onValueChange={(v) => setFilterDeviceType(v === "_all" ? "" : v)}>
                  <SelectTrigger className="w-48" data-testid="select-filter-type">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Types</SelectItem>
                    {DEVICE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus || "_all"} onValueChange={(v) => setFilterStatus(v === "_all" ? "" : v)}>
                  <SelectTrigger className="w-40" data-testid="select-filter-status">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Status</SelectItem>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="h-[500px]">
                {devicesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading devices...</div>
                ) : devices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No devices found. Add a device or generate an enrollment token.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Enterprise</TableHead>
                        <TableHead>Property</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Seen</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {devices.map((device) => {
                        const typeConfig = DEVICE_TYPES.find((t) => t.value === device.deviceType);
                        const statusConfig = STATUS_CONFIG[device.status] || STATUS_CONFIG.pending;
                        const StatusIcon = statusConfig.icon;
                        return (
                          <TableRow key={device.id} data-testid={`row-device-${device.id}`}>
                            <TableCell>
                              <button
                                className="font-medium text-left hover:underline"
                                onClick={() => openDetail(device)}
                                data-testid={`link-device-${device.id}`}
                              >
                                {device.name || device.deviceId}
                              </button>
                              <div className="text-xs text-muted-foreground">{device.deviceId}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {typeConfig && <typeConfig.icon className="w-4 h-4" />}
                                <span>{typeConfig?.label || device.deviceType}</span>
                              </div>
                            </TableCell>
                            <TableCell>{getEnterpriseName(device.enterpriseId)}</TableCell>
                            <TableCell>{getPropertyName(device.propertyId)}</TableCell>
                            <TableCell>
                              <Badge variant={statusConfig.variant} className="gap-1">
                                <StatusIcon className="w-3 h-3" />
                                {statusConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {device.lastSeenAt
                                ? formatDistanceToNow(new Date(device.lastSeenAt), { addSuffix: true })
                                : "Never"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openEditForm(device)}
                                  data-testid={`button-edit-device-${device.id}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => deleteDevice.mutate(device.id)}
                                  data-testid={`button-delete-device-${device.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tokens" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
              <CardTitle className="text-lg">Enrollment Tokens</CardTitle>
              <Button
                onClick={() => {
                  resetTokenForm();
                  setTokenFormOpen(true);
                }}
                data-testid="button-add-token"
              >
                <Plus className="w-4 h-4 mr-2" />
                Generate Token
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Generate tokens that allow devices to self-register with the system. Tokens can be scoped to specific enterprises, properties, or device types.
              </p>
              <ScrollArea className="h-[500px]">
                {tokensLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading tokens...</div>
                ) : enrollmentTokens.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No enrollment tokens. Generate one to allow devices to self-register.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Token</TableHead>
                        <TableHead>Enterprise</TableHead>
                        <TableHead>Property</TableHead>
                        <TableHead>Device Type</TableHead>
                        <TableHead>Uses</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrollmentTokens.map((token) => {
                        const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
                        const isExhausted = token.maxUses && (token.usedCount || 0) >= token.maxUses;
                        const isValid = token.active && !isExpired && !isExhausted;
                        return (
                          <TableRow key={token.id} data-testid={`row-token-${token.id}`}>
                            <TableCell className="font-medium">{token.name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <code className="text-xs bg-muted px-2 py-1 rounded">{token.token.slice(0, 8)}...</code>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(token.token)}
                                  data-testid={`button-copy-token-${token.id}`}
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>{getEnterpriseName(token.enterpriseId)}</TableCell>
                            <TableCell>{getPropertyName(token.propertyId)}</TableCell>
                            <TableCell>
                              {token.deviceType ? DEVICE_TYPES.find((t) => t.value === token.deviceType)?.label || token.deviceType : "Any"}
                            </TableCell>
                            <TableCell>
                              {token.maxUses ? `${token.usedCount || 0} / ${token.maxUses}` : `${token.usedCount || 0} (unlimited)`}
                            </TableCell>
                            <TableCell className="text-sm">
                              {token.expiresAt ? format(new Date(token.expiresAt), "MMM d, yyyy") : "Never"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={isValid ? "default" : "secondary"}>
                                {isExpired ? "Expired" : isExhausted ? "Exhausted" : isValid ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteToken.mutate(token.id)}
                                data-testid={`button-delete-token-${token.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedDevice ? "Edit Device" : "Add Device"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="POS Terminal 1"
                  data-testid="input-device-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deviceId">Device ID *</Label>
                <Input
                  id="deviceId"
                  value={formData.deviceId}
                  onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                  placeholder="POS-001"
                  data-testid="input-device-id"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Device Type *</Label>
                <Select value={formData.deviceType} onValueChange={(v) => setFormData({ ...formData, deviceType: v })}>
                  <SelectTrigger data-testid="select-device-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Enterprise *</Label>
                <Select value={formData.enterpriseId} onValueChange={(v) => setFormData({ ...formData, enterpriseId: v, propertyId: "" })}>
                  <SelectTrigger data-testid="select-device-enterprise">
                    <SelectValue placeholder="Select enterprise" />
                  </SelectTrigger>
                  <SelectContent>
                    {enterprises.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Property (Optional)</Label>
              <Select value={formData.propertyId || "_none"} onValueChange={(v) => setFormData({ ...formData, propertyId: v === "_none" ? "" : v })} disabled={!formData.enterpriseId}>
                <SelectTrigger data-testid="select-device-property">
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No specific property</SelectItem>
                  {filteredProperties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="osType">OS Type</Label>
                <Input
                  id="osType"
                  value={formData.osType}
                  onChange={(e) => setFormData({ ...formData, osType: e.target.value })}
                  placeholder="Windows 11"
                  data-testid="input-device-os"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hardwareModel">Hardware Model</Label>
                <Input
                  id="hardwareModel"
                  value={formData.hardwareModel}
                  onChange={(e) => setFormData({ ...formData, hardwareModel: e.target.value })}
                  placeholder="Dell OptiPlex 7010"
                  data-testid="input-device-model"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serialNumber">Serial Number</Label>
                <Input
                  id="serialNumber"
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  placeholder="SN12345678"
                  data-testid="input-device-serial"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipAddress">IP Address</Label>
                <Input
                  id="ipAddress"
                  value={formData.ipAddress}
                  onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                  placeholder="192.168.1.100"
                  data-testid="input-device-ip"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="macAddress">MAC Address</Label>
              <Input
                id="macAddress"
                value={formData.macAddress}
                onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })}
                placeholder="00:1A:2B:3C:4D:5E"
                data-testid="input-device-mac"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} data-testid="button-cancel-device">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createDevice.isPending || updateDevice.isPending} data-testid="button-save-device">
              {createDevice.isPending || updateDevice.isPending ? "Saving..." : selectedDevice ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tokenFormOpen} onOpenChange={setTokenFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Enrollment Token</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tokenName">Token Name *</Label>
              <Input
                id="tokenName"
                value={tokenFormData.name}
                onChange={(e) => setTokenFormData({ ...tokenFormData, name: e.target.value })}
                placeholder="New Store Devices"
                data-testid="input-token-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Enterprise *</Label>
              <Select value={tokenFormData.enterpriseId} onValueChange={(v) => setTokenFormData({ ...tokenFormData, enterpriseId: v, propertyId: "" })}>
                <SelectTrigger data-testid="select-token-enterprise">
                  <SelectValue placeholder="Select enterprise" />
                </SelectTrigger>
                <SelectContent>
                  {enterprises.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Property (Optional)</Label>
              <Select value={tokenFormData.propertyId || "_any"} onValueChange={(v) => setTokenFormData({ ...tokenFormData, propertyId: v === "_any" ? "" : v })} disabled={!tokenFormData.enterpriseId}>
                <SelectTrigger data-testid="select-token-property">
                  <SelectValue placeholder="Any property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any property</SelectItem>
                  {tokenFilteredProperties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Device Type (Optional)</Label>
              <Select value={tokenFormData.deviceType || "_any"} onValueChange={(v) => setTokenFormData({ ...tokenFormData, deviceType: v === "_any" ? "" : v })}>
                <SelectTrigger data-testid="select-token-device-type">
                  <SelectValue placeholder="Any type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any type</SelectItem>
                  {DEVICE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxUses">Max Uses</Label>
                <Input
                  id="maxUses"
                  type="number"
                  value={tokenFormData.maxUses}
                  onChange={(e) => setTokenFormData({ ...tokenFormData, maxUses: e.target.value })}
                  placeholder="Unlimited"
                  data-testid="input-token-max-uses"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiresInDays">Expires In (Days)</Label>
                <Input
                  id="expiresInDays"
                  type="number"
                  value={tokenFormData.expiresInDays}
                  onChange={(e) => setTokenFormData({ ...tokenFormData, expiresInDays: e.target.value })}
                  placeholder="Never"
                  data-testid="input-token-expires"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenFormOpen(false)} data-testid="button-cancel-token">
              Cancel
            </Button>
            <Button onClick={handleTokenSubmit} disabled={createToken.isPending} data-testid="button-generate-token">
              {createToken.isPending ? "Generating..." : "Generate Token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Device Details</DialogTitle>
          </DialogHeader>
          {selectedDevice && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  {DEVICE_TYPES.find((t) => t.value === selectedDevice.deviceType)?.icon && (
                    (() => {
                      const Icon = DEVICE_TYPES.find((t) => t.value === selectedDevice.deviceType)!.icon;
                      return <Icon className="w-8 h-8" />;
                    })()
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{selectedDevice.name || selectedDevice.deviceId}</h3>
                  <p className="text-sm text-muted-foreground">{selectedDevice.deviceId}</p>
                </div>
                <Badge variant={STATUS_CONFIG[selectedDevice.status]?.variant || "outline"} className="ml-auto">
                  {STATUS_CONFIG[selectedDevice.status]?.label || selectedDevice.status}
                </Badge>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Enterprise</span>
                  <p className="font-medium">{getEnterpriseName(selectedDevice.enterpriseId)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Property</span>
                  <p className="font-medium">{getPropertyName(selectedDevice.propertyId)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Device Type</span>
                  <p className="font-medium">{DEVICE_TYPES.find((t) => t.value === selectedDevice.deviceType)?.label || selectedDevice.deviceType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">OS</span>
                  <p className="font-medium">{selectedDevice.osType || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Hardware Model</span>
                  <p className="font-medium">{selectedDevice.hardwareModel || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Serial Number</span>
                  <p className="font-medium">{selectedDevice.serialNumber || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">IP Address</span>
                  <p className="font-medium">{selectedDevice.ipAddress || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">MAC Address</span>
                  <p className="font-medium">{selectedDevice.macAddress || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">App Version</span>
                  <p className="font-medium">{selectedDevice.currentAppVersion || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">OS Version</span>
                  <p className="font-medium">{selectedDevice.osVersion || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Enrolled At</span>
                  <p className="font-medium">
                    {selectedDevice.enrolledAt ? format(new Date(selectedDevice.enrolledAt), "MMM d, yyyy HH:mm") : "-"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Seen</span>
                  <p className="font-medium">
                    {selectedDevice.lastSeenAt
                      ? formatDistanceToNow(new Date(selectedDevice.lastSeenAt), { addSuffix: true })
                      : "Never"}
                  </p>
                </div>
              </div>
              {selectedDevice.status === "active" && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Health Metrics
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <Card className="p-3">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">CPU</span>
                        </div>
                        <p className="text-lg font-bold">--</p>
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Memory</span>
                        </div>
                        <p className="text-lg font-bold">--</p>
                      </Card>
                      <Card className="p-3">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Disk</span>
                        </div>
                        <p className="text-lg font-bold">--</p>
                      </Card>
                    </div>
                    <p className="text-xs text-muted-foreground">Health data available when devices send heartbeats</p>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setDetailOpen(false);
                if (selectedDevice) openEditForm(selectedDevice);
              }}
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Devices from Property</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import existing workstations and KDS devices from your property configuration into the device registry.
            </p>
            <div className="space-y-2">
              <Label>Select Property</Label>
              <Select 
                value={importPropertyId || "_select"} 
                onValueChange={(v) => setImportPropertyId(v === "_select" ? "" : v)}
              >
                <SelectTrigger data-testid="select-import-property">
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_select">Select a property</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {importPropertyId && (
              <div className="space-y-3">
                {importPreviewLoading ? (
                  <div className="text-center py-4 text-muted-foreground">Loading preview...</div>
                ) : importPreview ? (
                  <>
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Enterprise: </span>
                        <span className="font-medium">{importPreview.enterprise?.name || "Unknown"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Property: </span>
                        <span className="font-medium">{importPreview.property.name}</span>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-md bg-muted">
                        <div className="text-2xl font-bold">{importPreview.summary.workstations}</div>
                        <div className="text-xs text-muted-foreground">Workstations</div>
                      </div>
                      <div className="p-2 rounded-md bg-muted">
                        <div className="text-2xl font-bold">{importPreview.summary.kdsDevices}</div>
                        <div className="text-xs text-muted-foreground">KDS Devices</div>
                      </div>
                      <div className="p-2 rounded-md bg-muted">
                        <div className="text-2xl font-bold">{importPreview.summary.toImport}</div>
                        <div className="text-xs text-muted-foreground">To Import</div>
                      </div>
                    </div>
                    {importPreview.summary.alreadyExists > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {importPreview.summary.alreadyExists} device(s) already exist and will be skipped.
                      </p>
                    )}
                    {importPreview.items.length > 0 && (
                      <ScrollArea className="h-40 border rounded-md p-2">
                        <div className="space-y-1">
                          {importPreview.items.map((item) => {
                            const typeConfig = DEVICE_TYPES.find((t) => t.value === item.deviceType);
                            const TypeIcon = typeConfig?.icon || Monitor;
                            return (
                              <div
                                key={item.sourceId}
                                className={`flex items-center gap-2 p-2 rounded-md ${item.alreadyExists ? "opacity-50" : ""}`}
                              >
                                <TypeIcon className="w-4 h-4" />
                                <span className="flex-1 text-sm">{item.name}</span>
                                <Badge variant={item.alreadyExists ? "secondary" : "outline"} className="text-xs">
                                  {item.alreadyExists ? "Exists" : item.sourceType === "workstation" ? "Workstation" : "KDS"}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                    {importPreview.summary.total === 0 && (
                      <p className="text-center py-4 text-muted-foreground">
                        No workstations or KDS devices configured for this property.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportPropertyId(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => importDevices.mutate(importPropertyId)}
              disabled={!importPropertyId || importDevices.isPending || !importPreview || importPreview.summary.toImport === 0}
              data-testid="button-confirm-import"
            >
              {importDevices.isPending ? "Importing..." : `Import ${importPreview?.summary.toImport || 0} Device(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
