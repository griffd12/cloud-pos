import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column, type CustomAction } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertMenuItemSchema, type MenuItem, type InsertMenuItem, type TaxGroup, type PrintClass } from "@shared/schema";
import { Download, Upload, Unlink } from "lucide-react";

export default function MenuItemsPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const response = await apiRequest("DELETE", "/api/menu-items/" + id);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      toast({ title: "Menu item deleted" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to delete menu item", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const response = await apiRequest("POST", "/api/menu-items/import", items);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      toast({ title: `Imported ${data.imported} menu items` });
    },
    onError: () => {
      toast({ title: "Failed to import menu items", variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/menu-items/${id}/unlink-slus`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      toast({ title: data.message || "Item unlinked from categories and deactivated" });
    },
    onError: () => {
      toast({ title: "Failed to unlink menu item", variant: "destructive" });
    },
  });

  const handleExport = () => {
    const headers = ["name", "shortName", "price", "color", "active"];
    const csvRows = [headers.join(",")];
    
    for (const item of menuItems) {
      const row = [
        `"${(item.name || "").replace(/"/g, '""')}"`,
        `"${(item.shortName || "").replace(/"/g, '""')}"`,
        item.price || "0",
        `"${item.color || "#3B82F6"}"`,
        item.active ? "true" : "false",
      ];
      csvRows.push(row.join(","));
    }
    
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "menu-items.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Menu items exported to CSV" });
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split("\n").filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const items: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      
      const item: any = {};
      headers.forEach((header, idx) => {
        let value = values[idx] || "";
        value = value.replace(/^"|"$/g, "").replace(/""/g, '"');
        if (header === "active") {
          item[header] = value.toLowerCase() === "true";
        } else if (header === "price") {
          item[header] = value;
        } else {
          item[header] = value;
        }
      });
      
      if (item.name) {
        items.push(item);
      }
    }
    
    return items;
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const items = parseCSV(text);
        if (items.length > 0) {
          importMutation.mutate(items);
        } else {
          toast({ title: "No valid items found in CSV file", variant: "destructive" });
        }
      } catch {
        toast({ title: "Failed to parse CSV file", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (data: InsertMenuItem) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-menu">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
            data-testid="button-import-menu"
          >
            <Upload className="w-4 h-4 mr-2" />
            {importMutation.isPending ? "Importing..." : "Import CSV"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImport}
            className="hidden"
            data-testid="input-import-file"
          />
        </div>
      </div>
      
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
        customActions={[
          {
            label: "Unlink from Categories",
            icon: Unlink,
            onClick: (item) => unlinkMutation.mutate(item.id),
          },
        ] as CustomAction<MenuItem>[]}
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
