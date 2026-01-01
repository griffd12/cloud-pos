import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
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
import { format, startOfWeek, endOfWeek, addDays, parseISO } from "date-fns";
import {
  Calendar,
  Plus,
  Send,
  Copy,
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Users,
} from "lucide-react";
import type { Employee, Property, Rvc, Shift } from "@shared/schema";

export default function SchedulingPage() {
  const { toast } = useToast();
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [isAddingShift, setIsAddingShift] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [shiftForm, setShiftForm] = useState({
    employeeId: "",
    rvcId: "",
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

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });

  const { data: shifts = [], isLoading } = useQuery<Shift[]>({
    queryKey: ["/api/shifts", selectedProperty, format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd")],
    enabled: !!selectedProperty,
  });

  const createShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/shifts", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift created successfully." });
      setIsAddingShift(false);
      setSelectedDay(null);
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
        publishedById: "current-manager", // Would come from auth context
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shifts published to employees." });
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
        targetWeekStart: format(weekStart, "yyyy-MM-dd"),
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

  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    return emp ? `${emp.firstName} ${emp.lastName}` : "Unassigned";
  };

  const getDayShifts = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return shifts.filter((s) => s.shiftDate === dateStr);
  };

  const formatShiftTime = (time: string | null) => {
    if (!time) return "";
    try {
      return format(parseISO(`2000-01-01T${time}`), "h:mm a");
    } catch {
      return time;
    }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const unpublishedShifts = shifts.filter((s) => s.status === "draft");
  const propertyRvcs = rvcs.filter((r) => r.propertyId === selectedProperty);
  const propertyEmployees = employees.filter((e) => e.propertyId === selectedProperty);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-scheduling-title">Scheduling</h1>
          <p className="text-muted-foreground">Build and publish employee schedules</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {unpublishedShifts.length > 0 && (
            <Button
              onClick={() => publishShiftsMutation.mutate(unpublishedShifts.map((s) => s.id))}
              disabled={publishShiftsMutation.isPending}
              data-testid="button-publish-shifts"
            >
              <Send className="w-4 h-4 mr-2" />
              Publish {unpublishedShifts.length} Shifts
            </Button>
          )}
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
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 max-w-xs">
          <select
            className="w-full p-2 border rounded-md bg-background"
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            data-testid="select-property"
          >
            <option value="">Select a property...</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-4 py-2 border rounded-md bg-background min-w-[200px] text-center">
            <Calendar className="w-4 h-4 inline mr-2" />
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
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
      </div>

      {!selectedProperty ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select a property to view and manage schedules
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const dayShifts = getDayShifts(day);
            const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

            return (
              <Card key={day.toISOString()} className={isToday ? "ring-2 ring-primary" : ""}>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className={isToday ? "text-primary" : ""}>
                      {format(day, "EEE")}
                    </span>
                    <span className="font-normal text-muted-foreground">
                      {format(day, "d")}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-1 space-y-2">
                  {dayShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="p-2 rounded-md bg-muted/50 text-xs space-y-1 group relative"
                    >
                      <div className="font-medium truncate">
                        {getEmployeeName(shift.employeeId || "")}
                      </div>
                      <div className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatShiftTime(shift.startTime)} - {formatShiftTime(shift.endTime)}
                      </div>
                      {shift.status === "draft" && (
                        <Badge variant="outline" className="text-xs px-1 py-0">Draft</Badge>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-1 right-1 w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteShiftMutation.mutate(shift.id)}
                        data-testid={`button-delete-shift-${shift.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 border-dashed border"
                    onClick={() => {
                      setSelectedDay(day);
                      setIsAddingShift(true);
                      setShiftForm({
                        employeeId: "",
                        rvcId: propertyRvcs[0]?.id || "",
                        startTime: "09:00",
                        endTime: "17:00",
                      });
                    }}
                    data-testid={`button-add-shift-${format(day, "yyyy-MM-dd")}`}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isAddingShift} onOpenChange={setIsAddingShift}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Add Shift - {selectedDay && format(selectedDay, "EEEE, MMM d")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Employee</label>
              <Select
                value={shiftForm.employeeId}
                onValueChange={(v) => setShiftForm({ ...shiftForm, employeeId: v })}
              >
                <SelectTrigger data-testid="select-employee">
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  {propertyEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingShift(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!shiftForm.employeeId || !shiftForm.rvcId) {
                  toast({ title: "Error", description: "Please select employee and RVC", variant: "destructive" });
                  return;
                }
                createShiftMutation.mutate({
                  propertyId: selectedProperty,
                  rvcId: shiftForm.rvcId,
                  employeeId: shiftForm.employeeId,
                  shiftDate: format(selectedDay!, "yyyy-MM-dd"),
                  startTime: shiftForm.startTime,
                  endTime: shiftForm.endTime,
                  status: "draft",
                });
              }}
              disabled={createShiftMutation.isPending}
              data-testid="button-save-shift"
            >
              Add Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
