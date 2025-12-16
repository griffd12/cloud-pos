import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertMenuItemSchema, type MenuItem, type InsertMenuItem, type TaxGroup, type PrintClass } from "@shared/schema";

export default function MenuItemsPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  const { data: menuItems = [], isLoading } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items"],
  });

  const { data: taxGroups = [] } = useQuery<TaxGroup[]>({
    queryKey: ["/api/tax-groups"],
  });

  const { data: printClasses = [] } = useQuery<PrintClass[]>({
    queryKey: ["/api/print-classes"],
  });

  const columns: Column<MenuItem>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "shortName", header: "Short Name" },
    {
      key: "price",
      header: "Price",
      sortable: true,
      render: (value) => `$${parseFloat(value || "0").toFixed(2)}`,
    },
    {
      key: "taxGroupId",
      header: "Tax Group",
      render: (value) => taxGroups.find((t) => t.id === value)?.name || "-",
    },
    {
      key: "printClassId",
      header: "Print Class",
      render: (value) => printClasses.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Item Name", type: "text", placeholder: "e.g., Cheeseburger", required: true },
    { name: "shortName", label: "Short Name", type: "text", placeholder: "e.g., CHZBGR" },
    { name: "price", label: "Price", type: "number", placeholder: "0.00", required: true },
    {
      name: "taxGroupId",
      label: "Tax Group",
      type: "select",
      options: [{ value: "", label: "None" }, ...taxGroups.map((t) => ({ value: t.id, label: t.name }))],
    },
    {
      name: "printClassId",
      label: "Print Class",
      type: "select",
      options: [{ value: "", label: "None" }, ...printClasses.map((p) => ({ value: p.id, label: p.name }))],
    },
    { name: "color", label: "Button Color", type: "color", defaultValue: "#3B82F6" },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertMenuItem) => {
      const response = await apiRequest("POST", "/api/menu-items", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      setFormOpen(false);
      toast({ title: "Menu item created" });
    },
    onError: () => {
      toast({ title: "Failed to create menu item", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: MenuItem) => {
      const response = await apiRequest("PUT", "/api/menu-items/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Menu item updated" });
    },
    onError: () => {
      toast({ title: "Failed to update menu item", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/menu-items/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      toast({ title: "Menu item deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete menu item", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertMenuItem) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={menuItems}
        columns={columns}
        title="Menu Items"
        onAdd={() => {
          setEditingItem(null);
          setFormOpen(true);
        }}
        onEdit={(item) => {
          setEditingItem(item);
          setFormOpen(true);
        }}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        onDuplicate={(item) => {
          createMutation.mutate({
            ...item,
            name: `${item.name} (Copy)`,
          });
        }}
        isLoading={isLoading}
        searchPlaceholder="Search menu items..."
        emptyMessage="No menu items configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertMenuItemSchema}
        fields={formFields}
        title={editingItem ? "Edit Menu Item" : "Add Menu Item"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
