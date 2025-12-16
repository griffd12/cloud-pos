import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertSluSchema, type Slu, type InsertSlu } from "@shared/schema";

export default function SlusPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Slu | null>(null);

  const { data: slus = [], isLoading } = useQuery<Slu[]>({
    queryKey: ["/api/slus"],
  });

  const columns: Column<Slu>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "buttonLabel", header: "Button Label" },
    { key: "displayOrder", header: "Order", sortable: true },
    {
      key: "color",
      header: "Color",
      render: (value) => (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: value || "#3B82F6" }} />
          <span className="text-xs text-muted-foreground">{value}</span>
        </div>
      ),
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "SLU Name", type: "text", placeholder: "e.g., Appetizers", required: true },
    { name: "buttonLabel", label: "Button Label", type: "text", placeholder: "Short label for button", required: true },
    { name: "displayOrder", label: "Display Order", type: "number", placeholder: "0", defaultValue: 0 },
    { name: "color", label: "Color", type: "color", defaultValue: "#3B82F6" },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertSlu) => {
      const response = await apiRequest("POST", "/api/slus", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slus"] });
      setFormOpen(false);
      toast({ title: "SLU created" });
    },
    onError: () => {
      toast({ title: "Failed to create SLU", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Slu) => {
      const response = await apiRequest("PUT", "/api/slus/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slus"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "SLU updated" });
    },
    onError: () => {
      toast({ title: "Failed to update SLU", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/slus/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/slus"] });
      toast({ title: "SLU deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete SLU", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertSlu) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={slus}
        columns={columns}
        title="Screen Lookup Units (Categories)"
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
        searchPlaceholder="Search SLUs..."
        emptyMessage="No SLUs configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertSluSchema}
        fields={formFields}
        title={editingItem ? "Edit SLU" : "Add SLU"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
