import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertEnterpriseSchema, type Enterprise, type InsertEnterprise } from "@shared/schema";

const columns: Column<Enterprise>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "code", header: "Code", sortable: true },
];

const formFields: FormFieldConfig[] = [
  { name: "name", label: "Enterprise Name", type: "text", placeholder: "Enter name", required: true },
  { name: "code", label: "Code", type: "text", placeholder: "e.g., ENT001", required: true },
];

export default function EnterprisesPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Enterprise | null>(null);

  const { data: enterprises = [], isLoading } = useQuery<Enterprise[]>({
    queryKey: ["/api/enterprises"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertEnterprise) => {
      const response = await apiRequest("POST", "/api/enterprises", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprises"] });
      setFormOpen(false);
      toast({ title: "Enterprise created" });
    },
    onError: () => {
      toast({ title: "Failed to create enterprise", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Enterprise) => {
      const response = await apiRequest("PUT", "/api/enterprises/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprises"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Enterprise updated" });
    },
    onError: () => {
      toast({ title: "Failed to update enterprise", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/enterprises/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enterprises"] });
      toast({ title: "Enterprise deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete enterprise", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertEnterprise) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={enterprises}
        columns={columns}
        title="Enterprises"
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
        searchPlaceholder="Search enterprises..."
        emptyMessage="No enterprises configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertEnterpriseSchema}
        fields={formFields}
        title={editingItem ? "Edit Enterprise" : "Add Enterprise"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
