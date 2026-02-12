import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { getAuthHeaders } from "@/lib/queryClient";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Role, type Privilege } from "@shared/schema";
import { useConfigOverride } from "@/hooks/use-config-override";

export default function RolesPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Role | null>(null);
  
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [active, setActive] = useState(true);
  const [selectedPrivileges, setSelectedPrivileges] = useState<string[]>([]);

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ["/api/roles", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/roles${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
  });

  const { getOverrideActions, filterOverriddenInherited } = useConfigOverride<Role>("role", ["/api/roles"]);
  const displayedRoles = filterOverriddenInherited(roles);

  const { data: privileges = [] } = useQuery<Privilege[]>({
    queryKey: ["/api/privileges", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/privileges${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch privileges");
      return res.json();
    },
  });

  const resetForm = () => {
    setName("");
    setCode("");
    setActive(true);
    setSelectedPrivileges([]);
  };

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setCode(editingItem.code);
      setActive(editingItem.active ?? true);
      
      apiRequest("GET", `/api/roles/${editingItem.id}/privileges`)
        .then(res => res.json())
        .then((privs: string[]) => {
          setSelectedPrivileges(privs);
        });
    } else {
      resetForm();
    }
  }, [editingItem]);

  const columns: Column<Role>[] = [
    { key: "code", header: "Code", sortable: true },
    { key: "name", header: "Name", sortable: true },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    getScopeColumn(),
    getZoneColumn<Role>(scopeLookup),
    getInheritanceColumn<Role>(selectedPropertyId, selectedRvcId),
  ];

  const createMutation = useMutation({
    mutationFn: async (data: { role: Partial<Role>; privileges: string[] }) => {
      const response = await apiRequest("POST", "/api/roles", data.role);
      const created = await response.json();
      await apiRequest("PUT", `/api/roles/${created.id}/privileges`, { privileges: data.privileges });
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Role created" });
    },
    onError: () => {
      toast({ title: "Failed to create role", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { role: Partial<Role>; privileges: string[] }) => {
      const response = await apiRequest("PUT", "/api/roles/" + data.role.id, data.role);
      await apiRequest("PUT", `/api/roles/${data.role.id}/privileges`, { privileges: data.privileges });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", filterKeys] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Role updated" });
    },
    onError: () => {
      toast({ title: "Failed to update role", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/roles/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", filterKeys] });
      toast({ title: "Role deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete role", variant: "destructive" });
    },
  });

  const seedPrivilegesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/privileges/seed", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/privileges", filterKeys] });
      toast({ title: "Privileges seeded successfully" });
    },
    onError: () => {
      toast({ title: "Failed to seed privileges", variant: "destructive" });
    },
  });

  const seedRolesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEnterpriseId) {
        throw new Error("No enterprise selected");
      }
      await apiRequest("POST", "/api/roles/seed", filterKeys);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roles", filterKeys] });
      toast({ title: "Roles seeded successfully with privileges from matrix" });
    },
    onError: () => {
      toast({ title: "Failed to seed roles", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !code) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const roleData: Partial<Role> = {
      name,
      code,
      active,
    };

    if (editingItem) {
      roleData.id = editingItem.id;
      updateMutation.mutate({ role: roleData, privileges: selectedPrivileges });
    } else {
      createMutation.mutate({ role: { ...roleData, ...scopePayload }, privileges: selectedPrivileges });
    }
  };

  const togglePrivilege = (code: string) => {
    setSelectedPrivileges(prev => 
      prev.includes(code) 
        ? prev.filter(p => p !== code)
        : [...prev, code]
    );
  };

  const toggleAllInDomain = (domain: string, privs: Privilege[]) => {
    const domainCodes = privs.map(p => p.code);
    const allSelected = domainCodes.every(code => selectedPrivileges.includes(code));
    
    if (allSelected) {
      setSelectedPrivileges(prev => prev.filter(code => !domainCodes.includes(code)));
    } else {
      setSelectedPrivileges(prev => {
        const combined = [...prev, ...domainCodes];
        return Array.from(new Set(combined));
      });
    }
  };

  const privilegesByDomain = privileges.reduce((acc, priv) => {
    const domain = priv.domain || "other";
    if (!acc[domain]) acc[domain] = [];
    acc[domain].push(priv);
    return acc;
  }, {} as Record<string, Privilege[]>);

  const domainLabels: Record<string, string> = {
    check_control: "Check Control",
    item_control: "Item Control",
    payment_control: "Payment Control",
    manager_override: "Manager Override",
    reporting: "Reporting",
    admin: "Admin",
    operations: "Operations",
    other: "Other",
  };

  return (
    <div className="p-6 space-y-6">
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles" data-testid="tab-roles">Roles</TabsTrigger>
          <TabsTrigger value="privileges" data-testid="tab-privileges">Privileges</TabsTrigger>
        </TabsList>
        
        <TabsContent value="roles" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline" 
              onClick={() => seedRolesMutation.mutate()}
              disabled={seedRolesMutation.isPending}
              data-testid="button-seed-roles"
            >
              Seed Standard Roles
            </Button>
          </div>
          
          <DataTable
            data={displayedRoles}
            columns={columns}
            title="Roles"
            onAdd={() => {
              setEditingItem(null);
              resetForm();
              setFormOpen(true);
            }}
            onEdit={(item) => {
              setEditingItem(item);
              setFormOpen(true);
            }}
            onDelete={(item) => deleteMutation.mutate(item.id)}
            customActions={getOverrideActions()}
            isLoading={isLoading}
            searchPlaceholder="Search roles..."
            emptyMessage="No roles configured"
          />
        </TabsContent>
        
        <TabsContent value="privileges" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline" 
              onClick={() => seedPrivilegesMutation.mutate()}
              disabled={seedPrivilegesMutation.isPending}
              data-testid="button-seed-privileges"
            >
              Seed Standard Privileges
            </Button>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(privilegesByDomain).map(([domain, privs]) => (
              <Card key={domain}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">{domainLabels[domain] || domain}</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <ul className="space-y-1">
                    {privs.map(priv => (
                      <li key={priv.id} className="text-sm text-muted-foreground">
                        {priv.name}
                        <span className="text-xs ml-2 font-mono text-muted-foreground/60">({priv.code})</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={formOpen} onOpenChange={(open) => {
        if (!open) {
          setFormOpen(false);
          setEditingItem(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Role" : "Add Role"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Role Name *</Label>
                <Input 
                  id="name"
                  data-testid="input-role-name"
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Manager"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input 
                  id="code"
                  data-testid="input-role-code"
                  value={code} 
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g., MGR"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="active"
                data-testid="switch-role-active"
                checked={active}
                onCheckedChange={setActive}
              />
              <Label htmlFor="active">Active</Label>
            </div>

            <div className="space-y-2">
              <Label>Privileges</Label>
              <Accordion type="multiple" className="border rounded-md">
                {Object.entries(privilegesByDomain).map(([domain, privs]) => {
                  const allDomainSelected = privs.every(p => selectedPrivileges.includes(p.code));
                  
                  return (
                    <AccordionItem key={domain} value={domain}>
                      <AccordionTrigger className="px-4 py-2 text-sm">
                        {domainLabels[domain] || domain}
                        <Badge variant="secondary" className="ml-2">
                          {privs.filter(p => selectedPrivileges.includes(p.code)).length}/{privs.length}
                        </Badge>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-3">
                        <div className="mb-3 pb-2 border-b flex items-center space-x-2">
                          <Checkbox 
                            id={`select-all-${domain}`}
                            data-testid={`checkbox-select-all-${domain}`}
                            checked={allDomainSelected}
                            onCheckedChange={() => toggleAllInDomain(domain, privs)}
                          />
                          <Label 
                            htmlFor={`select-all-${domain}`} 
                            className="text-sm font-medium cursor-pointer"
                          >
                            Select All {domainLabels[domain] || domain}
                          </Label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {privs.map((priv) => (
                            <div key={priv.id} className="flex items-center space-x-2">
                              <Checkbox 
                                id={`priv-${priv.code}`}
                                data-testid={`checkbox-priv-${priv.code}`}
                                checked={selectedPrivileges.includes(priv.code)}
                                onCheckedChange={() => togglePrivilege(priv.code)}
                              />
                              <Label htmlFor={`priv-${priv.code}`} className="text-sm font-normal cursor-pointer">
                                {priv.name}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>

            </div>
            <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setFormOpen(false);
                  setEditingItem(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                data-testid="button-submit-role"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingItem ? "Save Changes" : "Create Role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
