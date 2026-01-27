import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useEmc } from "@/lib/emc-context";
import { insertModifierSchema, type Modifier, type InsertModifier } from "@shared/schema";

export default function ModifiersPage() {
  const { toast } = useToast();
  const { selectedEnterpriseId } = useEmc();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Modifier | null>(null);

  const enterpriseParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";

  const { data: modifiers = [], isLoading } = useQuery<Modifier[]>({
    queryKey: ["/api/modifiers", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/modifiers${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch modifiers");
      return res.json();
    },
  });

  const columns: Column<Modifier>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "priceDelta",
      header: "Price Delta",
      render: (value) => {
        const num = parseFloat(value as string);
        if (num === 0) return <span className="text-muted-foreground">No charge</span>;
        return <span className={num > 0 ? "text-green-600" : "text-red-600"}>
          {num > 0 ? "+" : ""}{num.toFixed(2)}
        </span>;
      },
    },
    {
      key: "isActive",
      header: "Status",
      render: (value) => (
        value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      render: (_, row) => {
        if (row.enterpriseId) return <Badge variant="outline">Enterprise</Badge>;
        if (row.propertyId) return <Badge variant="outline">Property</Badge>;
        if (row.rvcId) return <Badge variant="outline">RVC</Badge>;
        return <Badge variant="outline">Global</Badge>;
      },
    },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Modifier Name", type: "text", placeholder: "e.g., Extra Cheese", required: true },
    { name: "priceDelta", label: "Price Delta", type: "decimal", placeholder: "0.00", defaultValue: "0" },
    { name: "isActive", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertModifier) => {
      const response = await apiRequest("POST", "/api/modifiers", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifiers", { enterpriseId: selectedEnterpriseId }] });
      setFormOpen(false);
      toast({ title: "Modifier created" });
    },
    onError: () => {
      toast({ title: "Failed to create modifier", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Modifier) => {
      const response = await apiRequest("PUT", "/api/modifiers/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifiers", { enterpriseId: selectedEnterpriseId }] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Modifier updated" });
    },
    onError: () => {
      toast({ title: "Failed to update modifier", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/modifiers/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifiers", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Modifier deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete modifier", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertModifier) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={modifiers}
        columns={columns}
        title="Modifiers"
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
        searchPlaceholder="Search modifiers..."
        emptyMessage="No modifiers configured. Create modifiers here, then link them to Modifier Groups."
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertModifierSchema}
        fields={formFields}
        title={editingItem ? "Edit Modifier" : "Add Modifier"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
