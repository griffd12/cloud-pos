import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Clock,
  Play,
  Square,
  Coffee,
  Utensils,
  ArrowRight,
  Timer,
  CheckCircle2,
} from "lucide-react";
import type { Employee, Property, TimePunch, BreakSession, Timecard } from "@shared/schema";

export default function TimeClockPage() {
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<string>("");

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: clockStatus, refetch: refetchStatus } = useQuery<{
    isClockedIn: boolean;
    lastPunch?: TimePunch;
    activeBreak?: BreakSession;
    todayTimecard?: Timecard;
  }>({
    queryKey: ["/api/time-clock/status", selectedEmployee?.id],
    enabled: !!selectedEmployee,
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/time-clock/clock-in", {
        employeeId: selectedEmployee?.id,
        propertyId: selectedProperty,
      });
    },
    onSuccess: () => {
      toast({ title: "Clocked In", description: "You are now clocked in." });
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/time-punches"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/time-clock/clock-out", {
        employeeId: selectedEmployee?.id,
        propertyId: selectedProperty,
      });
    },
    onSuccess: () => {
      toast({ title: "Clocked Out", description: "You are now clocked out." });
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/time-punches"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const startBreakMutation = useMutation({
    mutationFn: async (breakType: string) => {
      return apiRequest("POST", "/api/time-clock/break/start", {
        employeeId: selectedEmployee?.id,
        propertyId: selectedProperty,
        breakType,
      });
    },
    onSuccess: () => {
      toast({ title: "Break Started", description: "Your break has started." });
      refetchStatus();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const endBreakMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/time-clock/break/end", {
        employeeId: selectedEmployee?.id,
      });
    },
    onSuccess: () => {
      toast({ title: "Break Ended", description: "Your break has ended." });
      refetchStatus();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const formatTime = (date: Date | string | null) => {
    if (!date) return "--:--";
    return format(new Date(date), "h:mm a");
  };

  const formatHours = (hours: string | number | null) => {
    if (!hours) return "0.00";
    const h = parseFloat(String(hours));
    return h.toFixed(2);
  };

  if (propertiesLoading || employeesLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-time-clock-title">Time Clock</h1>
        <p className="text-muted-foreground">Clock in, clock out, and manage breaks</p>
      </div>

      {!selectedEmployee ? (
        <Card>
          <CardHeader>
            <CardTitle>Select Employee</CardTitle>
            <CardDescription>Choose an employee to view or manage their time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <label className="text-sm font-medium">Property</label>
              <select
                className="w-full mt-1 p-2 border rounded-md bg-background"
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
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {employees
                .filter((e) => !selectedProperty || e.propertyId === selectedProperty)
                .map((emp) => (
                  <Button
                    key={emp.id}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2"
                    onClick={() => {
                      setSelectedEmployee(emp);
                      if (!selectedProperty && emp.propertyId) {
                        setSelectedProperty(emp.propertyId);
                      }
                    }}
                    data-testid={`button-employee-${emp.id}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-lg font-semibold">
                        {emp.firstName?.[0]}{emp.lastName?.[0]}
                      </span>
                    </div>
                    <span className="text-sm">{emp.firstName} {emp.lastName}</span>
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xl font-semibold">
                  {selectedEmployee.firstName?.[0]}{selectedEmployee.lastName?.[0]}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold">
                  {selectedEmployee.firstName} {selectedEmployee.lastName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {properties.find((p) => p.id === selectedProperty)?.name}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setSelectedEmployee(null)}
              data-testid="button-change-employee"
            >
              Change Employee
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Time Clock
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-4">
                  <div className="text-4xl font-bold tabular-nums" data-testid="text-current-time">
                    {format(new Date(), "h:mm:ss a")}
                  </div>
                  <div className="text-muted-foreground">
                    {format(new Date(), "EEEE, MMMM d, yyyy")}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2">
                  {clockStatus?.isClockedIn ? (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Clocked In
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not Clocked In</Badge>
                  )}
                  
                  {clockStatus?.activeBreak && (
                    <Badge variant="outline" className="border-amber-500 text-amber-600">
                      <Coffee className="w-3 h-3 mr-1" />
                      On Break
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {!clockStatus?.isClockedIn ? (
                    <Button
                      size="lg"
                      className="col-span-2 h-16 text-lg"
                      onClick={() => clockInMutation.mutate()}
                      disabled={clockInMutation.isPending}
                      data-testid="button-clock-in"
                    >
                      <Play className="w-5 h-5 mr-2" />
                      Clock In
                    </Button>
                  ) : (
                    <>
                      {!clockStatus?.activeBreak ? (
                        <>
                          <Button
                            variant="outline"
                            className="h-14"
                            onClick={() => startBreakMutation.mutate("paid")}
                            disabled={startBreakMutation.isPending}
                            data-testid="button-paid-break"
                          >
                            <Coffee className="w-4 h-4 mr-2" />
                            Paid Break
                          </Button>
                          <Button
                            variant="outline"
                            className="h-14"
                            onClick={() => startBreakMutation.mutate("meal")}
                            disabled={startBreakMutation.isPending}
                            data-testid="button-meal-break"
                          >
                            <Utensils className="w-4 h-4 mr-2" />
                            Meal Break
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          className="col-span-2 h-14"
                          onClick={() => endBreakMutation.mutate()}
                          disabled={endBreakMutation.isPending}
                          data-testid="button-end-break"
                        >
                          <ArrowRight className="w-4 h-4 mr-2" />
                          End Break
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        className="col-span-2 h-14"
                        onClick={() => clockOutMutation.mutate()}
                        disabled={clockOutMutation.isPending || !!clockStatus?.activeBreak}
                        data-testid="button-clock-out"
                      >
                        <Square className="w-4 h-4 mr-2" />
                        Clock Out
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="w-5 h-5" />
                  Today's Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="text-sm text-muted-foreground">Clock In</div>
                      <div className="text-xl font-semibold" data-testid="text-clock-in-time">
                        {clockStatus?.todayTimecard?.clockInTime
                          ? formatTime(clockStatus.todayTimecard.clockInTime)
                          : "--:--"}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="text-sm text-muted-foreground">Clock Out</div>
                      <div className="text-xl font-semibold" data-testid="text-clock-out-time">
                        {clockStatus?.todayTimecard?.clockOutTime
                          ? formatTime(clockStatus.todayTimecard.clockOutTime)
                          : "--:--"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <div className="text-sm text-muted-foreground">Regular</div>
                      <div className="text-xl font-semibold tabular-nums" data-testid="text-regular-hours">
                        {formatHours(clockStatus?.todayTimecard?.regularHours ?? null)}h
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <div className="text-sm text-muted-foreground">Overtime</div>
                      <div className="text-xl font-semibold tabular-nums" data-testid="text-overtime-hours">
                        {formatHours(clockStatus?.todayTimecard?.overtimeHours ?? null)}h
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <div className="text-sm text-muted-foreground">Break</div>
                      <div className="text-xl font-semibold tabular-nums" data-testid="text-break-minutes">
                        {clockStatus?.todayTimecard?.breakMinutes || 0}m
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total Hours Today</span>
                      <span className="text-2xl font-bold tabular-nums" data-testid="text-total-hours">
                        {formatHours(clockStatus?.todayTimecard?.totalHours ?? null)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
