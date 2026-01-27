import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useEmc } from "@/lib/emc-context";
import { insertTaxGroupSchema, type TaxGroup, type InsertTaxGroup } from "@shared/schema";

export default function TaxGroupsPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TaxGroup | null>(null);
  const { selectedEnterpriseId } = useEmc();
  const enterpriseParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";

  const { data: taxGroups = [], isLoading } = useQuery<TaxGroup[]>({
    queryKey: ["/api/tax-groups", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/tax-groups${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const columns: Column<TaxGroup>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "rate",
      header: "Rate",
      sortable: true,
      render: (value) => `${(parseFloat(value || "0") * 100).toFixed(2)}%`,
    },
    {
      key: "taxMode",
      header: "Type",
      render: (value) => (
        <Badge variant={value === "inclusive" ? "secondary" : "default"}>
          {value === "inclusive" ? "Inclusive" : "Add-on"}
        </Badge>
      ),
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Tax Group Name", type: "text", placeholder: "e.g., State Sales Tax", required: true },
    { name: "rate", label: "Tax Rate (%)", type: "number", placeholder: "e.g., 7.25 for 7.25%", required: true },
    { 
      name: "taxMode", 
      label: "Tax Type", 
      type: "select",
      options: [
        { value: "add_on", label: "Add-on (tax added to price)" },
        { value: "inclusive", label: "Inclusive (tax included in price)" },
      ],
      defaultValue: "add_on",
      required: true,
    },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertTaxGroup) => {
      const response = await apiRequest("POST", "/api/tax-groups", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-groups", { enterpriseId: selectedEnterpriseId }] });
      setFormOpen(false);
      toast({ title: "Tax group created" });
    },
    onError: () => {
      toast({ title: "Failed to create tax group", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: TaxGroup) => {
      const response = await apiRequest("PUT", "/api/tax-groups/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-groups", { enterpriseId: selectedEnterpriseId }] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Tax group updated" });
    },
    onError: () => {
      toast({ title: "Failed to update tax group", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/tax-groups/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-groups", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Tax group deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete tax group", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertTaxGroup) => {
    // Convert percentage to decimal for storage
    const dataWithDecimalRate = {
      ...data,
      rate: (parseFloat(data.rate as string) / 100).toString(),
    };
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...dataWithDecimalRate });
    } else {
      createMutation.mutate(dataWithDecimalRate);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={taxGroups}
        columns={columns}
        title="Tax Groups"
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
        searchPlaceholder="Search tax groups..."
        emptyMessage="No tax groups configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertTaxGroupSchema}
        fields={formFields}
        title={editingItem ? "Edit Tax Group" : "Add Tax Group"}
        initialData={editingItem ? {
          ...editingItem,
          rate: (parseFloat(editingItem.rate || "0") * 100).toString(),
        } : undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
