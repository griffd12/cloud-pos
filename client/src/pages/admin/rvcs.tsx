import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertRvcSchema, type Rvc, type InsertRvc, type Property, ORDER_TYPES, DOM_SEND_MODES } from "@shared/schema";

export default function RvcsPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Rvc | null>(null);

  const { data: rvcs = [], isLoading } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const columns: Column<Rvc>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "fastTransactionDefault",
      header: "Fast Transaction",
      render: (value) => (value ? <Badge>Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>),
    },
    {
      key: "dynamicOrderMode",
      header: "Dynamic Order",
      render: (value) => (value ? <Badge>Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>),
    },
    {
      key: "domSendMode",
      header: "DOM Send Mode",
      render: (value, row) => {
        if (!row.dynamicOrderMode) return "-";
        const labels: Record<string, string> = {
          fire_on_fly: "Fire on Fly",
          fire_on_next: "Fire on Next",
          fire_on_tender: "Fire on Tender",
        };
        return <Badge variant="outline">{labels[value as string] || value}</Badge>;
      },
    },
    { key: "defaultOrderType", header: "Default Order Type" },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "RVC Name", type: "text", placeholder: "Enter name", required: true },
    { name: "code", label: "Code", type: "text", placeholder: "e.g., RVC001", required: true },
    {
      name: "propertyId",
      label: "Property",
      type: "select",
      options: properties.map((p) => ({ value: p.id, label: p.name })),
      required: true,
    },
    {
      name: "defaultOrderType",
      label: "Default Order Type",
      type: "select",
      options: ORDER_TYPES.map((t) => ({ value: t, label: t.replace("_", " ").toUpperCase() })),
      defaultValue: "dine_in",
    },
    {
      name: "fastTransactionDefault",
      label: "Fast Transaction Mode",
      type: "switch",
      description: "Enable fast transaction mode by default for this RVC",
      defaultValue: false,
    },
    {
      name: "dynamicOrderMode",
      label: "Dynamic Order Mode",
      type: "switch",
      description: "Items appear on KDS immediately when added to check (no send required)",
      defaultValue: false,
    },
    {
      name: "domSendMode",
      label: "DOM Send Mode",
      type: "select",
      options: DOM_SEND_MODES.map((mode) => ({
        value: mode,
        label: mode === "fire_on_fly" ? "Fire on Fly (immediate)" :
               mode === "fire_on_next" ? "Fire on Next (when next item rung)" :
               "Fire on Tender (when payment made)",
      })),
      description: "When Dynamic Order Mode is enabled, controls when items are sent to KDS",
      defaultValue: "fire_on_fly",
    },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertRvc) => {
      const response = await apiRequest("POST", "/api/rvcs", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs"] });
      setFormOpen(false);
      toast({ title: "Revenue Center created" });
    },
    onError: () => {
      toast({ title: "Failed to create RVC", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Rvc) => {
      const response = await apiRequest("PUT", "/api/rvcs/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Revenue Center updated" });
    },
    onError: () => {
      toast({ title: "Failed to update RVC", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/rvcs/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs"] });
      toast({ title: "Revenue Center deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete RVC", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertRvc) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={rvcs}
        columns={columns}
        title="Revenue Centers"
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
        searchPlaceholder="Search RVCs..."
        emptyMessage="No revenue centers configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertRvcSchema}
        fields={formFields}
        title={editingItem ? "Edit Revenue Center" : "Add Revenue Center"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
