import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, Grid3X3, LayoutGrid, Save, X } from "lucide-react";
import type { PosLayout, PosLayoutCell, MenuItem, Rvc } from "@shared/schema";

interface LayoutWithCells extends PosLayout {
  cells?: PosLayoutCell[];
}

interface CellData {
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  menuItemId: string | null;
  backgroundColor: string;
  textColor: string;
  displayLabel: string | null;
}

export default function PosLayoutsPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState<LayoutWithCells | null>(null);
  const [layoutName, setLayoutName] = useState("");
  const [layoutMode, setLayoutMode] = useState<"slu_tabs" | "custom_grid">("slu_tabs");
  const [gridRows, setGridRows] = useState(4);
  const [gridCols, setGridCols] = useState(6);
  const [isDefault, setIsDefault] = useState(false);
  const [selectedRvcId, setSelectedRvcId] = useState<string>("");
  const [cells, setCells] = useState<CellData[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);

  const { data: layouts = [], isLoading } = useQuery<PosLayout[]>({
    queryKey: ["/api/pos-layouts"],
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/pos-layouts", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-layouts"] });
      setFormOpen(false);
      resetForm();
      toast({ title: "Layout created" });
    },
    onError: () => {
      toast({ title: "Failed to create layout", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/pos-layouts/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-layouts"] });
      setFormOpen(false);
      resetForm();
      toast({ title: "Layout updated" });
    },
    onError: () => {
      toast({ title: "Failed to update layout", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pos-layouts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-layouts"] });
      toast({ title: "Layout deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete layout", variant: "destructive" });
    },
  });

  const saveCellsMutation = useMutation({
    mutationFn: async ({ layoutId, cells }: { layoutId: string; cells: CellData[] }) => {
      const response = await apiRequest("PUT", `/api/pos-layouts/${layoutId}/cells`, cells);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-layouts"] });
      toast({ title: "Layout cells saved" });
    },
    onError: () => {
      toast({ title: "Failed to save cells", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setLayoutName("");
    setLayoutMode("slu_tabs");
    setGridRows(4);
    setGridCols(6);
    setIsDefault(false);
    setSelectedRvcId("");
    setEditingLayout(null);
  };

  const handleOpenForm = (layout?: PosLayout) => {
    if (layout) {
      setEditingLayout(layout);
      setLayoutName(layout.name);
      setLayoutMode(layout.mode as "slu_tabs" | "custom_grid");
      setGridRows(layout.gridRows || 4);
      setGridCols(layout.gridCols || 6);
      setIsDefault(layout.isDefault || false);
      setSelectedRvcId(layout.rvcId || "");
    } else {
      resetForm();
    }
    setFormOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      name: layoutName,
      mode: layoutMode,
      gridRows,
      gridCols,
      isDefault,
      rvcId: selectedRvcId || null,
      active: true,
    };

    if (editingLayout) {
      updateMutation.mutate({ id: editingLayout.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenDesigner = async (layout: PosLayout) => {
    setEditingLayout(layout);
    setGridRows(layout.gridRows || 4);
    setGridCols(layout.gridCols || 6);
    
    const res = await fetch(`/api/pos-layouts/${layout.id}/cells`, { credentials: "include" });
    const existingCells: PosLayoutCell[] = await res.json();
    
    const cellMap = new Map<string, PosLayoutCell>();
    existingCells.forEach(c => cellMap.set(`${c.rowIndex}-${c.colIndex}`, c));
    
    const newCells: CellData[] = [];
    for (let r = 0; r < (layout.gridRows || 4); r++) {
      for (let c = 0; c < (layout.gridCols || 6); c++) {
        const existing = cellMap.get(`${r}-${c}`);
        newCells.push({
          rowIndex: r,
          colIndex: c,
          rowSpan: existing?.rowSpan || 1,
          colSpan: existing?.colSpan || 1,
          menuItemId: existing?.menuItemId || null,
          backgroundColor: existing?.backgroundColor || "#3B82F6",
          textColor: existing?.textColor || "#FFFFFF",
          displayLabel: existing?.displayLabel || null,
        });
      }
    }
    setCells(newCells);
    setSelectedCell(null);
    setDesignerOpen(true);
  };

  const handleCellClick = (row: number, col: number) => {
    setSelectedCell({ row, col });
  };

  const updateCell = (row: number, col: number, updates: Partial<CellData>) => {
    setCells(prev => prev.map(c => 
      c.rowIndex === row && c.colIndex === col ? { ...c, ...updates } : c
    ));
  };

  const handleSaveDesign = () => {
    if (!editingLayout) return;
    const filledCells = cells.filter(c => c.menuItemId);
    saveCellsMutation.mutate({ layoutId: editingLayout.id, cells: filledCells });
  };

  const getMenuItem = (id: string | null) => {
    if (!id) return null;
    return menuItems.find(m => m.id === id);
  };

  const selectedCellData = selectedCell 
    ? cells.find(c => c.rowIndex === selectedCell.row && c.colIndex === selectedCell.col)
    : null;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">POS Screen Layouts</h1>
          <p className="text-sm text-muted-foreground">
            Create custom layouts for the POS transaction screen
          </p>
        </div>
        <Button onClick={() => handleOpenForm()} data-testid="button-add-layout">
          <Plus className="w-4 h-4 mr-2" />
          Add Layout
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : layouts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LayoutGrid className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No layouts configured</p>
            <Button className="mt-4" onClick={() => handleOpenForm()}>
              Create your first layout
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {layouts.map(layout => (
            <Card key={layout.id} data-testid={`card-layout-${layout.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{layout.name}</CardTitle>
                  <div className="flex gap-1">
                    {layout.isDefault && <Badge variant="default">Default</Badge>}
                    {layout.mode === "custom_grid" ? (
                      <Badge variant="outline">Custom</Badge>
                    ) : (
                      <Badge variant="secondary">SLU Tabs</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-4">
                  {layout.mode === "custom_grid" ? (
                    <span>{layout.gridRows} x {layout.gridCols} grid</span>
                  ) : (
                    <span>Uses SLU category tabs</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleOpenForm(layout)} data-testid={`button-edit-layout-${layout.id}`}>
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  {layout.mode === "custom_grid" && (
                    <Button size="sm" variant="outline" onClick={() => handleOpenDesigner(layout)} data-testid={`button-design-layout-${layout.id}`}>
                      <Grid3X3 className="w-4 h-4 mr-1" />
                      Design
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(layout.id)} data-testid={`button-delete-layout-${layout.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLayout ? "Edit Layout" : "Create Layout"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Layout Name</Label>
              <Input
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
                placeholder="e.g., Quick Service Layout"
                data-testid="input-layout-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Revenue Center</Label>
              <Select value={selectedRvcId} onValueChange={setSelectedRvcId}>
                <SelectTrigger data-testid="select-rvc">
                  <SelectValue placeholder="Select RVC (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {rvcs.map(rvc => (
                    <SelectItem key={rvc.id} value={rvc.id}>{rvc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Layout Mode</Label>
              <Select value={layoutMode} onValueChange={(v) => setLayoutMode(v as any)}>
                <SelectTrigger data-testid="select-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slu_tabs">SLU Tabs (Category based)</SelectItem>
                  <SelectItem value="custom_grid">Custom Grid (Designer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {layoutMode === "custom_grid" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Grid Rows</Label>
                  <Input
                    type="number"
                    min={2}
                    max={10}
                    value={gridRows}
                    onChange={(e) => setGridRows(Number(e.target.value))}
                    data-testid="input-grid-rows"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Grid Columns</Label>
                  <Input
                    type="number"
                    min={2}
                    max={12}
                    value={gridCols}
                    onChange={(e) => setGridCols(Number(e.target.value))}
                    data-testid="input-grid-cols"
                  />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                checked={isDefault}
                onCheckedChange={setIsDefault}
                data-testid="switch-default"
              />
              <Label>Set as default layout</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!layoutName} data-testid="button-save-layout">
              {editingLayout ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={designerOpen} onOpenChange={setDesignerOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Screen Designer - {editingLayout?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex gap-4 overflow-hidden">
            <div className="flex-1 overflow-auto">
              <div
                className="grid gap-2 p-4 bg-muted/30 rounded-lg"
                style={{
                  gridTemplateColumns: `repeat(${gridCols}, minmax(80px, 1fr))`,
                  gridTemplateRows: `repeat(${gridRows}, 80px)`,
                }}
              >
                {cells.map((cell) => {
                  const menuItem = getMenuItem(cell.menuItemId);
                  const isSelected = selectedCell?.row === cell.rowIndex && selectedCell?.col === cell.colIndex;
                  return (
                    <button
                      key={`${cell.rowIndex}-${cell.colIndex}`}
                      className={`rounded-md border-2 transition-all flex items-center justify-center text-sm font-medium ${
                        isSelected ? "ring-2 ring-primary ring-offset-2" : ""
                      }`}
                      style={{
                        backgroundColor: cell.menuItemId ? cell.backgroundColor : "transparent",
                        color: cell.menuItemId ? cell.textColor : "inherit",
                        borderColor: cell.menuItemId ? cell.backgroundColor : "hsl(var(--border))",
                        borderStyle: cell.menuItemId ? "solid" : "dashed",
                      }}
                      onClick={() => handleCellClick(cell.rowIndex, cell.colIndex)}
                      data-testid={`cell-${cell.rowIndex}-${cell.colIndex}`}
                    >
                      {cell.displayLabel || menuItem?.shortName || menuItem?.name || ""}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="w-72 border-l pl-4">
              <ScrollArea className="h-full">
                {selectedCellData ? (
                  <div className="space-y-4">
                    <h3 className="font-medium">Cell Properties</h3>
                    <div className="space-y-2">
                      <Label>Menu Item</Label>
                      <Select
                        value={selectedCellData.menuItemId || "__empty__"}
                        onValueChange={(v) => updateCell(selectedCell!.row, selectedCell!.col, { menuItemId: v === "__empty__" ? null : v })}
                      >
                        <SelectTrigger data-testid="select-cell-menu-item">
                          <SelectValue placeholder="Select item" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty__">Empty</SelectItem>
                          {menuItems.filter(m => m.active).map(item => (
                            <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Display Label (Optional)</Label>
                      <Input
                        value={selectedCellData.displayLabel || ""}
                        onChange={(e) => updateCell(selectedCell!.row, selectedCell!.col, { displayLabel: e.target.value || null })}
                        placeholder="Override button text"
                        data-testid="input-cell-label"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Background Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={selectedCellData.backgroundColor}
                          onChange={(e) => updateCell(selectedCell!.row, selectedCell!.col, { backgroundColor: e.target.value })}
                          className="w-12 h-9 p-1"
                          data-testid="input-cell-bg-color"
                        />
                        <Input
                          value={selectedCellData.backgroundColor}
                          onChange={(e) => updateCell(selectedCell!.row, selectedCell!.col, { backgroundColor: e.target.value })}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Text Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={selectedCellData.textColor}
                          onChange={(e) => updateCell(selectedCell!.row, selectedCell!.col, { textColor: e.target.value })}
                          className="w-12 h-9 p-1"
                          data-testid="input-cell-text-color"
                        />
                        <Input
                          value={selectedCellData.textColor}
                          onChange={(e) => updateCell(selectedCell!.row, selectedCell!.col, { textColor: e.target.value })}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <Separator />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => updateCell(selectedCell!.row, selectedCell!.col, { menuItemId: null, displayLabel: null })}
                      data-testid="button-clear-cell"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Clear Cell
                    </Button>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Grid3X3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Select a cell to edit</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDesignerOpen(false)} data-testid="button-close-designer">Close</Button>
            <Button onClick={handleSaveDesign} disabled={saveCellsMutation.isPending} data-testid="button-save-design">
              <Save className="w-4 h-4 mr-2" />
              {saveCellsMutation.isPending ? "Saving..." : "Save Layout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
