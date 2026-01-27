import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmc } from "@/lib/emc-context";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Plus, ShoppingBag, ExternalLink, RefreshCw, Check, X } from "lucide-react";
import type { Property, OnlineOrderSource, OnlineOrder } from "@shared/schema";

const ORDER_SOURCE_TYPES = ["doordash", "ubereats", "grubhub", "direct", "other"] as const;

export default function OnlineOrderingPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { selectedEnterpriseId } = useEmc();
  const enterpriseParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [editingSource, setEditingSource] = useState<OnlineOrderSource | null>(null);

  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState<string>("direct");
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/properties${enterpriseParam}`);
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: orderSources = [], isLoading: sourcesLoading } = useQuery<OnlineOrderSource[]>({
    queryKey: ["/api/online-order-sources", selectedPropertyId, { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/online-order-sources?propertyId=${selectedPropertyId}${selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch order sources");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: onlineOrders = [], isLoading: ordersLoading } = useQuery<OnlineOrder[]>({
    queryKey: ["/api/online-orders", selectedPropertyId, { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/online-orders?propertyId=${selectedPropertyId}${selectedEnterpriseId ? `&enterpriseId=${selectedEnterpriseId}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch online orders");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const createSourceMutation = useMutation({
    mutationFn: async (data: Partial<OnlineOrderSource>) => {
      const res = await apiRequest("POST", "/api/online-order-sources", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-order-sources", selectedPropertyId, { enterpriseId: selectedEnterpriseId }] });
      resetSourceDialog();
      toast({ title: "Source Created", description: "Online order source has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSourceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<OnlineOrderSource> }) => {
      const res = await apiRequest("PATCH", `/api/online-order-sources/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-order-sources", selectedPropertyId, { enterpriseId: selectedEnterpriseId }] });
      resetSourceDialog();
      toast({ title: "Source Updated", description: "Online order source has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const injectOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/online-orders/${orderId}/inject`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-orders", selectedPropertyId, { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Order Injected", description: "Order has been sent to the POS." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetSourceDialog = () => {
    setSourceName("");
    setSourceType("direct");
    setApiEndpoint("");
    setCommissionPercent("");
    setIsActive(true);
    setEditingSource(null);
    setShowSourceDialog(false);
  };

  const openEditDialog = (source: OnlineOrderSource) => {
    setEditingSource(source);
    setSourceName(source.sourceName);
    setSourceType(source.sourceType);
    setApiEndpoint(source.webhookUrl || "");
    setCommissionPercent(source.commissionPercent || "");
    setIsActive(source.active ?? true);
    setShowSourceDialog(true);
  };

  const handleSaveSource = () => {
    if (!sourceName || !sourceType) return;
    
    const data = {
      name: sourceName,
      sourceType,
      propertyId: selectedPropertyId,
      apiEndpoint: apiEndpoint || undefined,
      commissionPercent: commissionPercent || undefined,
      active: isActive,
    };

    if (editingSource) {
      updateSourceMutation.mutate({ id: editingSource.id, data });
    } else {
      createSourceMutation.mutate(data);
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "doordash": return "🚗";
      case "ubereats": return "🍔";
      case "grubhub": return "🥡";
      default: return "🛒";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline">Pending</Badge>;
      case "confirmed": return <Badge variant="default">Confirmed</Badge>;
      case "preparing": return <Badge className="bg-yellow-500">Preparing</Badge>;
      case "ready": return <Badge className="bg-green-500">Ready</Badge>;
      case "completed": return <Badge variant="secondary">Completed</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "$0.00";
    return `$${parseFloat(value).toFixed(2)}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Online Ordering</h1>
          <p className="text-muted-foreground">Manage online order integrations and incoming orders</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Property</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-64" data-testid="select-property">
              <SelectValue placeholder="Select a property..." />
            </SelectTrigger>
            <SelectContent>
              {properties.map(prop => (
                <SelectItem key={prop.id} value={prop.id}>{prop.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedPropertyId && (
        <Tabs defaultValue="sources" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sources" data-testid="tab-sources">Order Sources</TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders">Incoming Orders</TabsTrigger>
          </TabsList>

          <TabsContent value="sources" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowSourceDialog(true)} data-testid="button-add-source">
                <Plus className="w-4 h-4 mr-2" />
                Add Source
              </Button>
            </div>

            {sourcesLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : orderSources.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No order sources configured.</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orderSources.map(source => (
                  <Card key={source.id} className="hover-elevate cursor-pointer" onClick={() => openEditDialog(source)} data-testid={`card-source-${source.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="text-xl">{getSourceIcon(source.sourceType)}</span>
                        {source.sourceName}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant={source.active ? "default" : "secondary"}>{source.active ? "Active" : "Inactive"}</Badge>
                        <span className="text-xs">{source.sourceType}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {source.commissionPercent && (
                        <p className="text-sm text-muted-foreground">Commission: {source.commissionPercent}%</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>Incoming Orders</span>
                  <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/online-orders"] })}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {ordersLoading ? (
                  <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : onlineOrders.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">No incoming orders.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {onlineOrders.map(order => (
                        <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                          <TableCell className="font-mono text-sm">{order.externalOrderId}</TableCell>
                          <TableCell>{orderSources.find(s => s.id === order.sourceId)?.sourceName || "-"}</TableCell>
                          <TableCell>{getStatusBadge(order.status || "pending")}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(order.subtotal)}</TableCell>
                          <TableCell>{order.customerName || "-"}</TableCell>
                          <TableCell>{order.createdAt ? format(new Date(order.createdAt), "h:mm a") : "-"}</TableCell>
                          <TableCell>
                            {order.status === "pending" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => injectOrderMutation.mutate(order.id)}
                                disabled={injectOrderMutation.isPending}
                                data-testid={`button-inject-${order.id}`}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Inject
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={showSourceDialog} onOpenChange={(open) => { if (!open) resetSourceDialog(); setShowSourceDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSource ? "Edit Order Source" : "Add Order Source"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Source Name</Label>
              <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g., DoorDash" data-testid="input-source-name" />
            </div>
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger data-testid="select-source-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_SOURCE_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>API Endpoint (optional)</Label>
              <Input value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} placeholder="https://..." data-testid="input-api-endpoint" />
            </div>
            <div className="space-y-2">
              <Label>Commission %</Label>
              <Input type="number" step="0.1" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} placeholder="0" data-testid="input-commission" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-active" />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetSourceDialog}>Cancel</Button>
            <Button onClick={handleSaveSource} disabled={!sourceName || createSourceMutation.isPending || updateSourceMutation.isPending} data-testid="button-save-source">
              {(createSourceMutation.isPending || updateSourceMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingSource ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
