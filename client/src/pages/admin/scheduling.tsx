import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, startOfWeek, endOfWeek, addDays, differenceInMinutes, parseISO } from "date-fns";
import {
  Calendar,
  Plus,
  Send,
  Copy,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ChevronDown,
  Settings,
  Users,
  Clock,
} from "lucide-react";
import type { Employee, Property, Rvc, Shift, JobCode, EmployeeJobCode } from "@shared/schema";

type EmployeeJobCodeWithDetails = EmployeeJobCode & { jobCode: JobCode };

export default function SchedulingPage() {
  const { toast } = useToast();
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [isAddingShift, setIsAddingShift] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    employeeId: "",
    rvcId: "",
    jobCodeId: "",
    startTime: "09:00",
    endTime: "17:00",
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const { data: jobCodes = [] } = useQuery<JobCode[]>({
    queryKey: ["/api/job-codes"],
  });

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  const { data: shifts = [], isLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts", { propertyId: selectedProperty, startDate: weekStartStr, endDate: weekEndStr }],
    queryFn: async () => {
      if (!selectedProperty) return [];
      const res = await fetch(`/api/shifts?propertyId=${selectedProperty}&startDate=${weekStartStr}&endDate=${weekEndStr}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
    enabled: !!selectedProperty,
  });

  const { data: employeeJobCodesMap = {} } = useQuery<Record<string, EmployeeJobCodeWithDetails[]>>({
    queryKey: ["/api/properties", selectedProperty, "employee-job-codes"],
    queryFn: async () => {
      if (!selectedProperty) return {};
      const res = await fetch(`/api/properties/${selectedProperty}/employee-job-codes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch employee job codes");
      return res.json();
    },
    enabled: !!selectedProperty,
  });

  const createShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/shifts", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift created successfully." });
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateShiftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/shifts/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift updated." });
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/shifts/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const publishShiftsMutation = useMutation({
    mutationFn: async (shiftIds: string[]) => {
      return apiRequest("POST", "/api/shifts/publish", {
        shiftIds,
        publishedById: "current-manager",
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Schedule published to employees." });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const copyWeekMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/shifts/copy-week", {
        propertyId: selectedProperty,
        sourceWeekStart: format(addDays(weekStart, -7), "yyyy-MM-dd"),
        targetWeekStart: weekStartStr,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Previous week schedule copied." });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setIsAddingShift(false);
    setSelectedDay(null);
    setSelectedEmployee(null);
    setEditingShift(null);
    setShiftForm({ employeeId: "", rvcId: "", jobCodeId: "", startTime: "09:00", endTime: "17:00" });
  };

  const propertyRvcs = useMemo(() => rvcs.filter((r) => r.propertyId === selectedProperty), [rvcs, selectedProperty]);
  const propertyEmployees = useMemo(() => employees.filter((e) => e.propertyId === selectedProperty && e.active), [employees, selectedProperty]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const calculateShiftHours = (startTime: string | null, endTime: string | null): number => {
    if (!startTime || !endTime) return 0;
    try {
      const start = parseISO(`2000-01-01T${startTime}`);
      const end = parseISO(`2000-01-01T${endTime}`);
      let minutes = differenceInMinutes(end, start);
      if (minutes < 0) minutes += 24 * 60;
      return minutes / 60;
    } catch {
      return 0;
    }
  };

  const getPayRateForShift = (employeeId: string | null, jobCodeId: string | null): number => {
    if (!employeeId || !jobCodeId) return 0;
    const empJobCodes = employeeJobCodesMap[employeeId] || [];
    const assignment = empJobCodes.find((ejc) => ejc.jobCodeId === jobCodeId);
    return assignment?.payRate ? parseFloat(assignment.payRate) : 0;
  };

  const getJobCodeName = (jobCodeId: string | null): string => {
    if (!jobCodeId) return "";
    const jc = jobCodes.find((j) => j.id === jobCodeId);
    return jc?.name || "";
  };

  const getJobCodeColor = (jobCodeId: string | null): string => {
    if (!jobCodeId) return "#3B82F6";
    const jc = jobCodes.find((j) => j.id === jobCodeId);
    return jc?.color || "#3B82F6";
  };

  const employeeShiftsMap = useMemo(() => {
    const map: Record<string, { shifts: Shift[]; weeklyHours: number; weeklyCost: number }> = {};
    
    propertyEmployees.forEach((emp) => {
      map[emp.id] = { shifts: [], weeklyHours: 0, weeklyCost: 0 };
    });
    map["open"] = { shifts: [], weeklyHours: 0, weeklyCost: 0 };

    shifts.forEach((shift) => {
      const empId = shift.employeeId || "open";
      if (!map[empId]) {
        map[empId] = { shifts: [], weeklyHours: 0, weeklyCost: 0 };
      }
      map[empId].shifts.push(shift);
      const hours = calculateShiftHours(shift.startTime, shift.endTime);
      map[empId].weeklyHours += hours;
      if (shift.employeeId) {
        const rate = getPayRateForShift(shift.employeeId, shift.jobCodeId);
        map[empId].weeklyCost += hours * rate;
      }
    });

    return map;
  }, [shifts, propertyEmployees, employeeJobCodesMap]);

  const dailyTotals = useMemo(() => {
    return weekDays.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayShifts = shifts.filter((s) => s.shiftDate === dateStr);
      let hours = 0;
      let cost = 0;
      dayShifts.forEach((s) => {
        const h = calculateShiftHours(s.startTime, s.endTime);
        hours += h;
        if (s.employeeId) {
          cost += h * getPayRateForShift(s.employeeId, s.jobCodeId);
        }
      });
      return { hours, cost };
    });
  }, [shifts, weekDays, employeeJobCodesMap]);

  const weeklyTotals = useMemo(() => {
    return dailyTotals.reduce(
      (acc, day) => ({ hours: acc.hours + day.hours, cost: acc.cost + day.cost }),
      { hours: 0, cost: 0 }
    );
  }, [dailyTotals]);

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  const formatShiftTime = (time: string | null) => {
    if (!time) return "";
    try {
      return format(parseISO(`2000-01-01T${time}`), "h:mm a");
    } catch {
      return time;
    }
  };

  const getEmployeeShiftsForDay = (employeeId: string | null, date: Date): Shift[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    const empId = employeeId || "open";
    return (employeeShiftsMap[empId]?.shifts || []).filter((s) => s.shiftDate === dateStr);
  };

  const unpublishedShifts = useMemo(() => shifts.filter((s) => s.status === "draft"), [shifts]);

  const openAddShiftDialog = (employeeId: string | null, day: Date) => {
    setSelectedEmployee(employeeId);
    setSelectedDay(day);
    setShiftForm({
      employeeId: employeeId || "",
      rvcId: propertyRvcs[0]?.id || "",
      jobCodeId: "",
      startTime: "09:00",
      endTime: "17:00",
    });
    setIsAddingShift(true);
  };

  const openEditShiftDialog = (shift: Shift) => {
    setEditingShift(shift);
    setSelectedDay(parseISO(shift.shiftDate));
    setShiftForm({
      employeeId: shift.employeeId || "",
      rvcId: shift.rvcId || propertyRvcs[0]?.id || "",
      jobCodeId: shift.jobCodeId || "",
      startTime: shift.startTime || "09:00",
      endTime: shift.endTime || "17:00",
    });
    setIsAddingShift(true);
  };

  const handleSaveShift = () => {
    if (!shiftForm.rvcId) {
      toast({ title: "Error", description: "Please select a revenue center", variant: "destructive" });
      return;
    }
    if (shiftForm.employeeId && !shiftForm.jobCodeId) {
      toast({ title: "Error", description: "Please select a job for this shift", variant: "destructive" });
      return;
    }

    const shiftData = {
      propertyId: selectedProperty,
      rvcId: shiftForm.rvcId,
      employeeId: shiftForm.employeeId || null,
      jobCodeId: shiftForm.jobCodeId || null,
      shiftDate: format(selectedDay!, "yyyy-MM-dd"),
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      status: "draft",
    };

    if (editingShift) {
      updateShiftMutation.mutate({ id: editingShift.id, data: shiftData });
    } else {
      createShiftMutation.mutate(shiftData);
    }
  };

  const selectedEmployeeJobCodes = useMemo(() => {
    if (!shiftForm.employeeId) return [];
    return employeeJobCodesMap[shiftForm.employeeId] || [];
  }, [shiftForm.employeeId, employeeJobCodesMap]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-scheduling-title">Scheduling</h1>
          <p className="text-muted-foreground">Build and publish employee schedules</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {unpublishedShifts.length > 0 && (
            <Button
              onClick={() => setShowPublishConfirm(true)}
              disabled={publishShiftsMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-publish-shifts"
            >
              <Send className="w-4 h-4 mr-2" />
              Publish ({unpublishedShifts.length})
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            data-testid="button-settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-4 py-2 border rounded-md bg-background min-w-[200px] text-center text-sm font-medium">
            {format(weekStart, "MM/dd/yyyy")} - {format(weekEnd, "MM/dd/yyyy")}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            data-testid="button-next-week"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Select value={selectedProperty} onValueChange={setSelectedProperty}>
          <SelectTrigger className="w-[200px]" data-testid="select-property">
            <SelectValue placeholder="Select property..." />
          </SelectTrigger>
          <SelectContent>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => copyWeekMutation.mutate()}
          disabled={copyWeekMutation.isPending || !selectedProperty}
          data-testid="button-copy-week"
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy Last Week
        </Button>
      </div>

      {!selectedProperty ? (
        <div className="border rounded-md p-8 text-center text-muted-foreground">
          Select a property to view and manage schedules
        </div>
      ) : isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 border-b font-medium w-48 sticky left-0 bg-muted/50 z-10">
                    Team member
                  </th>
                  {weekDays.map((day) => (
                    <th key={day.toISOString()} className="text-left p-3 border-b border-l font-medium min-w-[120px]">
                      <div className="text-sm">{format(day, "EEE M/d")}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/20">
                  <td className="p-3 sticky left-0 bg-background z-10 border-r">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Open shifts</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatHours(employeeShiftsMap["open"]?.weeklyHours || 0)}
                    </div>
                  </td>
                  {weekDays.map((day) => {
                    const dayShifts = getEmployeeShiftsForDay(null, day);
                    return (
                      <td key={day.toISOString()} className="p-2 border-l align-top min-h-[80px]">
                        <div className="space-y-1">
                          {dayShifts.map((shift) => (
                            <ShiftBlock
                              key={shift.id}
                              shift={shift}
                              jobName={getJobCodeName(shift.jobCodeId)}
                              color={getJobCodeColor(shift.jobCodeId)}
                              onEdit={() => openEditShiftDialog(shift)}
                              onDelete={() => deleteShiftMutation.mutate(shift.id)}
                            />
                          ))}
                          <button
                            onClick={() => openAddShiftDialog(null, day)}
                            className="w-full h-6 border border-dashed rounded text-muted-foreground hover:border-foreground hover:text-foreground transition-colors flex items-center justify-center text-xs"
                            data-testid={`button-add-open-shift-${format(day, "yyyy-MM-dd")}`}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {propertyEmployees.map((emp) => {
                  const empData = employeeShiftsMap[emp.id] || { shifts: [], weeklyHours: 0, weeklyCost: 0 };
                  return (
                    <tr key={emp.id} className="border-b hover:bg-muted/20">
                      <td className="p-3 sticky left-0 bg-background z-10 border-r">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-1 hover:text-primary transition-colors text-left">
                              <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem>View availability</DropdownMenuItem>
                            <DropdownMenuItem>Time off requests</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatHours(empData.weeklyHours)} {formatCurrency(empData.weeklyCost)}
                        </div>
                      </td>
                      {weekDays.map((day) => {
                        const dayShifts = getEmployeeShiftsForDay(emp.id, day);
                        return (
                          <td key={day.toISOString()} className="p-2 border-l align-top min-h-[80px]">
                            <div className="space-y-1">
                              {dayShifts.length === 0 ? (
                                <button
                                  onClick={() => openAddShiftDialog(emp.id, day)}
                                  className="w-full h-12 border border-dashed rounded text-muted-foreground hover:border-foreground hover:text-foreground transition-colors flex items-center justify-center"
                                  data-testid={`button-add-shift-${emp.id}-${format(day, "yyyy-MM-dd")}`}
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              ) : dayShifts.length === 1 ? (
                                <>
                                  <ShiftBlock
                                    shift={dayShifts[0]}
                                    jobName={getJobCodeName(dayShifts[0].jobCodeId)}
                                    color={getJobCodeColor(dayShifts[0].jobCodeId)}
                                    onEdit={() => openEditShiftDialog(dayShifts[0])}
                                    onDelete={() => deleteShiftMutation.mutate(dayShifts[0].id)}
                                  />
                                  <button
                                    onClick={() => openAddShiftDialog(emp.id, day)}
                                    className="w-full h-5 border border-dashed rounded text-muted-foreground hover:border-foreground hover:text-foreground transition-colors flex items-center justify-center text-xs opacity-0 hover:opacity-100"
                                    data-testid={`button-add-another-shift-${emp.id}-${format(day, "yyyy-MM-dd")}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="w-full">
                                      <ShiftBlock
                                        shift={dayShifts[0]}
                                        jobName={getJobCodeName(dayShifts[0].jobCodeId)}
                                        color={getJobCodeColor(dayShifts[0].jobCodeId)}
                                        showBadge={dayShifts.length}
                                      />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="w-48">
                                    {dayShifts.map((shift, idx) => (
                                      <DropdownMenuItem
                                        key={shift.id}
                                        onClick={() => openEditShiftDialog(shift)}
                                        className="flex items-center justify-between"
                                      >
                                        <span className="text-sm">
                                          {getJobCodeName(shift.jobCodeId) || "Shift"} {idx + 1}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {formatShiftTime(shift.startTime)}
                                        </span>
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuItem onClick={() => openAddShiftDialog(emp.id, day)}>
                                      <Plus className="w-3 h-3 mr-2" />
                                      Add shift
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 font-medium">
                  <td className="p-3 sticky left-0 bg-muted/30 z-10 border-r border-t">
                    <div className="text-sm">{formatCurrency(weeklyTotals.cost)}</div>
                    <div className="text-xs text-muted-foreground">{formatHours(weeklyTotals.hours)}</div>
                  </td>
                  {dailyTotals.map((total, idx) => (
                    <td key={idx} className="p-3 border-l border-t text-sm">
                      <div>{formatCurrency(total.cost)}</div>
                      <div className="text-xs text-muted-foreground">{formatHours(total.hours)}</div>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <Dialog open={isAddingShift} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {editingShift ? "Edit Shift" : "Add Shift"} - {selectedDay && format(selectedDay, "EEEE, MMM d")}
            </DialogTitle>
            <DialogDescription>
              {selectedEmployee 
                ? `Schedule for ${propertyEmployees.find(e => e.id === selectedEmployee)?.firstName || "employee"}`
                : "Create an open shift for staff to claim"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedEmployee && (
              <div>
                <label className="text-sm font-medium">Employee (optional for open shift)</label>
                <Select
                  value={shiftForm.employeeId || "OPEN_SHIFT"}
                  onValueChange={(v) => setShiftForm({ ...shiftForm, employeeId: v === "OPEN_SHIFT" ? "" : v, jobCodeId: "" })}
                >
                  <SelectTrigger data-testid="select-employee">
                    <SelectValue placeholder="Leave empty for open shift..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN_SHIFT">Open Shift</SelectItem>
                    {propertyEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {shiftForm.employeeId && (
              <div>
                <label className="text-sm font-medium">Job / Role</label>
                <Select
                  value={shiftForm.jobCodeId}
                  onValueChange={(v) => setShiftForm({ ...shiftForm, jobCodeId: v })}
                >
                  <SelectTrigger data-testid="select-job">
                    <SelectValue placeholder="Select job for this shift..." />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedEmployeeJobCodes.filter((ejc) => ejc.jobCodeId).map((ejc) => (
                      <SelectItem key={ejc.jobCodeId} value={ejc.jobCodeId}>
                        {ejc.jobCode?.name || "Job"} - {formatCurrency(parseFloat(ejc.payRate || "0"))}/hr
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Revenue Center</label>
              <Select
                value={shiftForm.rvcId}
                onValueChange={(v) => setShiftForm({ ...shiftForm, rvcId: v })}
              >
                <SelectTrigger data-testid="select-rvc">
                  <SelectValue placeholder="Select RVC..." />
                </SelectTrigger>
                <SelectContent>
                  {propertyRvcs.map((rvc) => (
                    <SelectItem key={rvc.id} value={rvc.id}>
                      {rvc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Start Time</label>
                <Input
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                  data-testid="input-start-time"
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Time</label>
                <Input
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                  data-testid="input-end-time"
                />
              </div>
            </div>

            {shiftForm.employeeId && shiftForm.jobCodeId && (
              <div className="p-3 bg-muted rounded-md text-sm">
                <div className="flex justify-between">
                  <span>Shift Duration:</span>
                  <span className="font-medium">{formatHours(calculateShiftHours(shiftForm.startTime, shiftForm.endTime))}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Estimated Cost:</span>
                  <span className="font-medium">
                    {formatCurrency(
                      calculateShiftHours(shiftForm.startTime, shiftForm.endTime) * 
                      getPayRateForShift(shiftForm.employeeId, shiftForm.jobCodeId)
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            {editingShift && (
              <Button
                variant="destructive"
                onClick={() => {
                  deleteShiftMutation.mutate(editingShift.id);
                  closeDialog();
                }}
              >
                Delete
              </Button>
            )}
            <Button
              onClick={handleSaveShift}
              disabled={createShiftMutation.isPending || updateShiftMutation.isPending}
              data-testid="button-save-shift"
            >
              {editingShift ? "Update" : "Add"} Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPublishConfirm} onOpenChange={setShowPublishConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Schedule</DialogTitle>
            <DialogDescription>
              You are about to publish {unpublishedShifts.length} shift(s) for the week of {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}.
              Once published, employees will be notified and can view their schedules.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPublishConfirm(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                publishShiftsMutation.mutate(unpublishedShifts.map((s) => s.id));
                setShowPublishConfirm(false);
              }}
              disabled={publishShiftsMutation.isPending}
              data-testid="button-confirm-publish"
            >
              <Send className="w-4 h-4 mr-2" />
              Publish Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShiftBlock({
  shift,
  jobName,
  color,
  onEdit,
  onDelete,
  showBadge,
}: {
  shift: Shift;
  jobName: string;
  color: string;
  onEdit?: () => void;
  onDelete?: () => void;
  showBadge?: number;
}) {
  const formatTime = (time: string | null) => {
    if (!time) return "";
    try {
      return format(parseISO(`2000-01-01T${time}`), "h:mm a");
    } catch {
      return time;
    }
  };

  const isPublished = shift.status === "published";
  const bgOpacity = isPublished ? "bg-opacity-100" : "bg-opacity-60";

  return (
    <div
      onClick={onEdit}
      className={`p-2 rounded cursor-pointer relative group text-white ${bgOpacity}`}
      style={{ backgroundColor: isPublished ? color : `${color}99` }}
      data-testid={`shift-block-${shift.id}`}
    >
      {showBadge && showBadge > 1 && (
        <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
          {showBadge}
        </Badge>
      )}
      <div className="text-xs font-medium truncate flex items-center gap-1">
        {jobName || "Shift"}
        {!isPublished && (
          <span className="text-[10px] opacity-80">(draft)</span>
        )}
      </div>
      <div className="text-[10px] opacity-90">
        {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-1 right-1 w-4 h-4 rounded bg-black/20 hover:bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          data-testid={`button-delete-shift-${shift.id}`}
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}
