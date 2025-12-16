import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertOrderDeviceSchema, type OrderDevice, type InsertOrderDevice, type Property } from "@shared/schema";

export default function OrderDevicesPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrderDevice | null>(null);

  const { data: orderDevices = [], isLoading } = useQuery<OrderDevice[]>({
    queryKey: ["/api/order-devices"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const columns: Column<OrderDevice>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "type",
      header: "Type",
      render: (value) => <Badge variant="outline">{value === "kds" ? "KDS" : "Printer"}</Badge>,
    },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    { key: "ipAddress", header: "IP Address" },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Device Name", type: "text", placeholder: "e.g., Hot Line KDS", required: true },
    {
      name: "type",
      label: "Type",
      type: "select",
      options: [
        { value: "kds", label: "KDS (Kitchen Display)" },
        { value: "printer", label: "Printer" },
      ],
      required: true,
    },
    {
      name: "propertyId",
      label: "Property",
      type: "select",
      options: properties.map((p) => ({ value: p.id, label: p.name })),
      required: true,
    },
    { name: "ipAddress", label: "IP Address", type: "text", placeholder: "e.g., 192.168.1.100" },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertOrderDevice) => {
      const response = await apiRequest("POST", "/api/order-devices", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-devices"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/order-devices"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/order-devices"] });
      toast({ title: "Order device deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete order device", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertOrderDevice) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
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
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
