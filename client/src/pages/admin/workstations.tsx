import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertWorkstationSchema, type Workstation, type InsertWorkstation, type Property, type Rvc, type Printer } from "@shared/schema";

export default function WorkstationsPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Workstation | null>(null);

  const { data: workstations = [], isLoading } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const { data: printers = [] } = useQuery<Printer[]>({
    queryKey: ["/api/printers"],
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

  const formFields: FormFieldConfig[] = useMemo(() => [
    { name: "name", label: "Workstation Name", type: "text", placeholder: "e.g., Front Counter 1", required: true },
    {
      name: "deviceType",
      label: "Device Type",
      type: "select",
      options: [
        { value: "pos_terminal", label: "POS Terminal" },
        { value: "kiosk", label: "Self-Service Kiosk" },
        { value: "manager_station", label: "Manager Station" },
      ],
      defaultValue: "pos_terminal",
    },
    {
      name: "propertyId",
      label: "Property",
      type: "select",
      options: properties.map((p) => ({ value: p.id, label: p.name })),
      required: true,
    },
    {
      name: "rvcId",
      label: "Revenue Center (Optional)",
      type: "select",
      options: [{ value: "__none__", label: "None" }, ...rvcs.map((r) => ({ value: r.id, label: r.name }))],
    },
    {
      name: "defaultOrderType",
      label: "Default Order Type",
      type: "select",
      options: [
        { value: "dine_in", label: "Dine In" },
        { value: "take_out", label: "Take Out" },
        { value: "delivery", label: "Delivery" },
        { value: "drive_thru", label: "Drive Thru" },
      ],
      defaultValue: "dine_in",
    },
    { name: "fastTransactionEnabled", label: "Fast Transaction Enabled", type: "switch", defaultValue: false },
    { name: "requireBeginCheck", label: "Require Begin Check", type: "switch", defaultValue: true },
    { name: "allowPickupCheck", label: "Allow Pickup Check", type: "switch", defaultValue: true },
    { name: "allowReopenClosedChecks", label: "Allow Reopen Closed Checks", type: "switch", defaultValue: false },
    { name: "allowOfflineOperation", label: "Allow Offline Operation", type: "switch", defaultValue: false },
    { name: "managerApprovalDevice", label: "Manager Approval Device", type: "switch", defaultValue: false },
    { name: "clockInAllowed", label: "Clock-In Allowed", type: "switch", defaultValue: true },
    // Receipt Printer Section
    {
      name: "defaultReceiptPrinterId",
      label: "Receipt Printer",
      type: "select",
      options: printerOptions,
      description: "Primary printer for guest checks",
    },
    {
      name: "backupReceiptPrinterId",
      label: "Backup Receipt Printer",
      type: "select",
      options: printerOptions,
      description: "Fallback if primary is offline",
    },
    // Report Printer Section
    {
      name: "reportPrinterId",
      label: "Report Printer",
      type: "select",
      options: printerOptions,
      description: "Printer for reports and summaries",
    },
    {
      name: "backupReportPrinterId",
      label: "Backup Report Printer",
      type: "select",
      options: printerOptions,
      description: "Fallback for report printing",
    },
    // Void Printer Section
    {
      name: "voidPrinterId",
      label: "Void Printer",
      type: "select",
      options: printerOptions,
      description: "Printer for void receipts",
    },
    {
      name: "backupVoidPrinterId",
      label: "Backup Void Printer",
      type: "select",
      options: printerOptions,
      description: "Fallback for void printing",
    },
    // Network Settings
    { name: "ipAddress", label: "IP Address", type: "text", placeholder: "e.g., 192.168.1.100" },
    { name: "hostname", label: "Hostname", type: "text", placeholder: "e.g., pos-terminal-1" },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ], [properties, rvcs, printerOptions]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertWorkstation) => {
      const response = await apiRequest("POST", "/api/workstations", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workstations"] });
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
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workstations"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Workstation updated" });
    },
    onError: () => {
      toast({ title: "Failed to update workstation", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/workstations/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workstations"] });
      toast({ title: "Workstation deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete workstation", variant: "destructive" });
    },
  });

  const cleanPrinterId = (value: string | null | undefined): string | null => {
    if (!value || value === "__none__") return null;
    return value;
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
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...cleanedData } as Workstation);
    } else {
      createMutation.mutate(cleanedData);
    }
  };

  const getInitialData = (item: Workstation | null) => {
    if (!item) return undefined;
    return {
      ...item,
      rvcId: item.rvcId || "__none__",
      defaultReceiptPrinterId: item.defaultReceiptPrinterId || "__none__",
      backupReceiptPrinterId: item.backupReceiptPrinterId || "__none__",
      reportPrinterId: item.reportPrinterId || "__none__",
      backupReportPrinterId: item.backupReportPrinterId || "__none__",
      voidPrinterId: item.voidPrinterId || "__none__",
      backupVoidPrinterId: item.backupVoidPrinterId || "__none__",
    };
  };

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

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertWorkstationSchema}
        fields={formFields}
        title={editingItem ? "Edit Workstation" : "Add Workstation"}
        initialData={getInitialData(editingItem)}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
