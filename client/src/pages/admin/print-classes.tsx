import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  insertPrintClassSchema, 
  type PrintClass, 
  type InsertPrintClass, 
  type OrderDevice,
  type PrintClassRouting,
  type Property
} from "@shared/schema";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export default function PrintClassesPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PrintClass | null>(null);

  const { data: printClasses = [], isLoading } = useQuery<PrintClass[]>({
    queryKey: ["/api/print-classes"],
  });

  const { data: orderDevices = [] } = useQuery<OrderDevice[]>({
    queryKey: ["/api/order-devices"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: allRoutings = [] } = useQuery<PrintClassRouting[]>({
    queryKey: ["/api/print-class-routing"],
  });

  const columns: Column<PrintClass>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    {
      key: "id",
      header: "Order Devices",
      render: (value) => {
        const linkedDevices = allRoutings
          .filter(r => r.printClassId === value)
          .map(r => orderDevices.find(od => od.id === r.orderDeviceId)?.name)
          .filter(Boolean);
        
        if (linkedDevices.length === 0) {
          return <span className="text-muted-foreground">None</span>;
        }
        
        return (
          <div className="flex flex-wrap gap-1">
            {linkedDevices.map((name, i) => (
              <Badge key={i} variant="secondary">{name}</Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: "active",
      header: "Active",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertPrintClass) => {
      const response = await apiRequest("POST", "/api/print-classes", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print-classes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/print-class-routing"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/print-class-routing"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/print-class-routing"] });
      toast({ title: "Print class deleted" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete print class", 
        description: error?.message || "This print class may still be in use.",
        variant: "destructive" 
      });
    },
  });

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

      <PrintClassFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        orderDevices={orderDevices}
        properties={properties}
        existingRoutings={allRoutings}
        onSubmit={async (data, selectedOrderDeviceIds) => {
          try {
            let printClassId: string;
            
            if (editingItem) {
              await updateMutation.mutateAsync({ ...editingItem, ...data });
              printClassId = editingItem.id;
            } else {
              const result = await createMutation.mutateAsync(data);
              printClassId = result.id;
            }

            const existingRoutingsForClass = allRoutings.filter(r => r.printClassId === printClassId);
            const existingOrderDeviceIds = existingRoutingsForClass.map(r => r.orderDeviceId);

            const toAdd = selectedOrderDeviceIds.filter(id => !existingOrderDeviceIds.includes(id));
            const toRemove = existingRoutingsForClass.filter(r => !selectedOrderDeviceIds.includes(r.orderDeviceId));

            for (const orderDeviceId of toAdd) {
              await apiRequest("POST", "/api/print-class-routing", {
                printClassId,
                orderDeviceId,
              });
            }

            for (const routing of toRemove) {
              await apiRequest("DELETE", `/api/print-class-routing/${routing.id}`);
            }

            queryClient.invalidateQueries({ queryKey: ["/api/print-class-routing"] });
            setFormOpen(false);
            setEditingItem(null);
            toast({ title: editingItem ? "Print class updated" : "Print class created" });
          } catch (error) {
            toast({ title: "Failed to save print class", variant: "destructive" });
          }
        }}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

interface PrintClassFormDialogProps {
  open: boolean;
  onClose: () => void;
  editingItem: PrintClass | null;
  orderDevices: OrderDevice[];
  properties: Property[];
  existingRoutings: PrintClassRouting[];
  onSubmit: (data: InsertPrintClass, selectedOrderDeviceIds: string[]) => Promise<void>;
  isLoading: boolean;
}

function PrintClassFormDialog({ 
  open, 
  onClose, 
  editingItem, 
  orderDevices,
  properties,
  existingRoutings,
  onSubmit, 
  isLoading 
}: PrintClassFormDialogProps) {
  const [selectedOrderDevices, setSelectedOrderDevices] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<InsertPrintClass>({
    resolver: zodResolver(insertPrintClassSchema),
    defaultValues: {
      name: "",
      code: "",
      active: true,
    },
  });

  useEffect(() => {
    if (open) {
      if (editingItem) {
        form.reset({
          name: editingItem.name,
          code: editingItem.code,
          enterpriseId: editingItem.enterpriseId,
          propertyId: editingItem.propertyId,
          rvcId: editingItem.rvcId,
          active: editingItem.active ?? true,
        });
        const linkedOrderDeviceIds = existingRoutings
          .filter(r => r.printClassId === editingItem.id)
          .map(r => r.orderDeviceId);
        setSelectedOrderDevices(linkedOrderDeviceIds);
      } else {
        form.reset({
          name: "",
          code: "",
          active: true,
        });
        setSelectedOrderDevices([]);
      }
    }
  }, [open, editingItem, existingRoutings]);

  const toggleOrderDevice = (orderDeviceId: string) => {
    setSelectedOrderDevices(prev => 
      prev.includes(orderDeviceId)
        ? prev.filter(id => id !== orderDeviceId)
        : [...prev, orderDeviceId]
    );
  };

  const handleSubmit = async (data: InsertPrintClass) => {
    setIsSaving(true);
    try {
      await onSubmit(data, selectedOrderDevices);
    } finally {
      setIsSaving(false);
    }
  };

  const getPropertyName = (propertyId: string) => {
    return properties.find(p => p.id === propertyId)?.name || "Unknown";
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle data-testid="text-form-title">
            {editingItem ? "Edit Print Class" : "Add Print Class"}
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
                      <FormLabel>Print Class Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Hot/Cold" {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., HOT_COLD" {...field} data-testid="input-code" />
                      </FormControl>
                      <FormDescription>Short code for identification</FormDescription>
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

                <div className="border rounded-md p-4 space-y-3">
                  <div>
                    <h4 className="font-medium text-sm">Order Devices</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Select which Order Devices should receive orders for menu items using this Print Class.
                    </p>
                  </div>

                  {orderDevices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No order devices configured. Please create order devices first.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {orderDevices.map((device) => (
                        <div 
                          key={device.id} 
                          className="flex items-center space-x-3 p-2 rounded-md hover-elevate cursor-pointer"
                          onClick={() => toggleOrderDevice(device.id)}
                          data-testid={`checkbox-orderdevice-${device.id}`}
                        >
                          <Checkbox 
                            checked={selectedOrderDevices.includes(device.id)}
                            onCheckedChange={() => toggleOrderDevice(device.id)}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{device.name}</span>
                              <Badge variant="outline" className="text-xs">{device.code}</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {getPropertyName(device.propertyId)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedOrderDevices.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        Selected: {selectedOrderDevices.length} device(s)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="flex-shrink-0 border-t pt-4 mt-2">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || isSaving} data-testid="button-save">
                {isLoading || isSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
