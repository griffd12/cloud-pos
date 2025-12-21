import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Employee, type Role, type Property, type EmployeeAssignment } from "@shared/schema";

export default function EmployeesPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Employee | null>(null);
  
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pinHash, setPinHash] = useState("");
  const [roleId, setRoleId] = useState("");
  const [active, setActive] = useState(true);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const resetForm = () => {
    setEmployeeNumber("");
    setFirstName("");
    setLastName("");
    setPinHash("");
    setRoleId("");
    setActive(true);
    setSelectedPropertyIds([]);
  };

  useEffect(() => {
    if (editingItem) {
      setEmployeeNumber(editingItem.employeeNumber);
      setFirstName(editingItem.firstName);
      setLastName(editingItem.lastName);
      setPinHash("");
      setRoleId(editingItem.roleId || "");
      setActive(editingItem.active ?? true);
      
      apiRequest("GET", `/api/employees/${editingItem.id}/assignments`)
        .then(res => res.json())
        .then((assignments: EmployeeAssignment[]) => {
          setSelectedPropertyIds(assignments.map(a => a.propertyId).filter(Boolean) as string[]);
        });
    } else {
      resetForm();
    }
  }, [editingItem]);

  const columns: Column<Employee>[] = [
    { key: "employeeNumber", header: "Employee #", sortable: true },
    {
      key: "firstName",
      header: "Name",
      render: (value, row) => `${row.firstName} ${row.lastName}`,
      sortable: true,
    },
    {
      key: "roleId",
      header: "Role",
      render: (value) => roles.find((r) => r.id === value)?.name || "-",
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: { employee: Partial<Employee>; propertyIds: string[] }) => {
      const response = await apiRequest("POST", "/api/employees", data.employee);
      const created = await response.json();
      if (data.propertyIds.length > 0) {
        await apiRequest("PUT", `/api/employees/${created.id}/assignments`, { propertyIds: data.propertyIds });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Employee created" });
    },
    onError: () => {
      toast({ title: "Failed to create employee", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { employee: Partial<Employee>; propertyIds: string[] }) => {
      const response = await apiRequest("PUT", "/api/employees/" + data.employee.id, data.employee);
      await apiRequest("PUT", `/api/employees/${data.employee.id}/assignments`, { propertyIds: data.propertyIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Employee updated" });
    },
    onError: () => {
      toast({ title: "Failed to update employee", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/employees/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Employee deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete employee", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!employeeNumber || !firstName || !lastName || !roleId) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    
    if (!editingItem && !pinHash) {
      toast({ title: "PIN is required for new employees", variant: "destructive" });
      return;
    }

    const employeeData: Partial<Employee> = {
      employeeNumber,
      firstName,
      lastName,
      roleId,
      active,
    };

    if (pinHash) {
      employeeData.pinHash = pinHash;
    }

    if (editingItem) {
      employeeData.id = editingItem.id;
      updateMutation.mutate({ employee: employeeData, propertyIds: selectedPropertyIds });
    } else {
      createMutation.mutate({ employee: employeeData as Employee, propertyIds: selectedPropertyIds });
    }
  };

  const toggleProperty = (propertyId: string) => {
    setSelectedPropertyIds(prev => 
      prev.includes(propertyId) 
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  return (
    <div className="p-6">
      <DataTable
        data={employees}
        columns={columns}
        title="Employees"
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
        isLoading={isLoading}
        searchPlaceholder="Search employees..."
        emptyMessage="No employees configured"
      />

      <Dialog open={formOpen} onOpenChange={(open) => {
        if (!open) {
          setFormOpen(false);
          setEditingItem(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employeeNumber">Employee Number *</Label>
              <Input 
                id="employeeNumber"
                data-testid="input-employee-number"
                value={employeeNumber} 
                onChange={(e) => setEmployeeNumber(e.target.value)}
                placeholder="e.g., EMP001"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input 
                  id="firstName"
                  data-testid="input-first-name"
                  value={firstName} 
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input 
                  id="lastName"
                  data-testid="input-last-name"
                  value={lastName} 
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="pinHash">PIN {editingItem ? "(leave blank to keep current)" : "*"}</Label>
              <Input 
                id="pinHash"
                data-testid="input-pin"
                type="password"
                value={pinHash} 
                onChange={(e) => setPinHash(e.target.value)}
                placeholder="4-6 digit PIN"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="roleId">Role *</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger data-testid="select-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assigned Properties</Label>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                {properties.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No properties available</p>
                ) : (
                  properties.map((property) => (
                    <div key={property.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`property-${property.id}`}
                        data-testid={`checkbox-property-${property.id}`}
                        checked={selectedPropertyIds.includes(property.id)}
                        onCheckedChange={() => toggleProperty(property.id)}
                      />
                      <Label htmlFor={`property-${property.id}`} className="text-sm font-normal cursor-pointer">
                        {property.name}
                      </Label>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Select one or more properties this employee can access
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="active"
                data-testid="switch-active"
                checked={active}
                onCheckedChange={setActive}
              />
              <Label htmlFor="active">Active</Label>
            </div>

            <DialogFooter>
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
                data-testid="button-submit-employee"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingItem ? "Save Changes" : "Create Employee"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
