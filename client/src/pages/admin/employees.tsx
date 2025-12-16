import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EntityForm, type FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertEmployeeSchema, type Employee, type InsertEmployee, type Role } from "@shared/schema";
import { z } from "zod";

export default function EmployeesPage() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Employee | null>(null);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
  });

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

  const formFields: FormFieldConfig[] = [
    { name: "employeeNumber", label: "Employee Number", type: "text", placeholder: "e.g., EMP001", required: true },
    { name: "firstName", label: "First Name", type: "text", placeholder: "Enter first name", required: true },
    { name: "lastName", label: "Last Name", type: "text", placeholder: "Enter last name", required: true },
    { name: "pinHash", label: "PIN", type: "password", placeholder: "4-6 digit PIN", required: !editingItem },
    {
      name: "roleId",
      label: "Role",
      type: "select",
      options: [{ value: "", label: "None" }, ...roles.map((r) => ({ value: r.id, label: r.name }))],
    },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const createMutation = useMutation({
    mutationFn: async (data: InsertEmployee) => {
      const response = await apiRequest("POST", "/api/employees", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setFormOpen(false);
      toast({ title: "Employee created" });
    },
    onError: () => {
      toast({ title: "Failed to create employee", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Employee) => {
      const response = await apiRequest("PUT", "/api/employees/" + data.id, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setFormOpen(false);
      setEditingItem(null);
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

  const handleSubmit = (data: InsertEmployee) => {
    if (editingItem) {
      updateMutation.mutate({ ...editingItem, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formSchema = editingItem
    ? insertEmployeeSchema.extend({ pinHash: z.string().optional() })
    : insertEmployeeSchema;

  return (
    <div className="p-6">
      <DataTable
        data={employees}
        columns={columns}
        title="Employees"
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
        searchPlaceholder="Search employees..."
        emptyMessage="No employees configured"
      />

      <EntityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        schema={formSchema}
        fields={formFields}
        title={editingItem ? "Edit Employee" : "Add Employee"}
        initialData={editingItem || undefined}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
