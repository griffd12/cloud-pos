import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { insertOrderDeviceSchema, type OrderDevice, type InsertOrderDevice, type Property, type KdsDevice } from "@shared/schema";
import { useEmcFilter } from "@/lib/emc-context";
import { getScopeColumn } from "@/components/admin/scope-column";

export default function OrderDevicesPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId: contextPropertyId, scopePayload } = useEmcFilter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrderDevice | null>(null);

  const { data: orderDevices = [], isLoading } = useQuery<OrderDevice[]>({
    queryKey: ["/api/order-devices", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/order-devices${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: kdsDevices = [] } = useQuery<KdsDevice[]>({
    queryKey: ["/api/kds-devices", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/kds-devices${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const columns: Column<OrderDevice>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code" },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "kdsDeviceId",
      header: "Controller KDS",
      render: (value) => {
        const kds = kdsDevices.find((k) => k.id === value);
        if (!kds) return <span className="text-muted-foreground">None</span>;
        return (
          <Badge variant="outline">
            {kds.name} ({kds.stationType})
          </Badge>
        );
      },
    },
    {
      key: "sendOn",
      header: "Send On",
      render: (value) => (
        <Badge variant="secondary">
          {value === "send_button" ? "Send Button" : "Dynamic"}
        </Badge>
      ),
    },
    {
      key: "sendVoids",
      header: "Send Voids",
      render: (value) => (value ? <Badge variant="secondary">Yes</Badge> : "-"),
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
  ];

  const kdsOptions = useMemo(() => {
    const getPropertyName = (propertyId: string) => {
      const prop = properties.find(p => p.id === propertyId);
      return prop?.name || "Unknown";
    };
    return [
      { value: "__none__", label: "None (No Controller)" },
      ...kdsDevices.map((k) => ({ 
        value: k.id, 
        label: `${k.name} (${k.stationType}) - ${getPropertyName(k.propertyId)}` 
      })),
    ];
  }, [kdsDevices, properties]);

  const formFields: FormFieldConfig[] = useMemo(() => [
    { name: "name", label: "Device Name", type: "text", placeholder: "e.g., Hot Line Expo", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., HOTLINE", required: true, description: "Short code for routing" },
    {
      name: "propertyId",
      label: "Property",
      type: "select",
      options: properties.map((p) => ({ value: p.id, label: p.name })),
      required: true,
      defaultValue: contextPropertyId || properties[0]?.id || "",
    },
    {
      name: "kdsDeviceId",
      label: "Controller KDS Device",
      type: "select",
      options: kdsOptions,
      description: "The KDS device that controls this order device's display and behavior settings",
    },
    {
      name: "sendOn",
      label: "Send On",
      type: "select",
      options: [
        { value: "send_button", label: "Send Button - Manual send" },
        { value: "dynamic", label: "Dynamic - Auto-send when ready" },
      ],
      defaultValue: "send_button",
      description: "When should orders be sent to this device",
    },
    { name: "sendVoids", label: "Send Voids", type: "switch", defaultValue: true, description: "Send void notifications to this device" },
    { name: "sendReprints", label: "Send Reprints", type: "switch", defaultValue: true, description: "Allow reprints on this device" },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ], [properties, kdsOptions, contextPropertyId]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertOrderDevice) => {
      const response = await apiRequest("POST", "/api/order-devices", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-devices", filterKeys] });
      setFormOpen(false);
      toast({ title: "Order device created" });
    },
    onError: () => {
      toast({ title: "Failed to create order device", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: OrderDevice) => {
      const response = await apiRequest("PUT", "/api/order-devices/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-devices", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Order device updated" });
    },
    onError: () => {
      toast({ title: "Failed to update order device", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/order-devices/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-devices", filterKeys] });
      toast({ title: "Order device deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete order device", variant: "destructive" });
    },
  });

  const cleanKdsDeviceId = (value: string | null | undefined): string | null => {
    if (!value || value === "__none__") return null;
    return value;
  };

  const handleSubmit = (data: InsertOrderDevice) => {
    const cleanedData = {
      ...data,
      kdsDeviceId: cleanKdsDeviceId(data.kdsDeviceId),
    };
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...cleanedData });
    } else {
      createMutation.mutate({ ...cleanedData, ...scopePayload });
    }
  };

  const getInitialData = (item: OrderDevice | null) => {
    if (!item) return undefined;
    return {
      ...item,
      kdsDeviceId: item.kdsDeviceId || "__none__",
    };
  };

  return (
    <div className="p-6">
      <DataTable
        data={orderDevices}
        columns={columns}
        title="Order Devices"
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
        searchPlaceholder="Search order devices..."
        emptyMessage="No order devices configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertOrderDeviceSchema}
        fields={formFields}
        title={editingItem ? "Edit Order Device" : "Add Order Device"}
        initialData={getInitialData(editingItem)}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
