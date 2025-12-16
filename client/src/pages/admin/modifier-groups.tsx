import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertModifierGroupSchema, type ModifierGroup, type InsertModifierGroup } from "@shared/schema";

export default function ModifierGroupsPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ModifierGroup | null>(null);

  const { data: modifierGroups = [], isLoading } = useQuery<ModifierGroup[]>({
    queryKey: ["/api/modifier-groups"],
  });

  const columns: Column<ModifierGroup>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "required",
      header: "Required",
      render: (value) => (value ? <Badge>Required</Badge> : <Badge variant="secondary">Optional</Badge>),
    },
    { key: "minSelect", header: "Min", sortable: true },
    { key: "maxSelect", header: "Max", sortable: true },
    { key: "displayOrder", header: "Order" },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Group Name", type: "text", placeholder: "e.g., Meat Temperature", required: true },
    { name: "required", label: "Required Selection", type: "switch", defaultValue: false },
    { name: "minSelect", label: "Minimum Selections", type: "number", placeholder: "0", defaultValue: 0 },
    { name: "maxSelect", label: "Maximum Selections", type: "number", placeholder: "99", defaultValue: 99 },
    { name: "displayOrder", label: "Display Order", type: "number", placeholder: "0", defaultValue: 0 },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertModifierGroup) => {
      const response = await apiRequest("POST", "/api/modifier-groups", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups"] });
      setFormOpen(false);
      toast({ title: "Modifier group created" });
    },
    onError: () => {
      toast({ title: "Failed to create modifier group", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ModifierGroup) => {
      const response = await apiRequest("PUT", "/api/modifier-groups/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Modifier group updated" });
    },
    onError: () => {
      toast({ title: "Failed to update modifier group", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/modifier-groups/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups"] });
      toast({ title: "Modifier group deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete modifier group", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertModifierGroup) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={modifierGroups}
        columns={columns}
        title="Modifier Groups"
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
        searchPlaceholder="Search modifier groups..."
        emptyMessage="No modifier groups configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertModifierGroupSchema}
        fields={formFields}
        title={editingItem ? "Edit Modifier Group" : "Add Modifier Group"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
