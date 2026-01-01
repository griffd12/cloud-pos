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
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import {
  Calendar,
  Clock,
  Edit2,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Employee, Property, Timecard, TimecardException } from "@shared/schema";

export default function TimecardsPage() {
  const { toast } = useToast();
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [editingTimecard, setEditingTimecard] = useState<Timecard | null>(null);
  const [editForm, setEditForm] = useState({ clockIn: "", clockOut: "", reason: "" });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });

  const { data: timecards = [], isLoading } = useQuery<Timecard[]>({
    queryKey: ["/api/timecards", selectedProperty, format(weekStart, "yyyy-MM-dd")],
    enabled: !!selectedProperty,
  });

  const { data: exceptions = [] } = useQuery<TimecardException[]>({
    queryKey: ["/api/timecard-exceptions", selectedProperty],
    enabled: !!selectedProperty,
  });

  const updateTimecardMutation = useMutation({
    mutationFn: async (data: { id: string; clockInTime?: string; clockOutTime?: string; reason: string }) => {
      return apiRequest("PATCH", `/api/timecards/${data.id}`, {
        clockInTime: data.clockInTime,
        clockOutTime: data.clockOutTime,
        editReason: data.reason,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Timecard updated successfully." });
      setEditingTimecard(null);
      queryClient.invalidateQueries({ queryKey: ["/api/timecards"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resolveExceptionMutation = useMutation({
    mutationFn: async (data: { id: string; notes: string }) => {
      return apiRequest("POST", `/api/timecard-exceptions/${data.id}/resolve`, {
        resolvedById: "current-manager", // Would come from auth context
        resolutionNotes: data.notes,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Exception resolved." });
      queryClient.invalidateQueries({ queryKey: ["/api/timecard-exceptions"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    return emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "--:--";
    return format(new Date(date), "h:mm a");
  };

  const formatHours = (hours: string | number | null) => {
    if (!hours) return "0.00";
    return parseFloat(String(hours)).toFixed(2);
  };

  const getDayTimecards = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return timecards.filter((tc) => tc.businessDate === dateStr);
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const pendingExceptions = exceptions.filter((e) => e.status === "pending");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-timecards-title">Timecards</h1>
          <p className="text-muted-foreground">Review and edit employee timecards</p>
        </div>
        {pendingExceptions.length > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            {pendingExceptions.length} Exceptions
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-4">
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
            Select a property to view timecards
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-6">
          {pendingExceptions.length > 0 && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Pending Exceptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingExceptions.map((exc) => (
                      <TableRow key={exc.id}>
                        <TableCell>{getEmployeeName(exc.employeeId)}</TableCell>
                        <TableCell>{exc.businessDate}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{exc.exceptionType}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{exc.description}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveExceptionMutation.mutate({ id: exc.id, notes: "Resolved by manager" })}
                            disabled={resolveExceptionMutation.isPending}
                            data-testid={`button-resolve-exception-${exc.id}`}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Resolve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {weekDays.map((day) => {
            const dayCards = getDayTimecards(day);
            if (dayCards.length === 0) return null;

            return (
              <Card key={day.toISOString()}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {format(day, "EEEE, MMMM d")}
                    <Badge variant="secondary" className="ml-2">{dayCards.length} entries</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Regular</TableHead>
                        <TableHead>OT</TableHead>
                        <TableHead>Break</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dayCards.map((tc) => (
                        <TableRow key={tc.id}>
                          <TableCell className="font-medium">
                            {getEmployeeName(tc.employeeId)}
                          </TableCell>
                          <TableCell>{formatTime(tc.clockInTime)}</TableCell>
                          <TableCell>{formatTime(tc.clockOutTime)}</TableCell>
                          <TableCell className="tabular-nums">{formatHours(tc.regularHours)}</TableCell>
                          <TableCell className="tabular-nums">{formatHours(tc.overtimeHours)}</TableCell>
                          <TableCell className="tabular-nums">{tc.breakMinutes || 0}m</TableCell>
                          <TableCell className="tabular-nums font-semibold">{formatHours(tc.totalHours)}</TableCell>
                          <TableCell>
                            <Badge variant={tc.status === "approved" ? "default" : "secondary"}>
                              {tc.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingTimecard(tc);
                                setEditForm({
                                  clockIn: tc.clockInTime ? format(new Date(tc.clockInTime), "HH:mm") : "",
                                  clockOut: tc.clockOutTime ? format(new Date(tc.clockOutTime), "HH:mm") : "",
                                  reason: "",
                                });
                              }}
                              data-testid={`button-edit-timecard-${tc.id}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}

          {timecards.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No timecards for this week
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={!!editingTimecard} onOpenChange={() => setEditingTimecard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Edit Timecard
            </DialogTitle>
          </DialogHeader>
          {editingTimecard && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Clock In Time</label>
                  <Input
                    type="time"
                    value={editForm.clockIn}
                    onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })}
                    data-testid="input-clock-in"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Clock Out Time</label>
                  <Input
                    type="time"
                    value={editForm.clockOut}
                    onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })}
                    data-testid="input-clock-out"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Edit Reason (Required)</label>
                <Textarea
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  placeholder="Explain why this timecard is being edited..."
                  data-testid="input-edit-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTimecard(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editForm.reason.trim()) {
                  toast({ title: "Error", description: "Edit reason is required", variant: "destructive" });
                  return;
                }
                updateTimecardMutation.mutate({
                  id: editingTimecard!.id,
                  clockInTime: editForm.clockIn ? `${editingTimecard!.businessDate}T${editForm.clockIn}:00` : undefined,
                  clockOutTime: editForm.clockOut ? `${editingTimecard!.businessDate}T${editForm.clockOut}:00` : undefined,
                  reason: editForm.reason,
                });
              }}
              disabled={updateTimecardMutation.isPending}
              data-testid="button-save-timecard"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
