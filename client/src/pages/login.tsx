import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePosContext } from "@/lib/pos-context";
import { apiRequest } from "@/lib/queryClient";
import type { Employee, Rvc, Property, Timecard, JobCode, Workstation } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Building2, Delete, LogIn, Clock, CheckCircle2, LogOut, XCircle, Monitor } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface WorkstationContext {
  workstation: Workstation;
  property: Property;
  rvcs: Rvc[];
}

interface LoginResponse {
  employee: Employee;
  privileges: string[];
  salariedBypass?: boolean;
  bypassJobCode?: JobCode | null;
}

interface ClockStatusResponse {
  status: "clocked_out" | "clocked_in" | "on_break";
  lastPunch?: { punchType: string; actualTimestamp: string } | null;
  activeBreak?: object | null;
  clockedInAt?: string | null;
  isClockedIn: boolean;
  todayTimecard?: Timecard | null;
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const {
    setCurrentEmployee,
    setCurrentRvc,
    setPrivileges,
    setIsClockedIn,
    setCurrentTimecard,
    setIsSalariedBypass,
    setCurrentJobCode,
    currentEmployee,
    currentRvc,
    workstationId,
    setWorkstationId,
    setCurrentWorkstation,
  } = usePosContext();

  const [selectedRvcId, setSelectedRvcId] = useState<string>("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  
  const [showClockModal, setShowClockModal] = useState(false);
  const [clockPin, setClockPin] = useState("");
  const [clockEmployee, setClockEmployee] = useState<Employee | null>(null);
  const [clockStatus, setClockStatus] = useState<ClockStatusResponse | null>(null);
  const [clockError, setClockError] = useState<string | null>(null);
  const [employeeJobs, setEmployeeJobs] = useState<JobCode[]>([]);
  const [clockStep, setClockStep] = useState<"pin" | "job_select" | "status" | "clock_out_type">("pin");

  // Fetch workstation context (includes property and allowed RVCs) if workstation is set
  const { data: wsContext, isLoading: wsContextLoading, error: wsContextError } = useQuery<WorkstationContext>({
    queryKey: ["/api/workstations", workstationId, "context"],
    enabled: !!workstationId,
  });

  // Fallback to all RVCs only if no workstation is configured (for admin/testing)
  const { data: allRvcs = [], isLoading: allRvcsLoading } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
    enabled: !workstationId,
  });

  // Fetch all workstations for selection when no workstation is set
  const { data: allWorkstations = [], isLoading: workstationsLoading } = useQuery<Workstation[]>({
    queryKey: ["/api/workstations"],
    enabled: !workstationId,
  });

  // Use workstation-scoped RVCs if available, otherwise fall back to all RVCs
  const rvcs = wsContext?.rvcs ?? allRvcs;
  const rvcsLoading = workstationId ? wsContextLoading : allRvcsLoading;
  const selectedProperty = wsContext?.property;

  // Update workstation in context when loaded
  useEffect(() => {
    if (wsContext?.workstation) {
      setCurrentWorkstation(wsContext.workstation);
    }
  }, [wsContext, setCurrentWorkstation]);

  const loginMutation = useMutation({
    mutationFn: async (pinCode: string) => {
      const response = await apiRequest("POST", "/api/auth/login", {
        pin: pinCode,
        rvcId: selectedRvcId,
      });
      return response.json() as Promise<LoginResponse>;
    },
    onSuccess: async (data) => {
      // For salaried bypass, skip clock-in check - they have privileges without clocking in
      if (data.salariedBypass) {
        setCurrentEmployee(data.employee);
        setPrivileges(data.privileges);
        setIsClockedIn(true); // Treat salaried bypass as "always clocked in" for POS access
        setIsSalariedBypass(true);
        setCurrentJobCode(data.bypassJobCode || null);
        const rvc = rvcs.find((r) => r.id === selectedRvcId);
        if (rvc) {
          setCurrentRvc(rvc);
        }
        navigate("/pos");
        return;
      }

      // Normal hourly flow - check clock status
      const statusRes = await fetch(`/api/time-punches/status/${data.employee.id}`, { credentials: "include" });
      let isClockedIn = false;
      let todayTimecard = null;
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        isClockedIn = statusData.status === "clocked_in" || statusData.status === "on_break";
        todayTimecard = statusData.todayTimecard || null;
      }
      
      setCurrentEmployee(data.employee);
      setPrivileges(data.privileges);
      setIsClockedIn(isClockedIn);
      setCurrentTimecard(todayTimecard);
      setIsSalariedBypass(false);
      const rvc = rvcs.find((r) => r.id === selectedRvcId);
      if (rvc) {
        setCurrentRvc(rvc);
      }
      navigate("/pos");
    },
    onError: () => {
      setLoginError("Invalid PIN or employee not found");
      setPin("");
    },
  });

  const clockAuthMutation = useMutation({
    mutationFn: async (pinCode: string) => {
      const response = await apiRequest("POST", "/api/auth/login", {
        pin: pinCode,
        rvcId: selectedRvcId,
      });
      return response.json() as Promise<LoginResponse>;
    },
    onSuccess: async (data) => {
      setClockEmployee(data.employee);
      
      const statusRes = await fetch(`/api/time-punches/status/${data.employee.id}`, { credentials: "include" });
      let statusData: ClockStatusResponse | null = null;
      if (statusRes.ok) {
        const rawStatus = await statusRes.json();
        statusData = {
          ...rawStatus,
          isClockedIn: rawStatus.status === "clocked_in" || rawStatus.status === "on_break",
        };
        setClockStatus(statusData);
      }
      
      const jobsRes = await fetch(`/api/employees/${data.employee.id}/job-codes/details`, { credentials: "include" });
      let jobs: JobCode[] = [];
      if (jobsRes.ok) {
        const jobDetails = await jobsRes.json();
        // Extract jobCode from each assignment to get full job details with name
        jobs = jobDetails.map((detail: { jobCode: JobCode }) => detail.jobCode);
        setEmployeeJobs(jobs);
      }
      
      const isClockedIn = statusData?.status === "clocked_in" || statusData?.status === "on_break";
      
      if (isClockedIn) {
        setClockStep("status");
      } else if (jobs.length > 1) {
        setClockStep("job_select");
      } else {
        clockInMutation.mutate({
          employeeId: data.employee.id,
          jobCodeId: jobs.length === 1 ? jobs[0].id : undefined,
          employeeName: data.employee.firstName,
        });
      }
    },
    onError: () => {
      setClockError("Invalid PIN");
      setClockPin("");
    },
  });

  const refreshClockStatus = async (employeeId: string) => {
    const statusRes = await fetch(`/api/time-punches/status/${employeeId}`, { credentials: "include" });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      setClockStatus({
        ...statusData,
        isClockedIn: statusData.status === "clocked_in" || statusData.status === "on_break",
      });
    }
  };

  const clockInMutation = useMutation({
    mutationFn: async (params: { employeeId: string; jobCodeId?: string; employeeName: string }) => {
      const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);
      const response = await apiRequest("POST", "/api/time-punches/clock-in", {
        employeeId: params.employeeId,
        propertyId: selectedRvc?.propertyId,
        jobCodeId: params.jobCodeId,
      });
      return { result: await response.json(), employeeName: params.employeeName };
    },
    onSuccess: (data) => {
      toast({
        title: "Clocked In",
        description: `${data.employeeName} is now clocked in.`,
      });
      handleCloseClockModal();
    },
    onError: () => {
      setClockError("Failed to clock in. Please try again.");
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async (punchType: "break" | "end_shift") => {
      const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);
      const response = await apiRequest("POST", "/api/time-punches/clock-out", {
        employeeId: clockEmployee?.id,
        propertyId: selectedRvc?.propertyId,
        punchType,
      });
      return response.json();
    },
    onSuccess: (_data, punchType) => {
      toast({
        title: punchType === "break" ? "On Break" : "Clocked Out",
        description: punchType === "break" 
          ? `${clockEmployee?.firstName} is now on break.`
          : `${clockEmployee?.firstName} has ended their shift.`,
      });
      handleCloseClockModal();
    },
    onError: () => {
      setClockError("Failed to clock out. Please try again.");
    },
  });

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setLoginError(null);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin("");
    setLoginError(null);
  };

  const handleSubmit = () => {
    if (pin.length >= 4) {
      loginMutation.mutate(pin);
    }
  };

  const handleClockDigit = (digit: string) => {
    if (clockPin.length < 6) {
      setClockPin((prev) => prev + digit);
      setClockError(null);
    }
  };

  const handleClockDelete = () => {
    setClockPin((prev) => prev.slice(0, -1));
  };

  const handleClockClear = () => {
    setClockPin("");
    setClockError(null);
  };

  const handleClockSubmit = () => {
    if (clockPin.length >= 4) {
      clockAuthMutation.mutate(clockPin);
    }
  };

  const handleOpenClockModal = () => {
    setClockPin("");
    setClockEmployee(null);
    setClockStatus(null);
    setClockError(null);
    setEmployeeJobs([]);
    setClockStep("pin");
    setShowClockModal(true);
  };

  const handleCloseClockModal = () => {
    setShowClockModal(false);
    setClockPin("");
    setClockEmployee(null);
    setClockStatus(null);
    setClockError(null);
    setEmployeeJobs([]);
    setClockStep("pin");
  };

  const handleBackToClockPin = () => {
    setClockEmployee(null);
    setClockStatus(null);
    setClockPin("");
    setClockError(null);
    setEmployeeJobs([]);
    setClockStep("pin");
  };

  // Initialize selectedRvcId from saved currentRvc or default to first RVC
  useEffect(() => {
    if (rvcs.length > 0 && !selectedRvcId) {
      // If there's a saved RVC from previous session, use that
      if (currentRvc && rvcs.find(r => r.id === currentRvc.id)) {
        setSelectedRvcId(currentRvc.id);
      } else {
        // Otherwise default to first RVC
        setSelectedRvcId(rvcs[0].id);
      }
    }
  }, [rvcs, selectedRvcId, currentRvc]);

  useEffect(() => {
    if (currentEmployee && currentRvc) {
      navigate("/pos");
    }
  }, [currentEmployee, currentRvc, navigate]);

  if (currentEmployee && currentRvc) {
    return null;
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);

  // Show workstation selection if no workstation is configured
  if (!workstationId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
              <Monitor className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-xl font-semibold">Select Workstation</CardTitle>
            <CardDescription>
              Choose the POS terminal for this device. This determines which location's registers and settings to use.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {workstationsLoading ? (
              <div className="text-center text-muted-foreground py-4">Loading workstations...</div>
            ) : allWorkstations.length === 0 ? (
              <div className="text-center text-muted-foreground py-4">
                No workstations configured. Please set up workstations in the Admin panel first.
              </div>
            ) : (
              <div className="space-y-2">
                {allWorkstations.map((ws) => (
                  <Button
                    key={ws.id}
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-3"
                    onClick={() => setWorkstationId(ws.id)}
                    data-testid={`button-workstation-${ws.id}`}
                  >
                    <Monitor className="w-5 h-5 text-muted-foreground" />
                    <div className="text-left">
                      <div className="font-medium">{ws.name}</div>
                      <div className="text-xs text-muted-foreground">{ws.deviceType}</div>
                    </div>
                  </Button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center pt-2">
              Tip: You can also set the workstation via URL parameter: ?workstation=ID
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error if workstation context failed to load
  if (wsContextError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-2">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-xl font-semibold">Workstation Not Found</CardTitle>
            <CardDescription>
              The selected workstation "{workstationId}" could not be found or loaded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setWorkstationId(null)}
              data-testid="button-clear-workstation"
            >
              Select Different Workstation
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWorkstationId(null)}
          data-testid="button-change-workstation"
          title="Change Workstation"
        >
          <Monitor className="w-4 h-4 mr-1" />
          {wsContext?.workstation?.name || "Change"}
        </Button>
        <ThemeToggle />
      </div>

      <div className="flex min-h-screen">
        <div className="hidden md:flex flex-1 bg-muted/30 items-center justify-center p-8">
          <div className="max-w-md w-full text-center space-y-6">
            {selectedProperty?.signInLogoUrl ? (
              <img
                src={selectedProperty.signInLogoUrl}
                alt={selectedProperty.name || "Logo"}
                className="max-w-full max-h-64 mx-auto object-contain"
                data-testid="img-property-logo"
              />
            ) : (
              <div className="w-48 h-48 mx-auto bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
                <Building2 className="w-24 h-24 text-muted-foreground/50" />
              </div>
            )}
            <div>
              <h2 className="text-2xl font-semibold text-foreground" data-testid="text-property-name">
                {selectedProperty?.name || selectedRvc?.name || "Welcome"}
              </h2>
              {selectedProperty?.address && (
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">
                  {selectedProperty.address}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 md:max-w-md lg:max-w-lg md:border-l">
          <div className="w-full max-w-sm space-y-6">
            <div className="md:hidden text-center mb-6">
              {selectedProperty?.signInLogoUrl ? (
                <img
                  src={selectedProperty.signInLogoUrl}
                  alt={selectedProperty.name || "Logo"}
                  className="max-w-full max-h-24 mx-auto object-contain"
                  data-testid="img-property-logo-mobile"
                />
              ) : (
                <Building2 className="w-12 h-12 mx-auto text-primary" />
              )}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Select Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedRvcId}
                  onValueChange={setSelectedRvcId}
                  disabled={rvcsLoading}
                >
                  <SelectTrigger data-testid="select-rvc-login">
                    <SelectValue placeholder="Select Revenue Center..." />
                  </SelectTrigger>
                  <SelectContent>
                    {rvcs.map((rvc) => (
                      <SelectItem key={rvc.id} value={rvc.id}>
                        {rvc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {selectedRvcId && (
              <>
                <Card>
                  <CardHeader className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                      <LogIn className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-semibold" data-testid="text-login-title">
                      Employee Sign In
                    </CardTitle>
                    <p className="text-muted-foreground text-sm">Enter your PIN to access POS</p>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex justify-center gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                            i < pin.length
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/30"
                          }`}
                          data-testid={`pin-dot-${i}`}
                        />
                      ))}
                    </div>

                    {loginError && (
                      <div
                        className="text-center text-destructive text-sm font-medium"
                        data-testid="text-login-error"
                      >
                        {loginError}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      {digits.slice(0, 9).map((digit) => (
                        <Button
                          key={digit}
                          variant="secondary"
                          className="h-14 text-xl font-semibold"
                          onClick={() => handleDigit(digit)}
                          disabled={loginMutation.isPending}
                          data-testid={`button-pin-${digit}`}
                        >
                          {digit}
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        className="h-14 text-xs"
                        onClick={handleClear}
                        disabled={loginMutation.isPending}
                        data-testid="button-pin-clear"
                      >
                        Clear
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-14 text-xl font-semibold"
                        onClick={() => handleDigit("0")}
                        disabled={loginMutation.isPending}
                        data-testid="button-pin-0"
                      >
                        0
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-14"
                        onClick={handleDelete}
                        disabled={loginMutation.isPending}
                        data-testid="button-pin-delete"
                      >
                        <Delete className="w-5 h-5" />
                      </Button>
                    </div>

                    <Button
                      className="w-full h-12 text-base font-semibold"
                      onClick={handleSubmit}
                      disabled={pin.length < 4 || loginMutation.isPending}
                      data-testid="button-login-submit"
                    >
                      {loginMutation.isPending ? "Signing in..." : "Sign In"}
                    </Button>
                  </CardContent>
                </Card>

                <Button
                  variant="outline"
                  className="w-full h-12"
                  onClick={handleOpenClockModal}
                  data-testid="button-open-clock"
                >
                  <Clock className="w-5 h-5 mr-2" />
                  Clock In / Out
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showClockModal} onOpenChange={setShowClockModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Time Clock
            </DialogTitle>
            <DialogDescription>
              {format(new Date(), "EEEE, MMMM d, yyyy")}
            </DialogDescription>
          </DialogHeader>

          {clockStep === "pin" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Enter your PIN to clock in or out
              </p>
              
              <div className="flex justify-center gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                      i < clockPin.length
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30"
                    }`}
                    data-testid={`clock-pin-dot-${i}`}
                  />
                ))}
              </div>

              {clockError && (
                <div className="text-center text-destructive text-sm font-medium">
                  {clockError}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {digits.slice(0, 9).map((digit) => (
                  <Button
                    key={digit}
                    variant="secondary"
                    className="h-12 text-lg font-semibold"
                    onClick={() => handleClockDigit(digit)}
                    disabled={clockAuthMutation.isPending}
                    data-testid={`button-clock-pin-${digit}`}
                  >
                    {digit}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="h-12 text-xs"
                  onClick={handleClockClear}
                  disabled={clockAuthMutation.isPending}
                  data-testid="button-clock-pin-clear"
                >
                  Clear
                </Button>
                <Button
                  variant="secondary"
                  className="h-12 text-lg font-semibold"
                  onClick={() => handleClockDigit("0")}
                  disabled={clockAuthMutation.isPending}
                  data-testid="button-clock-pin-0"
                >
                  0
                </Button>
                <Button
                  variant="ghost"
                  className="h-12"
                  onClick={handleClockDelete}
                  disabled={clockAuthMutation.isPending}
                  data-testid="button-clock-pin-delete"
                >
                  <Delete className="w-4 h-4" />
                </Button>
              </div>

              <Button
                className="w-full"
                onClick={handleClockSubmit}
                disabled={clockPin.length < 4 || clockAuthMutation.isPending}
                data-testid="button-clock-submit"
              >
                {clockAuthMutation.isPending ? "Verifying..." : "Continue"}
              </Button>
            </div>
          )}

          {clockStep === "job_select" && clockEmployee && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  {clockEmployee.firstName} {clockEmployee.lastName}
                </h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Select the job you are working today
                </p>
              </div>

              {clockError && (
                <div className="text-center text-destructive text-sm font-medium">
                  {clockError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {employeeJobs.map((job) => (
                  <Button
                    key={job.id}
                    variant="outline"
                    className="w-full h-12 justify-start"
                    onClick={() => clockInMutation.mutate({
                      employeeId: clockEmployee!.id,
                      jobCodeId: job.id,
                      employeeName: clockEmployee!.firstName,
                    })}
                    disabled={clockInMutation.isPending}
                    data-testid={`button-job-${job.id}`}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {job.name}
                  </Button>
                ))}
              </div>

              <Button
                variant="ghost"
                onClick={handleBackToClockPin}
                className="w-full"
                data-testid="button-clock-back"
              >
                Cancel
              </Button>
            </div>
          )}

          {clockStep === "status" && clockEmployee && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  {clockEmployee.firstName} {clockEmployee.lastName}
                </h3>
                
                <div className="mt-3 space-y-2">
                  <Badge variant="default" className="bg-green-500">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Clocked In
                  </Badge>
                  {clockStatus?.clockedInAt && (
                    <p className="text-sm text-muted-foreground">
                      Since {format(new Date(clockStatus.clockedInAt), "h:mm a")}
                    </p>
                  )}
                </div>
              </div>

              {clockError && (
                <div className="text-center text-destructive text-sm font-medium">
                  {clockError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  variant="secondary"
                  className="w-full h-12"
                  onClick={() => setClockStep("clock_out_type")}
                  data-testid="button-clock-out"
                >
                  <LogOut className="w-5 h-5 mr-2" />
                  Clock Out
                </Button>

                <Button
                  variant="ghost"
                  onClick={handleCloseClockModal}
                  data-testid="button-clock-cancel"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {clockStep === "clock_out_type" && clockEmployee && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  {clockEmployee.firstName} {clockEmployee.lastName}
                </h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Are you going on break or ending your shift?
                </p>
              </div>

              {clockError && (
                <div className="text-center text-destructive text-sm font-medium">
                  {clockError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full h-12"
                  onClick={() => clockOutMutation.mutate("break")}
                  disabled={clockOutMutation.isPending}
                  data-testid="button-clock-out-break"
                >
                  Going on Break
                </Button>

                <Button
                  variant="destructive"
                  className="w-full h-12"
                  onClick={() => clockOutMutation.mutate("end_shift")}
                  disabled={clockOutMutation.isPending}
                  data-testid="button-clock-out-end-shift"
                >
                  <LogOut className="w-5 h-5 mr-2" />
                  End Shift
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => setClockStep("status")}
                  data-testid="button-clock-out-back"
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
