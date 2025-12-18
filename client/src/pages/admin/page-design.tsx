import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, Edit, Grid3X3, Save, ArrowLeft } from "lucide-react";
import type { PosPage, PosPageKey, Slu, MenuItem, InsertPosPageKey } from "@shared/schema";
import { PAGE_TYPES, KEY_ACTION_TYPES, POS_FUNCTION_CODES, POS_FUNCTION_LABELS, KEY_ACTION_METADATA } from "@shared/schema";

type KeyActionType = typeof KEY_ACTION_TYPES[number];

export default function PageDesignPage() {
  const { toast } = useToast();
  const [selectedPage, setSelectedPage] = useState<PosPage | null>(null);
  const [pageFormOpen, setPageFormOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<PosPage | null>(null);
  const [keyFormOpen, setKeyFormOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<PosPageKey | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);

  const { data: pages = [], isLoading: pagesLoading } = useQuery<PosPage[]>({
    queryKey: ["/api/pos-pages"],
    queryFn: async () => {
      const res = await fetch("/api/pos-pages", { credentials: "include" });
      return res.json();
    },
  });

  const { data: pageKeys = [], isLoading: keysLoading } = useQuery<PosPageKey[]>({
    queryKey: ["/api/pos-pages", selectedPage?.id, "keys"],
    queryFn: async () => {
      if (!selectedPage) return [];
      const res = await fetch(`/api/pos-pages/${selectedPage.id}/keys`, { credentials: "include" });
      return res.json();
    },
    enabled: !!selectedPage,
  });

  const { data: slus = [] } = useQuery<Slu[]>({
    queryKey: ["/api/slus"],
    queryFn: async () => {
      const res = await fetch("/api/slus", { credentials: "include" });
      return res.json();
    },
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items"],
    queryFn: async () => {
      const res = await fetch("/api/menu-items", { credentials: "include" });
      return res.json();
    },
  });

  const createPageMutation = useMutation({
    mutationFn: async (data: Partial<PosPage>) => {
      const response = await apiRequest("POST", "/api/pos-pages", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-pages"] });
      setPageFormOpen(false);
      setEditingPage(null);
      toast({ title: "Page created" });
    },
    onError: () => {
      toast({ title: "Failed to create page", variant: "destructive" });
    },
  });

  const updatePageMutation = useMutation({
    mutationFn: async (data: PosPage) => {
      const response = await apiRequest("PATCH", `/api/pos-pages/${data.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-pages"] });
      setPageFormOpen(false);
      setEditingPage(null);
      toast({ title: "Page updated" });
    },
    onError: () => {
      toast({ title: "Failed to update page", variant: "destructive" });
    },
  });

  const deletePageMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pos-pages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-pages"] });
      setSelectedPage(null);
      toast({ title: "Page deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete page", variant: "destructive" });
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: async (data: InsertPosPageKey) => {
      const response = await apiRequest("POST", `/api/pos-pages/${selectedPage?.id}/keys`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-pages", selectedPage?.id, "keys"] });
      setKeyFormOpen(false);
      setEditingKey(null);
      setSelectedCell(null);
      toast({ title: "Key created" });
    },
    onError: () => {
      toast({ title: "Failed to create key", variant: "destructive" });
    },
  });

  const updateKeyMutation = useMutation({
    mutationFn: async (data: PosPageKey) => {
      const response = await apiRequest("PATCH", `/api/pos-page-keys/${data.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-pages", selectedPage?.id, "keys"] });
      setKeyFormOpen(false);
      setEditingKey(null);
      toast({ title: "Key updated" });
    },
    onError: () => {
      toast({ title: "Failed to update key", variant: "destructive" });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pos-page-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-pages", selectedPage?.id, "keys"] });
      toast({ title: "Key deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete key", variant: "destructive" });
    },
  });

  const handleCellClick = (row: number, col: number) => {
    const existingKey = pageKeys.find(
      (k) => row >= k.gridRow && row < k.gridRow + (k.rowSpan || 1) &&
             col >= k.gridColumn && col < k.gridColumn + (k.colSpan || 1)
    );
    if (existingKey) {
      setEditingKey(existingKey);
      setKeyFormOpen(true);
    } else {
      setSelectedCell({ row, col });
      setEditingKey(null);
      setKeyFormOpen(true);
    }
  };

  const renderGrid = () => {
    if (!selectedPage) return null;
    const rows = selectedPage.gridRows || 6;
    const cols = selectedPage.gridColumns || 8;
    const grid: (PosPageKey | null)[][] = Array(rows).fill(null).map(() => Array(cols).fill(null));
    const occupied: boolean[][] = Array(rows).fill(false).map(() => Array(cols).fill(false));

    pageKeys.forEach((key) => {
      const r = key.gridRow || 0;
      const c = key.gridColumn || 0;
      const rs = key.rowSpan || 1;
      const cs = key.colSpan || 1;
      for (let i = r; i < r + rs && i < rows; i++) {
        for (let j = c; j < c + cs && j < cols; j++) {
          occupied[i][j] = true;
        }
      }
      grid[r][c] = key;
    });

    return (
      <div
        className="grid gap-1 p-2"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(60px, 1fr))`,
        }}
      >
        {Array.from({ length: rows * cols }).map((_, idx) => {
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          const key = grid[row][col];
          
          if (key) {
            return (
              <button
                key={`${row}-${col}`}
                data-testid={`key-cell-${row}-${col}`}
                className="rounded-md flex flex-col items-center justify-center text-center p-1 cursor-pointer border-2 border-transparent hover:border-foreground/30 transition-colors"
                style={{
                  backgroundColor: key.color || "#3B82F6",
                  color: key.textColor || "#FFFFFF",
                  gridRow: `span ${key.rowSpan || 1}`,
                  gridColumn: `span ${key.colSpan || 1}`,
                }}
                onClick={() => handleCellClick(row, col)}
              >
                <span className={`font-medium ${key.fontSize === "small" ? "text-xs" : key.fontSize === "large" ? "text-base" : "text-sm"}`}>
                  {key.label}
                </span>
                {key.labelLine2 && (
                  <span className="text-xs opacity-80">{key.labelLine2}</span>
                )}
              </button>
            );
          }
          
          if (occupied[row][col]) {
            return null;
          }
          
          return (
            <button
              key={`${row}-${col}`}
              data-testid={`empty-cell-${row}-${col}`}
              className="rounded-md border border-dashed border-muted-foreground/30 flex items-center justify-center hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => handleCellClick(row, col)}
            >
              <Plus className="w-4 h-4 text-muted-foreground/50" />
            </button>
          );
        })}
      </div>
    );
  };

  if (selectedPage) {
    return (
      <div className="p-6 h-full flex flex-col">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedPage(null)} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{selectedPage.name}</h1>
            <p className="text-muted-foreground">
              {selectedPage.gridColumns} x {selectedPage.gridRows} grid - {selectedPage.pageType} page
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => {
              setEditingPage(selectedPage);
              setPageFormOpen(true);
            }} data-testid="button-edit-page">
              <Edit className="w-4 h-4 mr-2" />
              Edit Page
            </Button>
          </div>
        </div>
        
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full">
            {keysLoading ? (
              <div className="flex items-center justify-center h-full">Loading keys...</div>
            ) : (
              renderGrid()
            )}
          </CardContent>
        </Card>

        <KeyFormDialog
          open={keyFormOpen}
          onClose={() => {
            setKeyFormOpen(false);
            setEditingKey(null);
            setSelectedCell(null);
          }}
          editingKey={editingKey}
          selectedCell={selectedCell}
          pages={pages}
          slus={slus}
          menuItems={menuItems}
          onSubmit={(data) => {
            if (editingKey) {
              updateKeyMutation.mutate({ ...editingKey, ...data });
            } else {
              createKeyMutation.mutate(data as InsertPosPageKey);
            }
          }}
          onDelete={editingKey ? () => deleteKeyMutation.mutate(editingKey.id) : undefined}
          isPending={createKeyMutation.isPending || updateKeyMutation.isPending}
        />

        <PageFormDialog
          open={pageFormOpen}
          onClose={() => {
            setPageFormOpen(false);
            setEditingPage(null);
          }}
          editingPage={editingPage}
          onSubmit={(data) => {
            if (editingPage) {
              updatePageMutation.mutate({ ...editingPage, ...data });
              if (selectedPage?.id === editingPage.id) {
                setSelectedPage({ ...editingPage, ...data });
              }
            } else {
              createPageMutation.mutate(data);
            }
          }}
          isPending={createPageMutation.isPending || updatePageMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Page Design</h1>
          <p className="text-muted-foreground">Create and customize POS touchscreen layouts</p>
        </div>
        <Button onClick={() => {
          setEditingPage(null);
          setPageFormOpen(true);
        }} data-testid="button-add-page">
          <Plus className="w-4 h-4 mr-2" />
          New Page
        </Button>
      </div>

      {pagesLoading ? (
        <div>Loading pages...</div>
      ) : pages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Grid3X3 className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No pages configured</h3>
            <p className="text-muted-foreground mb-4">Create your first touchscreen page layout</p>
            <Button onClick={() => setPageFormOpen(true)} data-testid="button-create-first-page">
              <Plus className="w-4 h-4 mr-2" />
              Create Page
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map((page) => (
            <Card key={page.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedPage(page)}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">{page.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {page.gridColumns} x {page.gridRows} grid
                  </p>
                </div>
                <Badge variant={page.pageType === "menu" ? "default" : page.pageType === "functions" ? "secondary" : "outline"}>
                  {page.pageType}
                </Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {page.isDefault && "Default page"}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingPage(page);
                      setPageFormOpen(true);
                    }}
                    data-testid={`button-edit-page-${page.id}`}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePageMutation.mutate(page.id);
                    }}
                    data-testid={`button-delete-page-${page.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PageFormDialog
        open={pageFormOpen}
        onClose={() => {
          setPageFormOpen(false);
          setEditingPage(null);
        }}
        editingPage={editingPage}
        onSubmit={(data) => {
          if (editingPage) {
            updatePageMutation.mutate({ ...editingPage, ...data });
          } else {
            createPageMutation.mutate(data);
          }
        }}
        isPending={createPageMutation.isPending || updatePageMutation.isPending}
      />
    </div>
  );
}

function PageFormDialog({
  open,
  onClose,
  editingPage,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  editingPage: PosPage | null;
  onSubmit: (data: Partial<PosPage>) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [pageType, setPageType] = useState<string>("menu");
  const [gridColumns, setGridColumns] = useState(8);
  const [gridRows, setGridRows] = useState(6);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (editingPage) {
      setName(editingPage.name);
      setPageType(editingPage.pageType || "menu");
      setGridColumns(editingPage.gridColumns || 8);
      setGridRows(editingPage.gridRows || 6);
      setIsDefault(editingPage.isDefault || false);
    } else {
      setName("");
      setPageType("menu");
      setGridColumns(8);
      setGridRows(6);
      setIsDefault(false);
    }
  }, [editingPage, open]);

  const handleSubmit = () => {
    onSubmit({
      name,
      pageType,
      gridColumns,
      gridRows,
      isDefault,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingPage ? "Edit Page" : "Create Page"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Page Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Menu, Functions, Payments"
              data-testid="input-page-name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pageType">Page Type</Label>
            <Select value={pageType} onValueChange={setPageType}>
              <SelectTrigger data-testid="select-page-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="menu">Menu - For ordering screens</SelectItem>
                <SelectItem value="functions">Functions - For POS operations</SelectItem>
                <SelectItem value="payments">Payments - For payment screens</SelectItem>
                <SelectItem value="signin">Sign-In - For login screens</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Page types are organizational labels. Any keys can be placed on any page type.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="gridColumns">Columns</Label>
              <Input
                id="gridColumns"
                type="number"
                min={2}
                max={12}
                value={gridColumns}
                onChange={(e) => setGridColumns(parseInt(e.target.value) || 8)}
                data-testid="input-grid-columns"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gridRows">Rows</Label>
              <Input
                id="gridRows"
                type="number"
                min={2}
                max={10}
                value={gridRows}
                onChange={(e) => setGridRows(parseInt(e.target.value) || 6)}
                data-testid="input-grid-rows"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                data-testid="checkbox-is-default"
              />
              <Label htmlFor="isDefault">Default page for this type</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              When set, this page will be used as the starting screen. For menu pages, this is the transaction screen. For signin pages, this is the login screen.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !name} data-testid="button-save-page">
            <Save className="w-4 h-4 mr-2" />
            {editingPage ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyFormDialog({
  open,
  onClose,
  editingKey,
  selectedCell,
  pages,
  slus,
  menuItems,
  onSubmit,
  onDelete,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  editingKey: PosPageKey | null;
  selectedCell: { row: number; col: number } | null;
  pages: PosPage[];
  slus: Slu[];
  menuItems: MenuItem[];
  onSubmit: (data: Partial<PosPageKey>) => void;
  onDelete?: () => void;
  isPending: boolean;
}) {
  const [label, setLabel] = useState("");
  const [labelLine2, setLabelLine2] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [actionType, setActionType] = useState<KeyActionType>("slu");
  const [actionTarget, setActionTarget] = useState("");
  const [rowSpan, setRowSpan] = useState(1);
  const [colSpan, setColSpan] = useState(1);
  const [fontSize, setFontSize] = useState("medium");

  useEffect(() => {
    if (editingKey) {
      setLabel(editingKey.label);
      setLabelLine2(editingKey.labelLine2 || "");
      setColor(editingKey.color || "#3B82F6");
      setTextColor(editingKey.textColor || "#FFFFFF");
      setActionType((editingKey.actionType as KeyActionType) || "slu");
      setActionTarget(editingKey.actionTarget || "");
      setRowSpan(editingKey.rowSpan || 1);
      setColSpan(editingKey.colSpan || 1);
      setFontSize(editingKey.fontSize || "medium");
    } else {
      setLabel("");
      setLabelLine2("");
      setColor("#3B82F6");
      setTextColor("#FFFFFF");
      setActionType("slu");
      setActionTarget("");
      setRowSpan(1);
      setColSpan(1);
      setFontSize("medium");
    }
  }, [editingKey, open]);

  const handleSubmit = () => {
    onSubmit({
      label,
      labelLine2: labelLine2 || null,
      color,
      textColor,
      actionType,
      actionTarget,
      rowSpan,
      colSpan,
      fontSize,
      gridRow: editingKey?.gridRow ?? selectedCell?.row ?? 0,
      gridColumn: editingKey?.gridColumn ?? selectedCell?.col ?? 0,
    });
  };

  const functionCodes = Object.values(POS_FUNCTION_CODES).map((code) => ({
    value: code,
    label: POS_FUNCTION_LABELS[code] || code,
  }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingKey ? "Edit Key" : "Add Key"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="grid gap-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Button text"
              data-testid="input-key-label"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="labelLine2">Second Line (optional)</Label>
            <Input
              id="labelLine2"
              value={labelLine2}
              onChange={(e) => setLabelLine2(e.target.value)}
              placeholder="Secondary text"
              data-testid="input-key-label-line2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="color">Background Color</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-9 rounded cursor-pointer"
                  data-testid="input-key-color"
                />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="textColor">Text Color</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  id="textColor"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-10 h-9 rounded cursor-pointer"
                  data-testid="input-key-text-color"
                />
                <Input value={textColor} onChange={(e) => setTextColor(e.target.value)} className="flex-1" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="colSpan">Width (cols)</Label>
              <Input
                id="colSpan"
                type="number"
                min={1}
                max={4}
                value={colSpan}
                onChange={(e) => setColSpan(parseInt(e.target.value) || 1)}
                data-testid="input-key-colspan"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rowSpan">Height (rows)</Label>
              <Input
                id="rowSpan"
                type="number"
                min={1}
                max={4}
                value={rowSpan}
                onChange={(e) => setRowSpan(parseInt(e.target.value) || 1)}
                data-testid="input-key-rowspan"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fontSize">Font Size</Label>
              <Select value={fontSize} onValueChange={setFontSize}>
                <SelectTrigger data-testid="select-key-fontsize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="actionType">Action Type</Label>
            <Select value={actionType} onValueChange={(v) => {
              setActionType(v as KeyActionType);
              setActionTarget("");
            }}>
              <SelectTrigger data-testid="select-action-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KEY_ACTION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {KEY_ACTION_METADATA[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {KEY_ACTION_METADATA[actionType].description}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="actionTarget">
              {actionType === "slu" ? "Select Category" :
               actionType === "menu_item" ? "Select Menu Item" :
               actionType === "function" ? "Select Function" :
               "Select Target Page"}
            </Label>
            <Select value={actionTarget} onValueChange={setActionTarget}>
              <SelectTrigger data-testid="select-action-target">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {actionType === "slu" && slus.map((slu) => (
                  <SelectItem key={slu.id} value={slu.id}>{slu.name}</SelectItem>
                ))}
                {actionType === "menu_item" && menuItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name} - ${item.price}</SelectItem>
                ))}
                {actionType === "function" && functionCodes.map((fn) => (
                  <SelectItem key={fn.value} value={fn.value}>{fn.label}</SelectItem>
                ))}
                {actionType === "navigation" && pages.map((page) => (
                  <SelectItem key={page.id} value={page.id}>{page.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {onDelete && (
            <Button variant="destructive" onClick={onDelete} data-testid="button-delete-key">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending || !label} data-testid="button-save-key">
              <Save className="w-4 h-4 mr-2" />
              {editingKey ? "Update" : "Add"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
