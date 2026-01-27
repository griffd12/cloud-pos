import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useEmc } from "@/lib/emc-context";
import { insertRvcSchema, type Rvc, type InsertRvc, type Property, ORDER_TYPES, DOM_SEND_MODES } from "@shared/schema";
import { FileText, Save, Loader2 } from "lucide-react";

const MAX_HEADER_LINES = 16;
const MAX_TRAILER_LINES = 16;
const MAX_CHARS_PER_LINE = 48;

interface DescriptorSet {
  id: string;
  scopeType: "enterprise" | "property" | "rvc";
  scopeId: string;
  enterpriseId: string;
  headerLines: string[];
  trailerLines: string[];
  logoEnabled: boolean;
  logoAssetId: string | null;
  overrideHeader: boolean;
  overrideTrailer: boolean;
  overrideLogo: boolean;
}

export default function RvcsPage() {
  const { toast } = useToast();
  const { selectedEnterpriseId, selectedPropertyId: contextPropertyId } = useEmc();
  usePosWebSocket();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Rvc | null>(null);
  const [descriptorsOpen, setDescriptorsOpen] = useState(false);
  const [descriptorsRvc, setDescriptorsRvc] = useState<Rvc | null>(null);
  const [headerLines, setHeaderLines] = useState<string[]>(Array(MAX_HEADER_LINES).fill(""));
  const [trailerLines, setTrailerLines] = useState<string[]>(Array(MAX_TRAILER_LINES).fill(""));
  const [overrideHeader, setOverrideHeader] = useState(false);
  const [overrideTrailer, setOverrideTrailer] = useState(false);

  const enterpriseParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";

  const { data: rvcs = [], isLoading } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/rvcs${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch rvcs");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/properties${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
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
    {
      key: "id",
      header: "Descriptors",
      render: (_, row) => (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={(e) => { e.stopPropagation(); openDescriptors(row); }}
          data-testid={`button-descriptors-${row.id}`}
        >
          <FileText className="w-3 h-3 mr-1" />
          Configure
        </Button>
      ),
    },
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
      defaultValue: contextPropertyId || properties[0]?.id || "",
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
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs", { enterpriseId: selectedEnterpriseId }] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs", { enterpriseId: selectedEnterpriseId }] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs", { enterpriseId: selectedEnterpriseId }] });
      toast({ title: "Revenue Center deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete RVC", variant: "destructive" });
    },
  });

  const saveDescriptorsMutation = useMutation({
    mutationFn: async () => {
      if (!descriptorsRvc) throw new Error("No RVC selected");
      const property = properties.find(p => p.id === descriptorsRvc.propertyId);
      if (!property?.enterpriseId) throw new Error("Property or enterprise not found");
      
      const cleanHeader = headerLines.filter(l => l.trim()).map(l => l.substring(0, MAX_CHARS_PER_LINE));
      const cleanTrailer = trailerLines.filter(l => l.trim()).map(l => l.substring(0, MAX_CHARS_PER_LINE));
      
      return apiRequest("PUT", `/api/descriptors/rvc/${descriptorsRvc.id}`, {
        enterpriseId: property.enterpriseId,
        headerLines: cleanHeader,
        trailerLines: cleanTrailer,
        logoEnabled: false,
        logoAssetId: null,
        overrideHeader,
        overrideTrailer,
        overrideLogo: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/descriptors"] });
      setDescriptorsOpen(false);
      setDescriptorsRvc(null);
      toast({ title: "Descriptors saved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save descriptors", description: error.message, variant: "destructive" });
    },
  });

  const openDescriptors = async (rvc: Rvc) => {
    setDescriptorsRvc(rvc);
    try {
      const response = await fetch(`/api/descriptors/rvc/${rvc.id}`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (response.ok) {
        const data: DescriptorSet = await response.json();
        const newHeader = Array(MAX_HEADER_LINES).fill("");
        const newTrailer = Array(MAX_TRAILER_LINES).fill("");
        (data.headerLines || []).forEach((line, i) => { if (i < MAX_HEADER_LINES) newHeader[i] = line; });
        (data.trailerLines || []).forEach((line, i) => { if (i < MAX_TRAILER_LINES) newTrailer[i] = line; });
        setHeaderLines(newHeader);
        setTrailerLines(newTrailer);
        setOverrideHeader(data.overrideHeader ?? false);
        setOverrideTrailer(data.overrideTrailer ?? false);
      } else {
        setHeaderLines(Array(MAX_HEADER_LINES).fill(""));
        setTrailerLines(Array(MAX_TRAILER_LINES).fill(""));
        setOverrideHeader(false);
        setOverrideTrailer(false);
      }
    } catch {
      setHeaderLines(Array(MAX_HEADER_LINES).fill(""));
      setTrailerLines(Array(MAX_TRAILER_LINES).fill(""));
      setOverrideHeader(false);
      setOverrideTrailer(false);
    }
    setDescriptorsOpen(true);
  };

  const handleLineChange = (type: "header" | "trailer", index: number, value: string) => {
    const truncated = value.substring(0, MAX_CHARS_PER_LINE);
    if (type === "header") {
      const newLines = [...headerLines];
      newLines[index] = truncated;
      setHeaderLines(newLines);
    } else {
      const newLines = [...trailerLines];
      newLines[index] = truncated;
      setTrailerLines(newLines);
    }
  };

  const handleSubmit = (data: InsertRvc) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate({ ...data, enterpriseId: selectedEnterpriseId! });
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

      <Dialog open={descriptorsOpen} onOpenChange={(open) => { if (!open) { setDescriptorsOpen(false); setDescriptorsRvc(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Receipt Descriptors - {descriptorsRvc?.name}
            </DialogTitle>
            <DialogDescription>
              Configure receipt header and trailer lines for this RVC. These override property-level settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-md">
              <div className="flex items-center gap-2">
                <Switch
                  checked={overrideHeader}
                  onCheckedChange={setOverrideHeader}
                  data-testid="switch-rvc-override-header"
                />
                <Label>Override Header</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={overrideTrailer}
                  onCheckedChange={setOverrideTrailer}
                  data-testid="switch-rvc-override-trailer"
                />
                <Label>Override Trailer</Label>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-base font-medium">Header Lines</Label>
                  <span className="text-xs text-muted-foreground">
                    {headerLines.filter(l => l.trim()).length} / {MAX_HEADER_LINES} used
                  </span>
                </div>
                <ScrollArea className="h-[300px] border rounded-md p-3">
                  <div className="space-y-2">
                    {headerLines.map((line, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{i + 1}</span>
                        <Input
                          value={line}
                          onChange={(e) => handleLineChange("header", i, e.target.value)}
                          placeholder={i === 0 ? "Business Name" : ""}
                          className="font-mono text-sm"
                          maxLength={MAX_CHARS_PER_LINE}
                          disabled={!overrideHeader}
                          data-testid={`input-rvc-header-${i}`}
                        />
                        <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                          {line.length}/{MAX_CHARS_PER_LINE}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-base font-medium">Trailer Lines</Label>
                  <span className="text-xs text-muted-foreground">
                    {trailerLines.filter(l => l.trim()).length} / {MAX_TRAILER_LINES} used
                  </span>
                </div>
                <ScrollArea className="h-[300px] border rounded-md p-3">
                  <div className="space-y-2">
                    {trailerLines.map((line, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{i + 1}</span>
                        <Input
                          value={line}
                          onChange={(e) => handleLineChange("trailer", i, e.target.value)}
                          placeholder={i === 0 ? "Thank you message" : ""}
                          className="font-mono text-sm"
                          maxLength={MAX_CHARS_PER_LINE}
                          disabled={!overrideTrailer}
                          data-testid={`input-rvc-trailer-${i}`}
                        />
                        <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                          {line.length}/{MAX_CHARS_PER_LINE}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDescriptorsOpen(false); setDescriptorsRvc(null); }}>
              Cancel
            </Button>
            <Button onClick={() => saveDescriptorsMutation.mutate()} disabled={saveDescriptorsMutation.isPending}>
              {saveDescriptorsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Descriptors
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
