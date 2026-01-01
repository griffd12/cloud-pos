import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type JobCode, type Role } from "@shared/schema";

export default function JobsPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<JobCode | null>(null);
  
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [roleId, setRoleId] = useState<string>("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [tipMode, setTipMode] = useState("not_eligible");
  const [active, setActive] = useState(true);

  const { data: jobs = [], isLoading } = useQuery<JobCode[]>({
    queryKey: ["/api/job-codes"],
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

  const resetForm = () => {
    setName("");
    setCode("");
    setRoleId("");
    setHourlyRate("");
    setTipMode("not_eligible");
    setActive(true);
  };

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setCode(editingItem.code);
      setRoleId(editingItem.roleId || "");
      setHourlyRate(editingItem.hourlyRate || "");
      setTipMode(editingItem.tipMode || "not_eligible");
      setActive(editingItem.active ?? true);
    } else {
      resetForm();
    }
  }, [editingItem]);

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return "No Role";
    const role = roles.find(r => r.id === roleId);
    return role?.name || "Unknown";
  };

  const columns: Column<JobCode>[] = [
    { key: "code", header: "Code", sortable: true },
    { key: "name", header: "Name", sortable: true },
    {
      key: "roleId",
      header: "Role",
      render: (value) => (
        <Badge variant="outline">{getRoleName(value as string | null)}</Badge>
      ),
    },
    {
      key: "hourlyRate",
      header: "Default Rate",
      render: (value) => value ? `$${parseFloat(value as string).toFixed(2)}/hr` : "-",
    },
    {
      key: "tipMode",
      header: "Tip Mode",
      render: (value) => {
        const modes: Record<string, string> = {
          not_eligible: "Not Eligible",
          pooled: "Pooled",
          direct: "Direct",
          both: "Both"
        };
        return modes[value as string] || value;
      },
    },
    {
      key: "active",
      header: "Status",
      render: (value) => (value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: Partial<JobCode>) => {
      const response = await apiRequest("POST", "/api/job-codes", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-codes"] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Job created" });
    },
    onError: () => {
      toast({ title: "Failed to create job", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<JobCode>) => {
      const response = await apiRequest("PATCH", "/api/job-codes/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-codes"] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: "Job updated" });
    },
    onError: () => {
      toast({ title: "Failed to update job", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", "/api/job-codes/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-codes"] });
      toast({ title: "Job deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete job", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !code) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const jobData: Partial<JobCode> = {
      name,
      code,
      roleId: roleId || null,
      hourlyRate: hourlyRate || null,
      tipMode,
      active,
    };

    if (editingItem) {
      jobData.id = editingItem.id;
      updateMutation.mutate(jobData);
    } else {
      createMutation.mutate(jobData);
    }
  };

  return (
    <div className="p-6">
      <DataTable
        title="Jobs"
        columns={columns}
        data={jobs}
        isLoading={isLoading}
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
        searchPlaceholder="Search jobs..."
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Job" : "New Job"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  data-testid="input-job-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g., SERVER, BARTENDER"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  data-testid="input-job-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Server, Bartender"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="role">Role (for permissions)</Label>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger data-testid="select-job-role">
                    <SelectValue placeholder="Select a role..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Role</SelectItem>
                    {roles.filter(r => r.active).map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Employees working this job will inherit the permissions from this role
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="hourlyRate">Default Hourly Rate</Label>
                <Input
                  id="hourlyRate"
                  data-testid="input-job-hourly-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Default rate used when no employee-specific rate is set
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tipMode">Tip Mode</Label>
                <Select value={tipMode} onValueChange={setTipMode}>
                  <SelectTrigger data-testid="select-job-tip-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_eligible">Not Eligible</SelectItem>
                    <SelectItem value="pooled">Pooled Tips</SelectItem>
                    <SelectItem value="direct">Direct Tips</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="active"
                  data-testid="switch-job-active"
                  checked={active}
                  onCheckedChange={setActive}
                />
                <Label htmlFor="active">Active</Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                data-testid="button-cancel-job"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="button-save-job"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
