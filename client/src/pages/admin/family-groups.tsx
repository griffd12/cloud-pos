import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertFamilyGroupSchema, type FamilyGroup, type InsertFamilyGroup, type MajorGroup } from "@shared/schema";

export default function FamilyGroupsPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FamilyGroup | null>(null);

  const { data: familyGroups = [], isLoading } = useQuery<FamilyGroup[]>({
    queryKey: ["/api/family-groups"],
  });

  const { data: majorGroups = [] } = useQuery<MajorGroup[]>({
    queryKey: ["/api/major-groups"],
  });

  const getMajorGroupName = (majorGroupId: string | null) => {
    if (!majorGroupId) return "-";
    const group = majorGroups.find(g => g.id === majorGroupId);
    return group?.name || "-";
  };

  const columns: Column<FamilyGroup>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "majorGroupId",
      header: "Major Group",
      render: (value) => getMajorGroupName(value),
    },
    {
      key: "displayOrder",
      header: "Order",
      sortable: true,
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Family Group Name", type: "text", placeholder: "e.g., Appetizers", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., APPS", required: true },
    {
      name: "majorGroupId",
      label: "Major Group",
      type: "select",
      options: [
        { value: "__none__", label: "None" },
        ...majorGroups.map(g => ({ value: g.id, label: g.name })),
      ],
    },
    { name: "displayOrder", label: "Display Order", type: "number", defaultValue: 0 },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertFamilyGroup) => {
      const payload = { ...data, majorGroupId: data.majorGroupId === "__none__" ? null : (data.majorGroupId || null) };
      const response = await apiRequest("POST", "/api/family-groups", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-groups"] });
      setFormOpen(false);
      toast({ title: "Family group created" });
    },
    onError: () => {
      toast({ title: "Failed to create family group", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FamilyGroup) => {
      const payload = { ...data, majorGroupId: data.majorGroupId === "__none__" ? null : (data.majorGroupId || null) };
      const response = await apiRequest("PUT", "/api/family-groups/" + data.id, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-groups"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Family group updated" });
    },
    onError: () => {
      toast({ title: "Failed to update family group", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/family-groups/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family-groups"] });
      toast({ title: "Family group deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete family group", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertFamilyGroup) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={familyGroups}
        columns={columns}
        title="Family Groups"
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
        searchPlaceholder="Search family groups..."
        emptyMessage="No family groups configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertFamilyGroupSchema}
        fields={formFields}
        title={editingItem ? "Edit Family Group" : "Add Family Group"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
