import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { insertModifierGroupSchema, type ModifierGroup, type InsertModifierGroup, type Modifier, type ModifierGroupModifier } from "@shared/schema";
import { Link2 } from "lucide-react";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function ModifierGroupsPage() {
  const { toast } = useToast();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ModifierGroup | null>(null);
  const [linkingGroup, setLinkingGroup] = useState<ModifierGroup | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Set<string>>(new Set());

  const { data: modifierGroups = [], isLoading } = useQuery<ModifierGroup[]>({
    queryKey: ["/api/modifier-groups", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/modifier-groups${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch modifier groups");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited, canDeleteItem, getScopeQueryParams } = useConfigOverride<ModifierGroup>("modifier_group", ["/api/modifier-groups"]);
  const displayedModifierGroups = filterOverriddenInherited(modifierGroups);

  const { data: allModifiers = [] } = useQuery<Modifier[]>({
    queryKey: ["/api/modifiers", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/modifiers${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch modifiers");
      return res.json();
    },
  });

  const { data: linkedModifiersData, refetch: refetchLinked } = useQuery<ModifierGroupModifier[]>({
    queryKey: ["/api/modifier-groups", linkingGroup?.id, "modifiers"],
    queryFn: async () => {
      if (!linkingGroup) return [];
      const res = await fetch(`/api/modifier-groups/${linkingGroup.id}/modifiers`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!linkingGroup,
  });
  
  // Ensure linkedModifiers is always an array
  const linkedModifiers = Array.isArray(linkedModifiersData) ? linkedModifiersData : [];

  const columns: Column<ModifierGroup>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "required",
      header: "Required",
      render: (value) => (value ? <Badge>Required</Badge> : <Badge variant="secondary">Optional</Badge>),
    },
    { key: "minSelect", header: "Min", sortable: true },
    { key: "maxSelect", header: "Max", sortable: true },
    { key: "displayOrder", header: "Order" },
    getScopeColumn(),
    getZoneColumn<ModifierGroup>(scopeLookup),
    getInheritanceColumn<ModifierGroup>(selectedPropertyId, selectedRvcId),
  ];

  const formFields: FormFieldConfig[] = [
    { name: "name", label: "Group Name", type: "text", placeholder: "e.g., Meat Temperature", required: true },
    { name: "required", label: "Required Selection", type: "switch", defaultValue: false },
    { name: "minSelect", label: "Minimum Selections", type: "number", placeholder: "0", defaultValue: 0 },
    { name: "maxSelect", label: "Maximum Selections", type: "number", placeholder: "99", defaultValue: 99 },
    { name: "displayOrder", label: "Display Order", type: "number", placeholder: "0", defaultValue: 0 },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertModifierGroup) => {
      const response = await apiRequest("POST", "/api/modifier-groups", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups", filterKeys] });
      setFormOpen(false);
      toast({ title: "Modifier group created" });
    },
    onError: () => {
      toast({ title: "Failed to create modifier group", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ModifierGroup) => {
      const response = await apiRequest("PUT", "/api/modifier-groups/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      toast({ title: "Modifier group updated" });
    },
    onError: () => {
      toast({ title: "Failed to update modifier group", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/modifier-groups/" + id + getScopeQueryParams());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups", filterKeys] });
      toast({ title: "Modifier group deleted" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete modifier group", variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ groupId, modifierId }: { groupId: string; modifierId: string }) => {
      await apiRequest("POST", `/api/modifier-groups/${groupId}/modifiers`, { modifierId });
    },
    onSuccess: () => {
      refetchLinked();
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async ({ groupId, modifierId }: { groupId: string; modifierId: string }) => {
      await apiRequest("DELETE", `/api/modifier-groups/${groupId}/modifiers/${modifierId}`);
    },
    onSuccess: () => {
      refetchLinked();
    },
  });

  const handleSubmit = (data: InsertModifierGroup) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate({ ...data, ...scopePayload });
    }
  };

  const handleOpenLinkDialog = (group: ModifierGroup) => {
    setLinkingGroup(group);
  };

  const handleToggleModifier = (modifierId: string) => {
    if (!linkingGroup) return;
    
    const isLinked = linkedModifiers.some((lm) => lm.modifierId === modifierId);
    
    if (isLinked) {
      unlinkMutation.mutate({ groupId: linkingGroup.id, modifierId });
    } else {
      linkMutation.mutate({ groupId: linkingGroup.id, modifierId });
    }
  };

  const handleCloseLinkDialog = () => {
    setLinkingGroup(null);
    queryClient.invalidateQueries({ queryKey: ["/api/modifier-groups", filterKeys] });
  };

  return (
    <div className="p-6">
      <DataTable
        data={displayedModifierGroups}
        columns={columns}
        title="Modifier Groups"
        onAdd={() => {
          setEditingItem(null);
          setFormOpen(true);
        }}
        onEdit={(item) => {
          setEditingItem(item);
          setFormOpen(true);
        }}
        onDelete={(item) => deleteMutation.mutate(item.id)}
        canDelete={canDeleteItem}
        customActions={[
          {
            label: "Manage Modifiers",
            icon: Link2,
            onClick: handleOpenLinkDialog,
          },
          ...getOverrideActions(),
        ]}
        isLoading={isLoading}
        searchPlaceholder="Search modifier groups..."
        emptyMessage="No modifier groups configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={insertModifierGroupSchema}
        fields={formFields}
        title={editingItem ? "Edit Modifier Group" : "Add Modifier Group"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <Dialog open={!!linkingGroup} onOpenChange={(open) => !open && handleCloseLinkDialog()}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Modifiers in "{linkingGroup?.name}"</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {allModifiers.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                No modifiers available. Create modifiers first in the Modifiers section.
              </p>
            ) : (
              <div className="space-y-3">
                {allModifiers.map((modifier) => {
                  const isLinked = linkedModifiers.some((lm) => lm.modifierId === modifier.id);
                  return (
                    <div
                      key={modifier.id}
                      className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => handleToggleModifier(modifier.id)}
                      data-testid={`row-modifier-${modifier.id}`}
                    >
                      <Checkbox
                        checked={isLinked}
                        onCheckedChange={() => {}}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleModifier(modifier.id);
                        }}
                        data-testid={`checkbox-modifier-${modifier.id}`}
                      />
                      <div className="flex-1 flex items-center justify-between">
                        <span>{modifier.name}</span>
                        {modifier.priceDelta && parseFloat(modifier.priceDelta) !== 0 && (
                          <span className="text-sm text-muted-foreground">
                            {parseFloat(modifier.priceDelta) > 0 ? "+" : ""}
                            {parseFloat(modifier.priceDelta).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
            <Button onClick={handleCloseLinkDialog} data-testid="button-close-link-dialog">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
