import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertServiceChargeSchema, type ServiceCharge, type InsertServiceCharge } from "@shared/schema";

export default function ServiceChargesPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ServiceCharge | null>(null);

  const { data: serviceCharges = [], isLoading } = useQuery<ServiceCharge[]>({
    queryKey: ["/api/service-charges"],
  });

  const columns: Column<ServiceCharge>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "type",
      header: "Type",
      render: (value) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: "value",
      header: "Value",
      render: (value, row) =>
        row.type === "percent" ? `${value}%` : `$${parseFloat(value || "0").toFixed(2)}`,
    },
    {
      key: "autoApply",
      header: "Auto Apply",
      render: (value) => (value ? <Badge>Yes</Badge> : "-"),
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Charge Name", type: "text", placeholder: "e.g., Delivery Fee", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., DELFEE", required: true },
    {
      name: "type",
      label: "Type",
      type: "select",
      options: [
        { value: "percent", label: "Percentage" },
        { value: "amount", label: "Fixed Amount" },
      ],
      required: true,
    },
    { name: "value", label: "Value", type: "number", placeholder: "e.g., 5.00", required: true },
    { name: "autoApply", label: "Auto Apply", type: "switch", description: "Automatically apply to applicable orders", defaultValue: false },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertServiceCharge) => {
      const response = await apiRequest("POST", "/api/service-charges", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-charges"] });
      setFormOpen(false);
      toast({ title: "Service charge created" });
    },
    onError: () => {
      toast({ title: "Failed to create service charge", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ServiceCharge) => {
      const response = await apiRequest("PUT", "/api/service-charges/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-charges"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Service charge updated" });
    },
    onError: () => {
      toast({ title: "Failed to update service charge", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/service-charges/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-charges"] });
      toast({ title: "Service charge deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete service charge", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertServiceCharge) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={serviceCharges}
        columns={columns}
        title="Service Charges"
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
        searchPlaceholder="Search service charges..."
        emptyMessage="No service charges configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertServiceChargeSchema}
        fields={formFields}
        title={editingItem ? "Edit Service Charge" : "Add Service Charge"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
