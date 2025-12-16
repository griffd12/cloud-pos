import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertPrintClassSchema, type PrintClass, type InsertPrintClass } from "@shared/schema";

export default function PrintClassesPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PrintClass | null>(null);

  const { data: printClasses = [], isLoading } = useQuery<PrintClass[]>({
    queryKey: ["/api/print-classes"],
  });

  const columns: Column<PrintClass>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Print Class Name", type: "text", placeholder: "e.g., Kitchen", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., KITCHEN", required: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertPrintClass) => {
      const response = await apiRequest("POST", "/api/print-classes", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-classes"] });
      setFormOpen(false);
      toast({ title: "Print class created" });
    },
    onError: () => {
      toast({ title: "Failed to create print class", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: PrintClass) => {
      const response = await apiRequest("PUT", "/api/print-classes/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-classes"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Print class updated" });
    },
    onError: () => {
      toast({ title: "Failed to update print class", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/print-classes/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-classes"] });
      toast({ title: "Print class deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete print class", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertPrintClass) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={printClasses}
        columns={columns}
        title="Print Classes"
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
        searchPlaceholder="Search print classes..."
        emptyMessage="No print classes configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertPrintClassSchema}
        fields={formFields}
        title={editingItem ? "Edit Print Class" : "Add Print Class"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
