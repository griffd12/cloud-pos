import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePosContext } from "@/lib/pos-context";
import { apiRequest } from "@/lib/queryClient";
import type { Employee, Rvc, Property, Shift, Timecard } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Building2, Delete, LogIn, Clock, Play, Calendar, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface LoginResponse {
  employee: Employee;
  privileges: string[];
}

interface ClockStatusResponse {
  status: "clocked_out" | "clocked_in" | "on_break";
  lastPunch?: { punchType: string; actualTimestamp: string } | null;
  activeBreak?: object | null;
  clockedInAt?: string | null;
  isClockedIn: boolean;
  todayTimecard?: Timecard;
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const {
    setCurrentEmployee,
    setCurrentRvc,
    setPrivileges,
    setIsClockedIn,
    setCurrentTimecard,
    currentEmployee,
    currentRvc,
    isClockedIn,
  } = usePosContext();

  const [selectedRvcId, setSelectedRvcId] = useState<string>("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authenticatedEmployee, setAuthenticatedEmployee] = useState<Employee | null>(null);
  const [showClockIn, setShowClockIn] = useState(false);

  const { data: rvcs = [], isLoading: rvcsLoading } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const { data: selectedProperty } = useQuery<Property>({
    queryKey: ["/api/rvcs", selectedRvcId, "property"],
    enabled: !!selectedRvcId,
  });

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: todayShift } = useQuery<Shift | null>({
    queryKey: ["/api/shifts/employee", authenticatedEmployee?.id, today],
    queryFn: async () => {
      if (!authenticatedEmployee?.id) return null;
      const res = await fetch(`/api/shifts?employeeId=${authenticatedEmployee.id}&startDate=${today}&endDate=${today}`, { credentials: "include" });
      if (!res.ok) return null;
      const shifts = await res.json();
      return shifts.length > 0 ? shifts[0] : null;
    },
    enabled: !!authenticatedEmployee,
  });

  const { data: clockStatus, refetch: refetchClockStatus } = useQuery<ClockStatusResponse>({
    queryKey: ["/api/time-punches/status", authenticatedEmployee?.id],
    queryFn: async () => {
      const res = await fetch(`/api/time-punches/status/${authenticatedEmployee?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clock status");
      const data = await res.json();
      return {
        ...data,
        isClockedIn: data.status === "clocked_in" || data.status === "on_break",
      };
    },
    enabled: !!authenticatedEmployee,
  });

  const loginMutation = useMutation({
    mutationFn: async (pinCode: string) => {
      const response = await apiRequest("POST", "/api/auth/login", {
        pin: pinCode,
        rvcId: selectedRvcId,
      });
      return response.json() as Promise<LoginResponse>;
    },
    onSuccess: (data) => {
      setAuthenticatedEmployee(data.employee);
      setPrivileges(data.privileges);
      setShowClockIn(true);
    },
    onError: () => {
      setLoginError("Invalid PIN or employee not found");
      setPin("");
    },
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);
      const response = await apiRequest("POST", "/api/time-punches/clock-in", {
        employeeId: authenticatedEmployee?.id,
        propertyId: selectedRvc?.propertyId,
      });
      return response.json() as Promise<{ timecard: Timecard }>;
    },
    onSuccess: async (data) => {
      const refetchedStatus = await refetchClockStatus();
      const freshTimecard = refetchedStatus.data?.todayTimecard || data.timecard;
      completeLogin(true, freshTimecard);
    },
    onError: () => {
      setLoginError("Failed to clock in. Please try again.");
    },
  });

  const completeLogin = (clockedIn: boolean = false, timecard?: Timecard) => {
    if (authenticatedEmployee) {
      setCurrentEmployee(authenticatedEmployee);
      setIsClockedIn(clockedIn);
      if (timecard) {
        setCurrentTimecard(timecard);
      }
      const rvc = rvcs.find((r) => r.id === selectedRvcId);
      if (rvc) {
        setCurrentRvc(rvc);
      }
      navigate("/pos");
    }
  };

  const handleContinueAlreadyClockedIn = () => {
    if (clockStatus?.isClockedIn) {
      completeLogin(true, clockStatus.todayTimecard);
    }
  };

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

  const handleBackToPin = () => {
    setShowClockIn(false);
    setAuthenticatedEmployee(null);
    setPin("");
  };

  useEffect(() => {
    if (rvcs.length > 0 && !selectedRvcId) {
      setSelectedRvcId(rvcs[0].id);
    }
  }, [rvcs, selectedRvcId]);

  useEffect(() => {
    if (currentEmployee && currentRvc && isClockedIn) {
      navigate("/pos");
    }
  }, [currentEmployee, currentRvc, isClockedIn, navigate]);

  if (currentEmployee && currentRvc && isClockedIn) {
    return null;
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-4 right-4 z-10">
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
                  disabled={rvcsLoading || showClockIn}
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

            {selectedRvcId && !showClockIn && (
              <Card>
                <CardHeader className="text-center space-y-2">
                  <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                    <LogIn className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl font-semibold" data-testid="text-login-title">
                    Employee Sign In
                  </CardTitle>
                  <p className="text-muted-foreground text-sm">Enter your PIN to sign in</p>
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
            )}

            {showClockIn && authenticatedEmployee && (
              <Card>
                <CardHeader className="text-center space-y-2">
                  <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl font-semibold" data-testid="text-clock-in-title">
                    Welcome, {authenticatedEmployee.firstName}
                  </CardTitle>
                  <CardDescription>
                    {format(new Date(), "EEEE, MMMM d, yyyy")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {todayShift && (
                    <div className="bg-muted/50 rounded-md p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Calendar className="w-4 h-4" />
                        Scheduled Shift
                      </div>
                      <div className="text-lg font-semibold" data-testid="text-scheduled-shift">
                        {todayShift.startTime} - {todayShift.endTime}
                      </div>
                    </div>
                  )}

                  {!todayShift && (
                    <div className="bg-muted/50 rounded-md p-4 text-center">
                      <p className="text-sm text-muted-foreground" data-testid="text-no-shift">
                        No scheduled shift for today
                      </p>
                    </div>
                  )}

                  {clockStatus?.isClockedIn ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2">
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Already Clocked In
                        </Badge>
                      </div>
                      {clockStatus.clockedInAt && (
                        <p className="text-center text-sm text-muted-foreground" data-testid="text-clock-in-time">
                          Clocked in at {format(new Date(clockStatus.clockedInAt), "h:mm a")}
                        </p>
                      )}
                      <Button
                        className="w-full h-12 text-base font-semibold"
                        onClick={handleContinueAlreadyClockedIn}
                        data-testid="button-continue-pos"
                      >
                        <Play className="w-5 h-5 mr-2" />
                        Continue to POS
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {loginError && (
                        <div className="text-center text-destructive text-sm font-medium">
                          {loginError}
                        </div>
                      )}
                      <Button
                        className="w-full h-14 text-lg font-semibold"
                        onClick={() => clockInMutation.mutate()}
                        disabled={clockInMutation.isPending}
                        data-testid="button-clock-in"
                      >
                        <Clock className="w-5 h-5 mr-2" />
                        {clockInMutation.isPending ? "Clocking In..." : "Clock In & Start"}
                      </Button>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={handleBackToPin}
                    data-testid="button-back-to-pin"
                  >
                    Back to Sign In
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
