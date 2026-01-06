import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertKdsDeviceSchema, type KdsDevice, type InsertKdsDevice, type Property } from "@shared/schema";

export default function KdsDevicesPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KdsDevice | null>(null);

  const { data: kdsDevices = [], isLoading } = useQuery<KdsDevice[]>({
    queryKey: ["/api/kds-devices"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const columns: Column<KdsDevice>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "stationType",
      header: "Station Type",
      render: (value) => {
        const types: Record<string, string> = {
          hot: "Hot Line",
          cold: "Cold Line",
          prep: "Prep",
          expo: "Expo",
          bar: "Bar",
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
      key: "expoMode",
      header: "Expo Mode",
      render: (value) => (value ? <Badge variant="secondary">Yes</Badge> : "-"),
    },
    {
      key: "showTimers",
      header: "Timers",
      render: (value) => (value ? <Badge variant="secondary">Yes</Badge> : "-"),
    },
    { key: "ipAddress", header: "IP Address" },
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
    { name: "name", label: "KDS Device Name", type: "text", placeholder: "e.g., Hot Line KDS 1", required: true },
    {
      name: "stationType",
      label: "Station Type",
      type: "select",
      options: [
        { value: "hot", label: "Hot Line" },
        { value: "cold", label: "Cold Line" },
        { value: "prep", label: "Prep Station" },
        { value: "expo", label: "Expo (Expediter)" },
        { value: "bar", label: "Bar" },
      ],
      defaultValue: "hot",
    },
    {
      name: "propertyId",
      label: "Property",
      type: "select",
      options: properties.map((p) => ({ value: p.id, label: p.name })),
      required: true,
    },
    { name: "showDraftItems", label: "Show Draft (Unsent) Items", type: "switch", defaultValue: false },
    { name: "showSentItemsOnly", label: "Show Sent Items Only", type: "switch", defaultValue: true },
    {
      name: "groupBy",
      label: "Group Items By",
      type: "select",
      options: [
        { value: "order", label: "Order" },
        { value: "item", label: "Item" },
        { value: "course", label: "Course" },
      ],
      defaultValue: "order",
    },
    { name: "showTimers", label: "Show Timers", type: "switch", defaultValue: true },
    {
      name: "autoSortBy",
      label: "Auto-Sort By",
      type: "select",
      options: [
        { value: "time", label: "Time (Oldest First)" },
        { value: "priority", label: "Priority" },
      ],
      defaultValue: "time",
    },
    { name: "allowBump", label: "Allow Bump", type: "switch", defaultValue: true },
    { name: "allowRecall", label: "Allow Recall", type: "switch", defaultValue: true },
    { name: "allowVoidDisplay", label: "Allow Void Display", type: "switch", defaultValue: true },
    { name: "expoMode", label: "Expo Mode", type: "switch", defaultValue: false, description: "Aggregates all items for final check before serving" },
    // New Order Notification Settings
    { name: "newOrderSound", label: "New Order Sound", type: "switch", defaultValue: true, description: "Play audio alert when new orders arrive" },
    { name: "newOrderBlinkSeconds", label: "New Order Blink Duration (seconds)", type: "number", defaultValue: 5, description: "How long new tickets flash (0 to disable)" },
    // Color Alert Settings
    { name: "colorAlert1Enabled", label: "Enable First Alert", type: "switch", defaultValue: true },
    { name: "colorAlert1Seconds", label: "First Alert After (seconds)", type: "number", defaultValue: 60 },
    {
      name: "colorAlert1Color",
      label: "First Alert Color",
      type: "select",
      options: [
        { value: "yellow", label: "Yellow" },
        { value: "orange", label: "Orange" },
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
        { value: "purple", label: "Purple" },
      ],
      defaultValue: "yellow",
    },
    { name: "colorAlert2Enabled", label: "Enable Second Alert", type: "switch", defaultValue: true },
    { name: "colorAlert2Seconds", label: "Second Alert After (seconds)", type: "number", defaultValue: 180 },
    {
      name: "colorAlert2Color",
      label: "Second Alert Color",
      type: "select",
      options: [
        { value: "yellow", label: "Yellow" },
        { value: "orange", label: "Orange" },
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
        { value: "purple", label: "Purple" },
      ],
      defaultValue: "orange",
    },
    { name: "colorAlert3Enabled", label: "Enable Third Alert", type: "switch", defaultValue: true },
    { name: "colorAlert3Seconds", label: "Third Alert After (seconds)", type: "number", defaultValue: 300 },
    {
      name: "colorAlert3Color",
      label: "Third Alert Color",
      type: "select",
      options: [
        { value: "yellow", label: "Yellow" },
        { value: "orange", label: "Orange" },
        { value: "red", label: "Red" },
        { value: "blue", label: "Blue" },
        { value: "purple", label: "Purple" },
      ],
      defaultValue: "red",
    },
    { name: "wsChannel", label: "WebSocket Channel", type: "text", placeholder: "e.g., kds-hot-1" },
    { name: "ipAddress", label: "IP Address", type: "text", placeholder: "e.g., 192.168.1.100" },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertKdsDevice) => {
      const response = await apiRequest("POST", "/api/kds-devices", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-devices"] });
      setFormOpen(false);
      toast({ title: "KDS device created" });
    },
    onError: () => {
      toast({ title: "Failed to create KDS device", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: KdsDevice) => {
      const response = await apiRequest("PUT", "/api/kds-devices/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-devices"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "KDS device updated" });
    },
    onError: () => {
      toast({ title: "Failed to update KDS device", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/kds-devices/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds-devices"] });
      toast({ title: "KDS device deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete KDS device", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertKdsDevice) => {
    // Convert string number fields to actual numbers
    const processedData = {
      ...data,
      newOrderBlinkSeconds: data.newOrderBlinkSeconds != null ? Number(data.newOrderBlinkSeconds) : null,
      colorAlert1Seconds: data.colorAlert1Seconds != null ? Number(data.colorAlert1Seconds) : null,
      colorAlert2Seconds: data.colorAlert2Seconds != null ? Number(data.colorAlert2Seconds) : null,
      colorAlert3Seconds: data.colorAlert3Seconds != null ? Number(data.colorAlert3Seconds) : null,
    };
    
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...processedData } as KdsDevice);
    } else {
      createMutation.mutate(processedData);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={kdsDevices}
        columns={columns}
        title="KDS Devices"
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
        searchPlaceholder="Search KDS devices..."
        emptyMessage="No KDS devices configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertKdsDeviceSchema}
        fields={formFields}
        title={editingItem ? "Edit KDS Device" : "Add KDS Device"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
