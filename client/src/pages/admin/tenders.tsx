import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertTenderSchema, type Tender, type InsertTender } from "@shared/schema";

export default function TendersPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Tender | null>(null);

  const { data: tenders = [], isLoading } = useQuery<Tender[]>({
    queryKey: ["/api/tenders"],
  });

  const columns: Column<Tender>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "type",
      header: "Type",
      render: (value) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Tender Name", type: "text", placeholder: "e.g., Cash", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., CASH", required: true },
    {
      name: "type",
      label: "Type",
      type: "select",
      options: [
        { value: "cash", label: "Cash" },
        { value: "credit", label: "Credit Card" },
        { value: "gift", label: "Gift Card" },
        { value: "other", label: "Other" },
      ],
      required: true,
    },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertTender) => {
      const response = await apiRequest("POST", "/api/tenders", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenders"] });
      setFormOpen(false);
      toast({ title: "Tender created" });
    },
    onError: () => {
      toast({ title: "Failed to create tender", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Tender) => {
      const response = await apiRequest("PUT", "/api/tenders/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenders"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Tender updated" });
    },
    onError: () => {
      toast({ title: "Failed to update tender", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/tenders/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenders"] });
      toast({ title: "Tender deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete tender", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertTender) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={tenders}
        columns={columns}
        title="Tenders"
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
        searchPlaceholder="Search tenders..."
        emptyMessage="No tenders configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertTenderSchema}
        fields={formFields}
        title={editingItem ? "Edit Tender" : "Add Tender"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
