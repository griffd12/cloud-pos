import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable, type Column, type CustomAction } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertMenuItemSchema, type MenuItem, type InsertMenuItem, type TaxGroup, type PrintClass, type Slu, type MenuItemSlu } from "@shared/schema";
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

  const { data: slus = [] } = useQuery<Slu[]>({
    queryKey: ["/api/slus"],
  });

  const { data: allMenuItemSlus = [] } = useQuery<MenuItemSlu[]>({
    queryKey: ["/api/menu-item-slus"],
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
      key: "id",
      header: "Categories (SLUs)",
      render: (value) => {
        const linkedSluIds = allMenuItemSlus.filter(l => l.menuItemId === value).map(l => l.sluId);
        if (linkedSluIds.length === 0) {
          return <span className="text-muted-foreground text-sm">Not linked</span>;
        }
        const linkedSlus = slus.filter(s => linkedSluIds.includes(s.id));
        return (
          <div className="flex flex-wrap gap-1">
            {linkedSlus.slice(0, 3).map(slu => (
              <Badge key={slu.id} variant="secondary" className="text-xs">
                {slu.buttonLabel || slu.name}
              </Badge>
            ))}
            {linkedSlus.length > 3 && (
              <Badge variant="outline" className="text-xs">+{linkedSlus.length - 3}</Badge>
            )}
          </div>
        );
      },
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
      queryClient.invalidateQueries({ queryKey: ["/api/menu-item-slus"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/menu-item-slus"] });
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

  const createDuplicate = useMutation({
    mutationFn: async (item: MenuItem) => {
      const response = await apiRequest("POST", "/api/menu-items", {
        ...item,
        name: `${item.name} (Copy)`,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      toast({ title: "Menu item duplicated" });
    },
    onError: () => {
      toast({ title: "Failed to duplicate menu item", variant: "destructive" });
    },
  });

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
        onDuplicate={(item) => createDuplicate.mutate(item)}
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

      <MenuItemFormDialog
        key={editingItem?.id || "new"}
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        taxGroups={taxGroups}
        printClasses={printClasses}
        slus={slus}
        existingSlus={allMenuItemSlus}
      />
    </div>
  );
}

interface MenuItemFormDialogProps {
  open: boolean;
  onClose: () => void;
  editingItem: MenuItem | null;
  taxGroups: TaxGroup[];
  printClasses: PrintClass[];
  slus: Slu[];
  existingSlus: MenuItemSlu[];
}

function MenuItemFormDialog({
  open,
  onClose,
  editingItem,
  taxGroups,
  printClasses,
  slus,
  existingSlus,
}: MenuItemFormDialogProps) {
  const { toast } = useToast();
  
  const initialSluIds = editingItem 
    ? existingSlus.filter(l => l.menuItemId === editingItem.id).map(l => l.sluId)
    : [];
    
  const [selectedSlus, setSelectedSlus] = useState<string[]>(initialSluIds);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<InsertMenuItem>({
    resolver: zodResolver(insertMenuItemSchema),
    defaultValues: editingItem ? {
      name: editingItem.name,
      shortName: editingItem.shortName || "",
      price: editingItem.price,
      taxGroupId: editingItem.taxGroupId || "__none__",
      printClassId: editingItem.printClassId || "__none__",
      color: editingItem.color || "#3B82F6",
      active: editingItem.active ?? true,
      enterpriseId: editingItem.enterpriseId,
      propertyId: editingItem.propertyId,
      rvcId: editingItem.rvcId,
    } : {
      name: "",
      shortName: "",
      price: "",
      taxGroupId: "__none__",
      printClassId: "__none__",
      color: "#3B82F6",
      active: true,
    },
  });

  const toggleSlu = (sluId: string) => {
    setSelectedSlus(prev => 
      prev.includes(sluId)
        ? prev.filter(id => id !== sluId)
        : [...prev, sluId]
    );
  };

  const handleSubmit = async (data: InsertMenuItem) => {
    setIsSaving(true);
    try {
      const cleanedData: InsertMenuItem = {
        ...data,
        price: String(data.price),
        taxGroupId: data.taxGroupId === "__none__" ? null : (data.taxGroupId || null),
        printClassId: data.printClassId === "__none__" ? null : (data.printClassId || null),
      };

      let menuItemId: string;
      
      if (editingItem) {
        const response = await apiRequest("PUT", "/api/menu-items/" + editingItem.id, cleanedData);
        const updated = await response.json();
        menuItemId = updated.id;
      } else {
        const response = await apiRequest("POST", "/api/menu-items", cleanedData);
        const created = await response.json();
        menuItemId = created.id;
      }

      await apiRequest("POST", `/api/menu-items/${menuItemId}/slus`, { sluIds: selectedSlus });

      queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/menu-item-slus"] });
      
      toast({ title: editingItem ? "Menu item updated" : "Menu item created" });
      onClose();
    } catch (error: any) {
      toast({ title: error.message || "Failed to save menu item", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setSelectedSlus([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle data-testid="text-form-title">
            {editingItem ? "Edit Menu Item" : "Add Menu Item"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto -mx-6 px-6 pr-4">
              <div className="space-y-4 py-4 pr-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Cheeseburger" {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shortName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., CHZBGR" {...field} value={field.value || ""} data-testid="input-shortName" />
                      </FormControl>
                      <FormDescription>Abbreviated name for receipts/KDS</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price *</FormLabel>
                      <FormControl>
                        <Input placeholder="0.00" {...field} data-testid="input-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="taxGroupId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax Group</FormLabel>
                      <Select value={field.value || "__none__"} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-taxGroupId">
                            <SelectValue placeholder="Select tax group..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {taxGroups.map(tg => (
                            <SelectItem key={tg.id} value={tg.id}>{tg.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="printClassId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Print Class</FormLabel>
                      <Select value={field.value || "__none__"} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-printClassId">
                            <SelectValue placeholder="Select print class..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {printClasses.map(pc => (
                            <SelectItem key={pc.id} value={pc.id}>{pc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Routes items to kitchen printers/KDS</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Button Color</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={field.value || "#3B82F6"}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="w-10 h-10 rounded border cursor-pointer"
                            data-testid="color-color"
                          />
                          <Input
                            placeholder="#3B82F6"
                            {...field}
                            value={field.value || ""}
                            className="flex-1"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <FormLabel>Active</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                          data-testid="switch-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="pt-4 border-t">
                  <Label className="text-base font-semibold">Category Assignment (SLUs)</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select which categories this item appears in on the POS. Items must be linked to at least one category to be available for ordering.
                  </p>
                  
                  {slus.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      No categories configured. Create SLUs in the Categories section first.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                      {slus.map(slu => (
                        <div
                          key={slu.id}
                          className="flex items-center space-x-2 p-2 rounded hover-elevate cursor-pointer"
                          onClick={() => toggleSlu(slu.id)}
                        >
                          <Checkbox
                            id={`slu-${slu.id}`}
                            checked={selectedSlus.includes(slu.id)}
                            onCheckedChange={() => toggleSlu(slu.id)}
                            data-testid={`checkbox-slu-${slu.id}`}
                          />
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div 
                              className="w-3 h-3 rounded flex-shrink-0" 
                              style={{ backgroundColor: slu.color || "#3B82F6" }} 
                            />
                            <label
                              htmlFor={`slu-${slu.id}`}
                              className="text-sm font-medium cursor-pointer truncate"
                            >
                              {slu.buttonLabel || slu.name}
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {selectedSlus.length === 0 && slus.length > 0 && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                      Warning: Item won't appear on POS without category assignment
                    </p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-4 flex-shrink-0 border-t mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} data-testid="button-form-submit">
                {isSaving ? "Saving..." : (editingItem ? "Update" : "Create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
