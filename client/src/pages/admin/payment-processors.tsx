import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useEmc } from "@/lib/emc-context";
import { insertPaymentProcessorSchema, type PaymentProcessor, type InsertPaymentProcessor, type Property } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, TestTube } from "lucide-react";

const GATEWAY_TYPES = [
  { value: "stripe", label: "Stripe", emv: false, description: "Online/card-not-present processing" },
  { value: "elavon_converge", label: "Elavon Converge", emv: true, description: "EMV terminal integration" },
  { value: "elavon_fusebox", label: "Elavon Fusebox", emv: true, description: "EMV terminal with multi-processor support" },
  { value: "heartland", label: "Heartland (Global Payments)", emv: true, description: "EMV terminal + online payments via Portico gateway" },
  { value: "shift4", label: "Shift4 (Coming Soon)", emv: true, description: "EMV terminal integration" },
  { value: "freedompay", label: "FreedomPay (Coming Soon)", emv: true, description: "EMV terminal integration" },
  { value: "eigen", label: "Eigen (Coming Soon)", emv: true, description: "EMV terminal integration" },
];

const ENVIRONMENTS = [
  { value: "sandbox", label: "Sandbox / Test" },
  { value: "production", label: "Production" },
];

export default function PaymentProcessorsPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PaymentProcessor | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const { selectedEnterpriseId } = useEmc();
  const enterpriseParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";

  const { data: processors = [], isLoading } = useQuery<PaymentProcessor[]>({
    queryKey: ["/api/payment-processors", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/payment-processors${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/properties${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const columns: Column<PaymentProcessor>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "gatewayType",
      header: "Gateway",
      render: (value) => {
        const gateway = GATEWAY_TYPES.find(g => g.value === value);
        return <Badge variant="outline">{gateway?.label || value}</Badge>;
      },
    },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "environment",
      header: "Environment",
      render: (value) => (
        <Badge variant={value === "production" ? "default" : "secondary"}>
          {value === "production" ? "Production" : "Sandbox"}
        </Badge>
      ),
    },
    {
      key: "credentialKeyPrefix",
      header: "Credential Prefix",
      render: (value) => value ? <code className="text-xs bg-muted px-1 rounded">{value}</code> : "-",
    },
    {
      key: "supportsTipAdjust",
      header: "Tip Adjust",
      render: (value) => (value ? <Badge className="bg-green-600">Yes</Badge> : <Badge variant="secondary">No</Badge>),
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const form = useForm<InsertPaymentProcessor>({
    resolver: zodResolver(insertPaymentProcessorSchema),
    defaultValues: {
      name: "",
      gatewayType: "stripe",
      propertyId: "",
      credentialKeyPrefix: "",
      environment: "sandbox",
      supportsTipAdjust: true,
      active: true,
    },
  });

  const selectedGateway = form.watch("gatewayType");
  const selectedPropertyId = form.watch("propertyId");

  const createMutation = useMutation({
    mutationFn: async (data: InsertPaymentProcessor) => {
      const response = await apiRequest("POST", "/api/payment-processors", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-processors", { enterpriseId: selectedEnterpriseId }] });
      setFormOpen(false);
      form.reset();
      toast({ title: "Payment processor created" });
    },
    onError: () => {
      toast({ title: "Failed to create payment processor", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertPaymentProcessor> }) => {
      const response = await apiRequest("PATCH", "/api/payment-processors/" + id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-processors", { enterpriseId: selectedEnterpriseId }] });
      setFormOpen(false);
      setEditingItem(null);
      form.reset();
      toast({ title: "Payment processor updated" });
    },
    onError: () => {
      toast({ title: "Failed to update payment processor", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/payment-processors/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-processors", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Payment processor deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete payment processor", variant: "destructive" });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingId(id);
      const response = await apiRequest("POST", `/api/payment-processors/${id}/test-connection`);
      return response.json();
    },
    onSuccess: (data) => {
      setTestingId(null);
      if (data.success) {
        toast({ title: "Connection successful", description: data.message });
      } else {
        toast({ title: "Connection failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => {
      setTestingId(null);
      toast({ title: "Connection test failed", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertPaymentProcessor) => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (item: PaymentProcessor) => {
    setEditingItem(item);
    form.reset({
      name: item.name,
      gatewayType: item.gatewayType,
      propertyId: item.propertyId,
      credentialKeyPrefix: item.credentialKeyPrefix || "",
      environment: (item.environment as "sandbox" | "production") || "sandbox",
      supportsTipAdjust: item.supportsTipAdjust ?? true,
      active: item.active ?? true,
    });
    setFormOpen(true);
  };

  const handleAdd = () => {
    setEditingItem(null);
    form.reset({
      name: "",
      gatewayType: "stripe",
      propertyId: properties[0]?.id || "",
      credentialKeyPrefix: "",
      environment: "sandbox",
      supportsTipAdjust: true,
      active: true,
    });
    setFormOpen(true);
  };

  const getCredentialHint = () => {
    switch (selectedGateway) {
      case "stripe":
        return "Secrets needed: {PREFIX}_SECRET_KEY. Example: If prefix is 'STRIPE', you need STRIPE_SECRET_KEY in Replit Secrets.";
      case "elavon_converge":
        return "Secrets needed: {PREFIX}_MERCHANT_ID, {PREFIX}_USER_ID, {PREFIX}_PIN. Example: If prefix is 'ELAVON', you need ELAVON_MERCHANT_ID, ELAVON_USER_ID, ELAVON_PIN in Replit Secrets.";
      case "elavon_fusebox":
        return "Secrets needed: {PREFIX}_SITE_ID, {PREFIX}_CHAIN_CODE, {PREFIX}_LOCATION_ID. Example: If prefix is 'ELAVON_FB', you need ELAVON_FB_SITE_ID, ELAVON_FB_CHAIN_CODE, ELAVON_FB_LOCATION_ID in Replit Secrets.";
      case "heartland":
        return "For card-present: {PREFIX}_SITE_ID, {PREFIX}_LICENSE_ID, {PREFIX}_DEVICE_ID, {PREFIX}_USERNAME, {PREFIX}_PASSWORD, {PREFIX}_DEVELOPER_ID, {PREFIX}_VERSION_NUMBER. For card-not-present: {PREFIX}_SECRET_API_KEY, {PREFIX}_DEVELOPER_ID, {PREFIX}_VERSION_NUMBER.";
      default:
        return "Set the prefix used to look up API credentials from Replit Secrets.";
    }
  };

  return (
    <div className="p-6">
      <DataTable
        data={processors}
        columns={columns}
        title="Payment Processors"
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        isLoading={isLoading}
        searchPlaceholder="Search payment processors..."
        emptyMessage="No payment processors configured"
        actions={(item) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => testConnectionMutation.mutate(item.id)}
            disabled={testingId === item.id}
            data-testid={`button-test-connection-${item.id}`}
          >
            {testingId === item.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TestTube className="h-4 w-4" />
            )}
          </Button>
        )}
      />

      <Dialog open={formOpen} onOpenChange={(open) => {
        if (!open) {
          setFormOpen(false);
          setEditingItem(null);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Payment Processor" : "Add Payment Processor"}</DialogTitle>
            <DialogDescription>
              Configure a payment gateway for processing credit card transactions.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Main Credit Card Processor" {...field} data-testid="input-processor-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gatewayType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gateway Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-gateway-type">
                          <SelectValue placeholder="Select gateway" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GATEWAY_TYPES.map((type) => (
                          <SelectItem 
                            key={type.value} 
                            value={type.value}
                            disabled={!["stripe", "elavon_converge", "elavon_fusebox", "heartland"].includes(type.value)}
                          >
                            <div className="flex flex-col">
                              <span>{type.label}</span>
                              <span className="text-xs text-muted-foreground">{type.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-property">
                          <SelectValue placeholder="Select property" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {properties.map((prop) => (
                          <SelectItem key={prop.id} value={prop.id}>
                            {prop.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="environment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Environment</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-environment">
                          <SelectValue placeholder="Select environment" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ENVIRONMENTS.map((env) => (
                          <SelectItem key={env.value} value={env.value}>
                            {env.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="credentialKeyPrefix"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credential Key Prefix</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., STRIPE or ELAVON" {...field} data-testid="input-credential-prefix" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {getCredentialHint()}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="supportsTipAdjust"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Tip Adjust</FormLabel>
                      <FormDescription className="text-xs">
                        Allow post-auth tips
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                        data-testid="switch-tip-adjust"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription className="text-xs">
                        Enable this processor
                      </FormDescription>
                    </div>
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

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingItem(null);
                  }}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending || (!editingItem && !selectedPropertyId)}
                  data-testid="button-submit"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingItem ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
