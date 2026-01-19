import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  AlertTriangle,
  Baby,
  Calendar,
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  Plus,
  Shield,
  Trash2,
  UserCheck,
} from "lucide-react";
import { format, differenceInYears, parseISO, addDays, isBefore } from "date-fns";
import type { Property, Employee, EmployeeMinorStatus, MinorLaborRule } from "@shared/schema";

interface MinorEmployee {
  employee: Employee;
  minorStatus: EmployeeMinorStatus | null;
  age: number | null;
  workPermitStatus: "valid" | "expiring_soon" | "expired" | "none";
}

export default function MinorLaborPage() {
  const { toast } = useToast();
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [formData, setFormData] = useState({
    dateOfBirth: "",
    workPermitNumber: "",
    workPermitExpirationDate: "",
    maxDailyHours: "8",
    maxWeeklyHours: "40",
    noWorkAfter: "22:00",
    noWorkBefore: "06:00",
    parentGuardianName: "",
    parentGuardianPhone: "",
    schoolName: "",
    notes: "",
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees?propertyId=" + selectedProperty],
    enabled: !!selectedProperty,
  });

  const { data: minorStatuses = [], isLoading } = useQuery<EmployeeMinorStatus[]>({
    queryKey: ["/api/employee-minor-status?propertyId=" + selectedProperty],
    enabled: !!selectedProperty,
  });

  const { data: laborRules = [] } = useQuery<MinorLaborRule[]>({
    queryKey: ["/api/minor-labor-rules?propertyId=" + selectedProperty],
    enabled: !!selectedProperty,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/employee-minor-status", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Minor status created." });
      setShowAddDialog(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/employee-minor-status?propertyId=" + selectedProperty] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/employee-minor-status/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Minor status deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-minor-status?propertyId=" + selectedProperty] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedEmployee("");
    setFormData({
      dateOfBirth: "",
      workPermitNumber: "",
      workPermitExpirationDate: "",
      maxDailyHours: "8",
      maxWeeklyHours: "40",
      noWorkAfter: "22:00",
      noWorkBefore: "06:00",
      parentGuardianName: "",
      parentGuardianPhone: "",
      schoolName: "",
      notes: "",
    });
  };

  const handleSubmit = () => {
    if (!selectedEmployee || !formData.dateOfBirth) {
      toast({ title: "Error", description: "Employee and date of birth are required.", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      employeeId: selectedEmployee,
      propertyId: selectedProperty,
      ...formData,
    });
  };

  const now = new Date();

  const minorEmployees: MinorEmployee[] = minorStatuses.map(status => {
    const employee = employees.find(e => e.id === status.employeeId);
    const dob = status.dateOfBirth ? parseISO(status.dateOfBirth) : null;
    const age = dob ? differenceInYears(now, dob) : null;

    let workPermitStatus: MinorEmployee["workPermitStatus"] = "none";
    if (status.workPermitExpirationDate) {
      const expDate = parseISO(status.workPermitExpirationDate);
      if (isBefore(expDate, now)) {
        workPermitStatus = "expired";
      } else if (isBefore(expDate, addDays(now, 30))) {
        workPermitStatus = "expiring_soon";
      } else {
        workPermitStatus = "valid";
      }
    }

    return {
      employee: employee || ({ id: status.employeeId, firstName: "Unknown", lastName: "" } as Employee),
      minorStatus: status,
      age,
      workPermitStatus,
    };
  });

  const activeMinors = minorEmployees.filter(m => m.age !== null && m.age < 18);
  const expiredPermits = minorEmployees.filter(m => m.workPermitStatus === "expired");
  const expiringPermits = minorEmployees.filter(m => m.workPermitStatus === "expiring_soon");

  const employeesWithoutStatus = employees.filter(
    e => !minorStatuses.some(s => s.employeeId === e.id)
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Minor Labor Compliance</h1>
          <p className="text-muted-foreground">
            Track minor employees and enforce work hour restrictions
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Baby className="w-5 h-5" />
            Minor Employee Tracking
          </CardTitle>
          <CardDescription>
            Manage work permits and hour restrictions for employees under 18
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={selectedProperty} onValueChange={setSelectedProperty}>
              <SelectTrigger className="w-[300px]" data-testid="select-property">
                <SelectValue placeholder="Select property..." />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedProperty && (
              <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-minor">
                <Plus className="w-4 h-4 mr-2" />
                Add Minor Employee
              </Button>
            )}
          </div>

          {!selectedProperty && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="w-5 h-5 mr-2" />
              Select a property to view minor employees
            </div>
          )}

          {selectedProperty && isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {selectedProperty && !isLoading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <Baby className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                    <div className="text-2xl font-bold">{activeMinors.length}</div>
                    <div className="text-sm text-muted-foreground">Active Minors</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-green-600" />
                    <div className="text-2xl font-bold">
                      {minorEmployees.filter(m => m.workPermitStatus === "valid").length}
                    </div>
                    <div className="text-sm text-muted-foreground">Valid Permits</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                    <div className="text-2xl font-bold text-yellow-600">{expiringPermits.length}</div>
                    <div className="text-sm text-muted-foreground">Expiring Soon</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-600" />
                    <div className="text-2xl font-bold text-red-600">{expiredPermits.length}</div>
                    <div className="text-sm text-muted-foreground">Expired Permits</div>
                  </CardContent>
                </Card>
              </div>

              {minorEmployees.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Shield className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No Minor Employees</p>
                  <p className="text-sm">Add minor employees to track work permits and restrictions.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Work Permit</TableHead>
                      <TableHead>Expiration</TableHead>
                      <TableHead>Max Hours</TableHead>
                      <TableHead>Restricted Hours</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {minorEmployees.map((minor) => (
                      <TableRow
                        key={minor.minorStatus?.id}
                        className={
                          minor.workPermitStatus === "expired" ? "bg-red-50 dark:bg-red-950/30" :
                          minor.workPermitStatus === "expiring_soon" ? "bg-yellow-50 dark:bg-yellow-950/30" : ""
                        }
                        data-testid={`row-minor-${minor.employee.id}`}
                      >
                        <TableCell className="font-medium">
                          {minor.employee.firstName} {minor.employee.lastName}
                        </TableCell>
                        <TableCell>
                          {minor.age !== null ? (
                            <Badge variant={minor.age < 16 ? "destructive" : "secondary"}>
                              {minor.age} years
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {minor.minorStatus?.workPermitNumber ? (
                            <span className="font-mono text-sm">{minor.minorStatus.workPermitNumber}</span>
                          ) : (
                            <Badge variant="outline">No Permit</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {minor.minorStatus?.workPermitExpirationDate ? (
                            <div className="flex items-center gap-2">
                              {minor.workPermitStatus === "expired" && (
                                <AlertCircle className="w-4 h-4 text-red-600" />
                              )}
                              {minor.workPermitStatus === "expiring_soon" && (
                                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                              )}
                              {minor.workPermitStatus === "valid" && (
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              )}
                              <span>{format(parseISO(minor.minorStatus.workPermitExpirationDate), "MMM d, yyyy")}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{minor.minorStatus?.maxDailyHours || 8}h/day</div>
                            <div className="text-muted-foreground">{minor.minorStatus?.maxWeeklyHours || 40}h/week</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {minor.minorStatus?.noWorkBefore && minor.minorStatus?.noWorkAfter ? (
                            <Badge variant="outline">
                              <Clock className="w-3 h-3 mr-1" />
                              {minor.minorStatus.noWorkBefore} - {minor.minorStatus.noWorkAfter}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => minor.minorStatus && deleteMutation.mutate(minor.minorStatus.id)}
                            data-testid={`button-delete-${minor.employee.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            California Minor Labor Law Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-semibold">14-15 Year Olds</h4>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                <li>Max 3 hours on school days</li>
                <li>Max 8 hours on non-school days</li>
                <li>Max 18 hours during school week</li>
                <li>Cannot work before 7am or after 7pm</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">16-17 Year Olds</h4>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                <li>Max 4 hours on school days</li>
                <li>Max 8 hours on non-school days</li>
                <li>Max 48 hours during non-school week</li>
                <li>Cannot work before 5am or after 10pm (12:30am weekends)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Work Permit Requirements</h4>
              <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                <li>Required for all minors in California</li>
                <li>Issued by school district</li>
                <li>Must be renewed each school year</li>
                <li>Employer must keep copy on file</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Minor Employee</DialogTitle>
            <DialogDescription>
              Track work permit and hour restrictions for a minor employee.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger data-testid="select-employee">
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  {employeesWithoutStatus.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  data-testid="input-dob"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="permitNumber">Work Permit Number</Label>
                <Input
                  id="permitNumber"
                  value={formData.workPermitNumber}
                  onChange={(e) => setFormData({ ...formData, workPermitNumber: e.target.value })}
                  placeholder="WP-12345"
                  data-testid="input-permit-number"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="permitExpiration">Permit Expiration</Label>
                <Input
                  id="permitExpiration"
                  type="date"
                  value={formData.workPermitExpirationDate}
                  onChange={(e) => setFormData({ ...formData, workPermitExpirationDate: e.target.value })}
                  data-testid="input-permit-expiration"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schoolName">School Name</Label>
                <Input
                  id="schoolName"
                  value={formData.schoolName}
                  onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                  placeholder="Lincoln High School"
                  data-testid="input-school"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxDaily">Max Daily Hours</Label>
                <Input
                  id="maxDaily"
                  type="number"
                  value={formData.maxDailyHours}
                  onChange={(e) => setFormData({ ...formData, maxDailyHours: e.target.value })}
                  data-testid="input-max-daily"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxWeekly">Max Weekly Hours</Label>
                <Input
                  id="maxWeekly"
                  type="number"
                  value={formData.maxWeeklyHours}
                  onChange={(e) => setFormData({ ...formData, maxWeeklyHours: e.target.value })}
                  data-testid="input-max-weekly"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="noWorkBefore">No Work Before</Label>
                <Input
                  id="noWorkBefore"
                  type="time"
                  value={formData.noWorkBefore}
                  onChange={(e) => setFormData({ ...formData, noWorkBefore: e.target.value })}
                  data-testid="input-no-work-before"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="noWorkAfter">No Work After</Label>
                <Input
                  id="noWorkAfter"
                  type="time"
                  value={formData.noWorkAfter}
                  onChange={(e) => setFormData({ ...formData, noWorkAfter: e.target.value })}
                  data-testid="input-no-work-after"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="parentName">Parent/Guardian Name</Label>
                <Input
                  id="parentName"
                  value={formData.parentGuardianName}
                  onChange={(e) => setFormData({ ...formData, parentGuardianName: e.target.value })}
                  data-testid="input-parent-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parentPhone">Parent/Guardian Phone</Label>
                <Input
                  id="parentPhone"
                  type="tel"
                  value={formData.parentGuardianPhone}
                  onChange={(e) => setFormData({ ...formData, parentGuardianPhone: e.target.value })}
                  data-testid="input-parent-phone"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              data-testid="button-save"
            >
              Add Minor Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
