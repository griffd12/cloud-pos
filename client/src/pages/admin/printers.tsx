import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertPrinterSchema, type Printer, type InsertPrinter, type Property } from "@shared/schema";

export default function PrintersPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Printer | null>(null);

  const { data: printers = [], isLoading } = useQuery<Printer[]>({
    queryKey: ["/api/printers"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const columns: Column<Printer>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "printerType",
      header: "Type",
      render: (value) => {
        const types: Record<string, string> = {
          receipt: "Receipt",
          kitchen: "Kitchen",
          bar: "Bar",
          prep: "Prep",
          report: "Report",
        };
        return <Badge variant="outline">{types[value as string] || value}</Badge>;
      },
    },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "connectionType",
      header: "Connection",
      render: (value) => value === "network" ? "Network" : value === "usb" ? "USB" : "Serial",
    },
    { key: "ipAddress", header: "IP Address" },
    { key: "port", header: "Port" },
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

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Printer Name", type: "text", placeholder: "e.g., Kitchen Printer - Hot Line", required: true },
    {
      name: "printerType",
      label: "Printer Type",
      type: "select",
      options: [
        { value: "receipt", label: "Receipt" },
        { value: "kitchen", label: "Kitchen" },
        { value: "bar", label: "Bar" },
        { value: "prep", label: "Prep" },
        { value: "report", label: "Report" },
      ],
      defaultValue: "kitchen",
    },
    {
      name: "propertyId",
      label: "Property",
      type: "select",
      options: properties.map((p) => ({ value: p.id, label: p.name })),
      required: true,
    },
    {
      name: "connectionType",
      label: "Connection Type",
      type: "select",
      options: [
        { value: "network", label: "Network (IP)" },
        { value: "usb", label: "USB" },
        { value: "serial", label: "Serial (Legacy)" },
      ],
      defaultValue: "network",
    },
    { name: "ipAddress", label: "IP Address", type: "text", placeholder: "e.g., 192.168.1.100" },
    { name: "port", label: "Port", type: "text", placeholder: "9100", defaultValue: "9100" },
    {
      name: "driverProtocol",
      label: "Driver Protocol",
      type: "select",
      options: [
        { value: "escpos", label: "ESC/POS" },
        { value: "starprnt", label: "StarPRNT" },
        { value: "epson_tm", label: "Epson TM" },
      ],
      defaultValue: "escpos",
    },
    {
      name: "characterWidth",
      label: "Character Width",
      type: "select",
      options: [
        { value: "42", label: "42 characters" },
        { value: "48", label: "48 characters" },
        { value: "56", label: "56 characters" },
      ],
      defaultValue: "42",
    },
    { name: "autoCut", label: "Auto Cut", type: "switch", defaultValue: true },
    { name: "printLogo", label: "Print Logo", type: "switch", defaultValue: false },
    { name: "printOrderHeader", label: "Print Order Header", type: "switch", defaultValue: true },
    { name: "printOrderFooter", label: "Print Order Footer", type: "switch", defaultValue: true },
    { name: "printVoids", label: "Print Voids/Cancellations", type: "switch", defaultValue: true },
    { name: "printReprints", label: "Print Reprints", type: "switch", defaultValue: true },
    {
      name: "backupPrinterId",
      label: "Backup Printer (Optional)",
      type: "select",
      options: [{ value: "__none__", label: "None" }, ...printers.filter(p => p.id !== editingItem?.id).map((p) => ({ value: p.id, label: p.name }))],
    },
    { name: "retryAttempts", label: "Retry Attempts", type: "text", placeholder: "3", defaultValue: "3" },
    {
      name: "failureHandlingMode",
      label: "Failure Handling",
      type: "select",
      options: [
        { value: "fail_silently", label: "Fail Silently" },
        { value: "alert_cashier", label: "Alert Cashier" },
        { value: "reroute_to_backup", label: "Reroute to Backup" },
      ],
      defaultValue: "alert_cashier",
    },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertPrinter) => {
      const response = await apiRequest("POST", "/api/printers", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      setFormOpen(false);
      toast({ title: "Printer created" });
    },
    onError: () => {
      toast({ title: "Failed to create printer", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Printer) => {
      const response = await apiRequest("PUT", "/api/printers/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Printer updated" });
    },
    onError: () => {
      toast({ title: "Failed to update printer", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/printers/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      toast({ title: "Printer deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete printer", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertPrinter) => {
    const cleanedData = {
      ...data,
      backupPrinterId: data.backupPrinterId === "__none__" ? null : (data.backupPrinterId || null),
      port: typeof data.port === "string" ? parseInt(data.port, 10) : (data.port ?? 9100),
      retryAttempts: typeof data.retryAttempts === "string" ? parseInt(data.retryAttempts as string, 10) : (data.retryAttempts ?? 3),
      characterWidth: typeof data.characterWidth === "string" ? parseInt(data.characterWidth as string, 10) : (data.characterWidth ?? 42),
    };
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...cleanedData } as Printer);
    } else {
      createMutation.mutate(cleanedData);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={printers}
        columns={columns}
        title="Printers"
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
        searchPlaceholder="Search printers..."
        emptyMessage="No printers configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertPrinterSchema}
        fields={formFields}
        title={editingItem ? "Edit Printer" : "Add Printer"}
        initialData={editingItem ? {
          ...editingItem,
          port: editingItem.port ?? 9100,
          retryAttempts: editingItem.retryAttempts ?? 3,
          characterWidth: editingItem.characterWidth ?? 42,
          backupPrinterId: editingItem.backupPrinterId || "__none__",
        } : undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
