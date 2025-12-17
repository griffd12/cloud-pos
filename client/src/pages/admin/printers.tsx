import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertPrinterSchema, type Printer, type InsertPrinter, type Property } from "@shared/schema";

const PRINTER_MODELS = [
  // === EPSON THERMAL RECEIPT ===
  { value: "TM-T88VII", label: "[Epson Thermal] TM-T88VII - Latest High-Speed" },
  { value: "TM-T88VI", label: "[Epson Thermal] TM-T88VI - High-Speed" },
  { value: "TM-T88V", label: "[Epson Thermal] TM-T88V - Industry Standard" },
  { value: "TM-T88IV", label: "[Epson Thermal] TM-T88IV - Legacy" },
  { value: "TM-T88III", label: "[Epson Thermal] TM-T88III - Legacy" },
  { value: "TM-T88II", label: "[Epson Thermal] TM-T88II - Classic" },
  { value: "TM-T20III", label: "[Epson Thermal] TM-T20III - Budget" },
  { value: "TM-T20II", label: "[Epson Thermal] TM-T20II - Cost-Effective" },
  { value: "TM-T70II", label: "[Epson Thermal] TM-T70II - Under-Counter" },
  { value: "TM-T82III", label: "[Epson Thermal] TM-T82III - Compact" },
  // === EPSON mPOS ===
  { value: "TM-m30III", label: "[Epson mPOS] TM-m30III - Modern" },
  { value: "TM-m30II", label: "[Epson mPOS] TM-m30II - Compact" },
  { value: "TM-m30II-H", label: "[Epson mPOS] TM-m30II-H - Hub" },
  { value: "TM-m50II", label: "[Epson mPOS] TM-m50II - Fast" },
  { value: "TM-m50II-H", label: "[Epson mPOS] TM-m50II-H - High-End" },
  { value: "TM-m30", label: "[Epson mPOS] TM-m30 - Standard" },
  { value: "TM-m10", label: "[Epson mPOS] TM-m10 - Ultra-Compact" },
  // === EPSON IMPACT/KITCHEN ===
  { value: "TM-U220A", label: "[Epson Impact] TM-U220A - Auto-Cutter" },
  { value: "TM-U220B", label: "[Epson Impact] TM-U220B - Standard" },
  { value: "TM-U220C", label: "[Epson Impact] TM-U220C - Compact" },
  { value: "TM-U220D", label: "[Epson Impact] TM-U220D - No-Cutter" },
  { value: "TM-U220PA", label: "[Epson Impact] TM-U220PA - Parallel" },
  { value: "TM-U220PB", label: "[Epson Impact] TM-U220PB - Parallel" },
  { value: "TM-U220PD", label: "[Epson Impact] TM-U220PD - Parallel" },
  { value: "TM-U230", label: "[Epson Impact] TM-U230 - Kitchen" },
  { value: "TM-U295", label: "[Epson Impact] TM-U295 - Slip" },
  { value: "TM-U675", label: "[Epson Impact] TM-U675 - Multifunction" },
  // === EPSON MOBILE ===
  { value: "TM-P20II", label: "[Epson Mobile] TM-P20II - 2-inch" },
  { value: "TM-P20", label: "[Epson Mobile] TM-P20 - 2-inch Legacy" },
  { value: "TM-P60II", label: "[Epson Mobile] TM-P60II - Rugged" },
  { value: "TM-P60", label: "[Epson Mobile] TM-P60 - Rugged Legacy" },
  { value: "TM-P80II", label: "[Epson Mobile] TM-P80II - 3-inch" },
  { value: "TM-P80", label: "[Epson Mobile] TM-P80 - 3-inch Legacy" },
  // === EPSON HYBRID/LABEL ===
  { value: "TM-H6000V", label: "[Epson Hybrid] TM-H6000V - Multifunction" },
  { value: "TM-H6000IV", label: "[Epson Hybrid] TM-H6000IV - Multifunction" },
  { value: "TM-L90II", label: "[Epson Label] TM-L90II - Label" },
  { value: "TM-L90", label: "[Epson Label] TM-L90 - Label Legacy" },
  { value: "TM-L100", label: "[Epson Label] TM-L100 - Liner-Free" },
  // === STAR THERMAL RECEIPT ===
  { value: "mC-Print3", label: "[Star Thermal] mC-Print3 - Premium 3-inch" },
  { value: "mC-Print31Ci", label: "[Star Thermal] mC-Print31Ci - LAN+USB" },
  { value: "mC-Print31CBi", label: "[Star Thermal] mC-Print31CBi - LAN+USB+BT" },
  { value: "mC-Print31WCi", label: "[Star Thermal] mC-Print31WCi - WiFi+USB" },
  { value: "mC-Print31WCBi", label: "[Star Thermal] mC-Print31WCBi - WiFi+USB+BT" },
  { value: "mC-Print2", label: "[Star Thermal] mC-Print2 - Compact 2-inch" },
  { value: "TSP143IV", label: "[Star Thermal] TSP143IV - Best-Selling" },
  { value: "TSP143IV-SK", label: "[Star Thermal] TSP143IV SK - Linerless" },
  { value: "TSP143IIIU", label: "[Star Thermal] TSP143IIIU - USB" },
  { value: "TSP143IIIBI", label: "[Star Thermal] TSP143IIIBI - Bluetooth" },
  { value: "TSP143IIILAN", label: "[Star Thermal] TSP143IIILAN - Ethernet" },
  { value: "TSP143IIIWLAN", label: "[Star Thermal] TSP143IIIWLAN - WiFi" },
  { value: "TSP143IIU", label: "[Star Thermal] TSP143IIU - USB Legacy" },
  { value: "TSP654II", label: "[Star Thermal] TSP654II - 4-inch Wide" },
  { value: "TSP650II", label: "[Star Thermal] TSP650II - Wide Format" },
  { value: "TSP743II", label: "[Star Thermal] TSP743II - 3-inch" },
  { value: "TSP613", label: "[Star Thermal] TSP613 - Legacy" },
  // === STAR IMPACT/KITCHEN ===
  { value: "SP700", label: "[Star Impact] SP700 - Kitchen Standard" },
  { value: "SP712", label: "[Star Impact] SP712 - Ethernet" },
  { value: "SP717", label: "[Star Impact] SP717 - WiFi" },
  { value: "SP742", label: "[Star Impact] SP742 - Serial" },
  { value: "SP742ML", label: "[Star Impact] SP742ML - Multi-Interface" },
  { value: "SP500", label: "[Star Impact] SP500 - Fast" },
  { value: "SP512", label: "[Star Impact] SP512 - Fast Ethernet" },
  { value: "SP300", label: "[Star Impact] SP300 - Versatile" },
  { value: "SP200", label: "[Star Impact] SP200 - Budget" },
  { value: "DP8340", label: "[Star Impact] DP8340 - Two-Color Wide" },
  // === STAR MOBILE ===
  { value: "SM-T300i", label: "[Star Mobile] SM-T300i - 3-inch" },
  { value: "SM-T300", label: "[Star Mobile] SM-T300 - 3-inch Legacy" },
  { value: "SM-L200", label: "[Star Mobile] SM-L200 - Label" },
  { value: "SM-L300", label: "[Star Mobile] SM-L300 - Label 3-inch" },
  { value: "SM-S230i", label: "[Star Mobile] SM-S230i - 2-inch" },
  { value: "SM-S220i", label: "[Star Mobile] SM-S220i - 2-inch Legacy" },
  // === STAR ALL-IN-ONE ===
  { value: "mPOP", label: "[Star All-in-One] mPOP - Printer+Drawer" },
  { value: "mC-Label3", label: "[Star Label] mC-Label3 - Multi-Function" },
  // === ADDITIONAL EPSON MODELS ===
  { value: "TM-T82X", label: "[Epson Thermal] TM-T82X - Compact" },
  { value: "TM-T81III", label: "[Epson Thermal] TM-T81III - Entry-Level" },
  { value: "TM-T82IIIL", label: "[Epson Thermal] TM-T82IIIL - Liner-Free" },
  { value: "TM-U950", label: "[Epson Impact] TM-U950 - Heavy-Duty" },
  { value: "TM-U590", label: "[Epson Impact] TM-U590 - Wide-Format" },
  { value: "TM-U325", label: "[Epson Impact] TM-U325 - Validation" },
  { value: "TM-S9000MJ", label: "[Epson Check] TM-S9000MJ - Check Scanner" },
  { value: "TM-S2000MJ", label: "[Epson Check] TM-S2000MJ - Check Scanner" },
  // === ADDITIONAL STAR MODELS ===
  { value: "TSP847II", label: "[Star Thermal] TSP847II - 4-inch Wide" },
  { value: "TSP828L", label: "[Star Thermal] TSP828L - Label" },
  { value: "BSC10", label: "[Star Thermal] BSC10 - Kiosk" },
  { value: "TSP100ECO", label: "[Star Thermal] TSP100ECO - Eco Series" },
  { value: "SP2000", label: "[Star Impact] SP2000 - Entry-Level" },
  { value: "HSP7000", label: "[Star Hybrid] HSP7000 - Multifunction" },
  // === CUSTOM ===
  { value: "Custom", label: "[Other] Custom / Unlisted Model" },
];

export default function PrintersPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Printer | null>(null);

  const { data: printers = [], isLoading } = useQuery<Printer[]>({
    queryKey: ["/api/printers"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const columns: Column<Printer>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "printerType",
      header: "Type",
      render: (value) => {
        const types: Record<string, string> = {
          receipt: "Receipt",
          kitchen: "Kitchen",
          bar: "Bar",
          prep: "Prep",
          report: "Report",
        };
        return <Badge variant="outline">{types[value as string] || value}</Badge>;
      },
    },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => properties.find((p) => p.id === value)?.name || "-",
    },
    {
      key: "driverProtocol",
      header: "Brand",
      render: (value) => value === "epson" ? "Epson" : value === "star" ? "Star" : value,
    },
    {
      key: "model",
      header: "Model",
      render: (value) => value || "-",
    },
    {
      key: "connectionType",
      header: "Connection",
      render: (value) => value === "network" ? "Network" : value === "usb" ? "USB" : "Serial",
    },
    { key: "ipAddress", header: "IP Address" },
    {
      key: "isOnline",
      header: "Status",
      render: (value) => (value ? <Badge className="bg-green-600">Online</Badge> : <Badge variant="secondary">Offline</Badge>),
    },
    {
      key: "active",
      header: "Active",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const formFields: FormFieldConfig[] = useMemo(() => [
    { name: "name", label: "Printer Name", type: "text", placeholder: "e.g., Kitchen Printer - Hot Line", required: true },
    {
      name: "printerType",
      label: "Printer Type",
      type: "select",
      options: [
        { value: "receipt", label: "Receipt" },
        { value: "kitchen", label: "Kitchen" },
        { value: "bar", label: "Bar" },
        { value: "prep", label: "Prep" },
        { value: "report", label: "Report" },
      ],
      defaultValue: "kitchen",
    },
    {
      name: "propertyId",
      label: "Property",
      type: "select",
      options: properties.map((p) => ({ value: p.id, label: p.name })),
      required: true,
    },
    {
      name: "connectionType",
      label: "Connection Type",
      type: "select",
      options: [
        { value: "network", label: "Network (IP)" },
        { value: "usb", label: "USB" },
        { value: "serial", label: "Serial (Legacy)" },
      ],
      defaultValue: "network",
    },
    { name: "ipAddress", label: "IP Address", type: "text", placeholder: "e.g., 192.168.1.100" },
    { name: "port", label: "Port", type: "text", placeholder: "9100", defaultValue: "9100" },
    {
      name: "driverProtocol",
      label: "Printer Brand",
      type: "select",
      options: [
        { value: "epson", label: "Epson" },
        { value: "star", label: "Star Micronics" },
      ],
      defaultValue: "epson",
    },
    {
      name: "model",
      label: "Printer Model",
      type: "select",
      options: PRINTER_MODELS,
      defaultValue: "TM-T88VII",
    },
    {
      name: "characterWidth",
      label: "Character Width",
      type: "select",
      options: [
        { value: "42", label: "42 characters" },
        { value: "48", label: "48 characters" },
        { value: "56", label: "56 characters" },
      ],
      defaultValue: "42",
    },
    { name: "autoCut", label: "Auto Cut", type: "switch", defaultValue: true },
    { name: "printLogo", label: "Print Logo", type: "switch", defaultValue: false },
    { name: "printOrderHeader", label: "Print Order Header", type: "switch", defaultValue: true },
    { name: "printOrderFooter", label: "Print Order Footer", type: "switch", defaultValue: true },
    { name: "printVoids", label: "Print Voids/Cancellations", type: "switch", defaultValue: true },
    { name: "printReprints", label: "Print Reprints", type: "switch", defaultValue: true },
    { name: "retryAttempts", label: "Retry Attempts", type: "text", placeholder: "3", defaultValue: "3" },
    {
      name: "failureHandlingMode",
      label: "Failure Handling",
      type: "select",
      options: [
        { value: "fail_silently", label: "Fail Silently" },
        { value: "alert_cashier", label: "Alert Cashier" },
      ],
      defaultValue: "alert_cashier",
    },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ], [properties]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertPrinter) => {
      const response = await apiRequest("POST", "/api/printers", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      setFormOpen(false);
      toast({ title: "Printer created" });
    },
    onError: () => {
      toast({ title: "Failed to create printer", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Printer) => {
      const response = await apiRequest("PUT", "/api/printers/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Printer updated" });
    },
    onError: () => {
      toast({ title: "Failed to update printer", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/printers/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      toast({ title: "Printer deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete printer", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertPrinter) => {
    const cleanedData = {
      ...data,
      model: data.model || null,
      port: typeof data.port === "string" ? parseInt(data.port, 10) : (data.port ?? 9100),
      retryAttempts: typeof data.retryAttempts === "string" ? parseInt(data.retryAttempts as string, 10) : (data.retryAttempts ?? 3),
      characterWidth: typeof data.characterWidth === "string" ? parseInt(data.characterWidth as string, 10) : (data.characterWidth ?? 42),
    };
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...cleanedData } as Printer);
    } else {
      createMutation.mutate(cleanedData);
    }
  };

  const handleOpenForm = (item: Printer | null) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  return (
    <div className="p-6">
      <DataTable
        data={printers}
        columns={columns}
        title="Printers"
        onAdd={() => handleOpenForm(null)}
        onEdit={(item) => handleOpenForm(item)}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        isLoading={isLoading}
        searchPlaceholder="Search printers..."
        emptyMessage="No printers configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertPrinterSchema}
        fields={formFields}
        title={editingItem ? "Edit Printer" : "Add Printer"}
        initialData={editingItem ? {
          ...editingItem,
          port: editingItem.port ?? 9100,
          retryAttempts: editingItem.retryAttempts ?? 3,
          characterWidth: editingItem.characterWidth ?? 42,
          model: editingItem.model || "",
        } : undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
