import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useEmc } from "@/lib/emc-context";
import { insertWorkstationSchema, type Workstation, type InsertWorkstation, type Property, type Rvc, type Printer } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

export default function WorkstationsPage() {
  const { toast } = useToast();
  const { selectedEnterpriseId } = useEmc();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Workstation | null>(null);

  // Build URLs with enterprise filtering for multi-tenancy
  const enterpriseParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";

  const { data: workstations = [], isLoading } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/workstations${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch workstations");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/properties${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/rvcs${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch rvcs");
      return res.json();
    },
  });

  const { data: printers = [] } = useQuery<Printer[]>({
    queryKey: ["/api/printers", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/printers${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch printers");
      return res.json();
    },
  });

  const columns: Column<Workstation>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "deviceType",
      header: "Type",
      render: (value) => (
        <Badge variant="outline">
          {value === "pos_terminal" ? "POS Terminal" : value === "kiosk" ? "Kiosk" : "Manager Station"}
        </Badge>
      ),
    },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "rvcId",
      header: "RVC",
      render: (value) => rvcs.find((r) => r.id === value)?.name || "-",
    },
    { key: "ipAddress", header: "IP Address" },
    {
      key: "defaultReceiptPrinterId",
      header: "Receipt Printer",
      render: (value) => printers.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "fastTransactionEnabled",
      header: "Fast Transaction",
      render: (value) => (value ? <Badge variant="secondary">Yes</Badge> : "-"),
    },
    {
      key: "isOnline",
      header: "Status",
      render: (value) => (value ? <Badge className="bg-green-600">Online</Badge> : <Badge variant="secondary">Offline</Badge>),
    },
    {
      key: "active",
      header: "Active",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertWorkstation) => {
      const response = await apiRequest("POST", "/api/workstations", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workstations", { enterpriseId: selectedEnterpriseId }] });
      setFormOpen(false);
      toast({ title: "Workstation created" });
    },
    onError: () => {
      toast({ title: "Failed to create workstation", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Workstation) => {
      const response = await apiRequest("PUT", "/api/workstations/" + data.id, data);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workstations", { enterpriseId: selectedEnterpriseId }] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Workstation updated" });
    },
    onError: (error) => {
      toast({ title: "Failed to update workstation", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/workstations/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workstations", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Workstation deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete workstation", variant: "destructive" });
    },
  });

  return (
    <div className="p-6">
      <DataTable
        data={workstations}
        columns={columns}
        title="Workstations"
        onAdd={() => {
          setEditingItem(null);
          setFormOpen(true);
        }}
        onEdit={(item) => {
          setEditingItem(item);
          setFormOpen(true);
        }}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        isLoading={isLoading}
        searchPlaceholder="Search workstations..."
        emptyMessage="No workstations configured"
      />

      <WorkstationFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        properties={properties}
        rvcs={rvcs}
        printers={printers}
        workstations={workstations}
        onSubmit={(data) => {
          if (editingItem) {
            updateMutation.mutate({ ...editingItem, ...data } as Workstation);
          } else {
            createMutation.mutate(data);
          }
        }}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

interface WorkstationFormDialogProps {
  open: boolean;
  onClose: () => void;
  editingItem: Workstation | null;
  properties: Property[];
  rvcs: Rvc[];
  printers: Printer[];
  workstations: Workstation[];
  onSubmit: (data: InsertWorkstation) => void;
  isLoading: boolean;
}

const PRINTER_FIELDS = [
  "defaultReceiptPrinterId",
  "backupReceiptPrinterId",
  "reportPrinterId",
  "backupReportPrinterId",
  "voidPrinterId",
  "backupVoidPrinterId",
] as const;

type PrinterFieldName = typeof PRINTER_FIELDS[number];

function WorkstationFormDialog({ 
  open, 
  onClose, 
  editingItem, 
  properties, 
  rvcs, 
  printers,
  workstations,
  onSubmit, 
  isLoading 
}: WorkstationFormDialogProps) {
  const { toast } = useToast();
  
  const form = useForm<InsertWorkstation>({
    resolver: zodResolver(insertWorkstationSchema),
    defaultValues: {
      name: "",
      deviceType: "pos_terminal",
      propertyId: "",
      rvcId: null,
      defaultOrderType: "dine_in",
      fastTransactionEnabled: false,
      requireBeginCheck: true,
      allowPickupCheck: true,
      allowReopenClosedChecks: false,
      allowOfflineOperation: false,
      managerApprovalDevice: false,
      clockInAllowed: true,
      defaultReceiptPrinterId: null,
      backupReceiptPrinterId: null,
      reportPrinterId: null,
      backupReportPrinterId: null,
      voidPrinterId: null,
      backupVoidPrinterId: null,
      ipAddress: "",
      hostname: "",
      autoLogoutMinutes: null,
      active: true,
    },
  });

  const printerOptions = useMemo(() => {
    const getPropertyName = (propertyId: string) => {
      const prop = properties.find(p => p.id === propertyId);
      return prop?.name || "Unknown";
    };
    return [
      { value: "__none__", label: "None" },
      ...printers.map((p) => ({ 
        value: p.id, 
        label: `${p.name} (${p.printerType}) - ${getPropertyName(p.propertyId)}` 
      })),
    ];
  }, [printers, properties]);

  const rvcOptions = useMemo(() => [
    { value: "__none__", label: "None" },
    ...rvcs.map((r) => ({ value: r.id, label: r.name })),
  ], [rvcs]);

  useEffect(() => {
    if (open) {
      if (editingItem) {
        form.reset({
          name: editingItem.name,
          deviceType: editingItem.deviceType,
          propertyId: editingItem.propertyId,
          rvcId: editingItem.rvcId || null,
          defaultOrderType: editingItem.defaultOrderType || "dine_in",
          fastTransactionEnabled: editingItem.fastTransactionEnabled ?? false,
          requireBeginCheck: editingItem.requireBeginCheck ?? true,
          allowPickupCheck: editingItem.allowPickupCheck ?? true,
          allowReopenClosedChecks: editingItem.allowReopenClosedChecks ?? false,
          allowOfflineOperation: editingItem.allowOfflineOperation ?? false,
          managerApprovalDevice: editingItem.managerApprovalDevice ?? false,
          clockInAllowed: editingItem.clockInAllowed ?? true,
          defaultReceiptPrinterId: editingItem.defaultReceiptPrinterId || null,
          backupReceiptPrinterId: editingItem.backupReceiptPrinterId || null,
          reportPrinterId: editingItem.reportPrinterId || null,
          backupReportPrinterId: editingItem.backupReportPrinterId || null,
          voidPrinterId: editingItem.voidPrinterId || null,
          backupVoidPrinterId: editingItem.backupVoidPrinterId || null,
          ipAddress: editingItem.ipAddress || "",
          hostname: editingItem.hostname || "",
          autoLogoutMinutes: editingItem.autoLogoutMinutes ?? null,
          active: editingItem.active ?? true,
        });
      } else {
        form.reset({
          name: "",
          deviceType: "pos_terminal",
          propertyId: properties[0]?.id || "",
          rvcId: null,
          defaultOrderType: "dine_in",
          fastTransactionEnabled: false,
          requireBeginCheck: true,
          allowPickupCheck: true,
          allowReopenClosedChecks: false,
          allowOfflineOperation: false,
          managerApprovalDevice: false,
          clockInAllowed: true,
          defaultReceiptPrinterId: null,
          backupReceiptPrinterId: null,
          reportPrinterId: null,
          backupReportPrinterId: null,
          voidPrinterId: null,
          backupVoidPrinterId: null,
          ipAddress: "",
          hostname: "",
          autoLogoutMinutes: null,
          active: true,
        });
      }
    }
  }, [open, editingItem, properties, form]);

  const cleanPrinterId = (value: string | null | undefined): string | null => {
    if (!value || value === "__none__") return null;
    return value;
  };

  const handleSetForAll = (sourceField: PrinterFieldName) => {
    const sourceValue = form.getValues(sourceField);
    if (!sourceValue || sourceValue === "__none__") {
      toast({ 
        title: "No printer selected", 
        description: "Please select a printer first before applying to all.",
        variant: "destructive" 
      });
      return;
    }
    
    PRINTER_FIELDS.forEach(field => {
      if (field !== sourceField) {
        form.setValue(field, sourceValue);
      }
    });
    
    toast({ 
      title: "Applied to all printers", 
      description: "The selected printer has been set for all printer types." 
    });
  };

  const handleSubmit = (data: InsertWorkstation) => {
    const cleanedData = {
      ...data,
      rvcId: cleanPrinterId(data.rvcId),
      defaultReceiptPrinterId: cleanPrinterId(data.defaultReceiptPrinterId),
      backupReceiptPrinterId: cleanPrinterId(data.backupReceiptPrinterId),
      reportPrinterId: cleanPrinterId(data.reportPrinterId),
      backupReportPrinterId: cleanPrinterId(data.backupReportPrinterId),
      voidPrinterId: cleanPrinterId(data.voidPrinterId),
      backupVoidPrinterId: cleanPrinterId(data.backupVoidPrinterId),
    };
    onSubmit(cleanedData);
  };

  const PrinterSelectField = ({ 
    name, 
    label, 
    description 
  }: { 
    name: PrinterFieldName; 
    label: string; 
    description: string;
  }) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center justify-between gap-2">
            <FormLabel>{label}</FormLabel>
            <button
              type="button"
              onClick={() => handleSetForAll(name)}
              className="text-xs text-muted-foreground hover:text-primary underline"
              data-testid={`link-set-all-${name}`}
            >
              Set for all
            </button>
          </div>
          <Select 
            onValueChange={field.onChange} 
            value={field.value || "__none__"}
          >
            <FormControl>
              <SelectTrigger data-testid={`select-${name}`}>
                <SelectValue placeholder="Select printer" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {printerOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription className="text-xs">{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle data-testid="text-form-title">
            {editingItem ? "Edit Workstation" : "Add Workstation"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto -mx-6 px-6 pr-4">
              <div className="space-y-4 py-4 pr-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workstation Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Front Counter 1" {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deviceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-deviceType">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pos_terminal">POS Terminal</SelectItem>
                          <SelectItem value="kiosk">Self-Service Kiosk</SelectItem>
                          <SelectItem value="manager_station">Manager Station</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-propertyId">
                            <SelectValue placeholder="Select property" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {properties.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rvcId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Revenue Center (Optional)</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-rvcId">
                            <SelectValue placeholder="Select RVC" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {rvcOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultOrderType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Order Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "dine_in"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-defaultOrderType">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="dine_in">Dine In</SelectItem>
                          <SelectItem value="take_out">Take Out</SelectItem>
                          <SelectItem value="delivery">Delivery</SelectItem>
                          <SelectItem value="drive_thru">Drive Thru</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="border rounded-md p-4 space-y-3">
                  <h4 className="font-medium text-sm">Workstation Settings</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="fastTransactionEnabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Fast Transaction</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-fastTransactionEnabled" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="requireBeginCheck"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Require Begin Check</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-requireBeginCheck" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="allowPickupCheck"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Allow Pickup Check</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-allowPickupCheck" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="allowReopenClosedChecks"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Reopen Closed Checks</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-allowReopenClosedChecks" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="allowOfflineOperation"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Allow Offline</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-allowOfflineOperation" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="managerApprovalDevice"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Manager Approval</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} data-testid="switch-managerApprovalDevice" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="clockInAllowed"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Clock-In Allowed</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-clockInAllowed" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="active"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between">
                          <FormLabel className="text-sm">Active</FormLabel>
                          <FormControl>
                            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-active" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="autoLogoutMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Auto-Logout (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0 = disabled"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              field.onChange(val === "" ? null : parseInt(val, 10));
                            }}
                            data-testid="input-autoLogoutMinutes"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Automatically sign out employee after this many minutes of inactivity. Unsent items will be cancelled. Set to 0 or leave empty to disable.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border rounded-md p-4 space-y-4">
                  <h4 className="font-medium text-sm">Printer Assignments</h4>
                  <p className="text-xs text-muted-foreground">
                    Select a printer and click "Set for all" to apply it to all printer types.
                  </p>
                  
                  <PrinterSelectField
                    name="defaultReceiptPrinterId"
                    label="Receipt Printer"
                    description="Primary printer for guest checks"
                  />
                  
                  <PrinterSelectField
                    name="backupReceiptPrinterId"
                    label="Backup Receipt Printer"
                    description="Fallback if primary is offline"
                  />
                  
                  <PrinterSelectField
                    name="reportPrinterId"
                    label="Report Printer"
                    description="Printer for reports and summaries"
                  />
                  
                  <PrinterSelectField
                    name="backupReportPrinterId"
                    label="Backup Report Printer"
                    description="Fallback for report printing"
                  />
                  
                  <PrinterSelectField
                    name="voidPrinterId"
                    label="Void Printer"
                    description="Printer for void receipts"
                  />
                  
                  <PrinterSelectField
                    name="backupVoidPrinterId"
                    label="Backup Void Printer"
                    description="Fallback for void printing"
                  />
                </div>

                <div className="border rounded-md p-4 space-y-4">
                  <h4 className="font-medium text-sm">Network Settings</h4>
                  
                  <FormField
                    control={form.control}
                    name="ipAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IP Address</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 192.168.1.100" {...field} value={field.value || ""} data-testid="input-ipAddress" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="hostname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hostname</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., pos-terminal-1" {...field} value={field.value || ""} data-testid="input-hostname" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="flex-shrink-0 border-t pt-4 mt-2">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} data-testid="button-save">
                {isLoading ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
