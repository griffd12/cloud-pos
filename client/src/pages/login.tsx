import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePosContext } from "@/lib/pos-context";
import { apiRequest } from "@/lib/queryClient";
import type { Employee, Rvc, Property, Timecard } from "@shared/schema";
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
import { Building2, Delete, LogIn, Clock, CheckCircle2, LogOut, XCircle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

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
    currentEmployee,
    currentRvc,
  } = usePosContext();

  const [selectedRvcId, setSelectedRvcId] = useState<string>("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  
  const [showClockModal, setShowClockModal] = useState(false);
  const [clockPin, setClockPin] = useState("");
  const [clockEmployee, setClockEmployee] = useState<Employee | null>(null);
  const [clockStatus, setClockStatus] = useState<ClockStatusResponse | null>(null);
  const [clockError, setClockError] = useState<string | null>(null);

  const { data: rvcs = [], isLoading: rvcsLoading } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const { data: selectedProperty } = useQuery<Property>({
    queryKey: ["/api/rvcs", selectedRvcId, "property"],
    enabled: !!selectedRvcId,
  });

  const loginMutation = useMutation({
    mutationFn: async (pinCode: string) => {
      const response = await apiRequest("POST", "/api/auth/login", {
        pin: pinCode,
        rvcId: selectedRvcId,
      });
      return response.json() as Promise<LoginResponse>;
    },
    onSuccess: async (data) => {
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
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setClockStatus({
          ...statusData,
          isClockedIn: statusData.status === "clocked_in" || statusData.status === "on_break",
        });
      }
    },
    onError: () => {
      setClockError("Invalid PIN");
      setClockPin("");
    },
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);
      const response = await apiRequest("POST", "/api/time-punches/clock-in", {
        employeeId: clockEmployee?.id,
        propertyId: selectedRvc?.propertyId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Clocked In",
        description: `${clockEmployee?.firstName} is now clocked in.`,
      });
      handleCloseClockModal();
    },
    onError: () => {
      setClockError("Failed to clock in. Please try again.");
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      const selectedRvc = rvcs.find((r) => r.id === selectedRvcId);
      const response = await apiRequest("POST", "/api/time-punches/clock-out", {
        employeeId: clockEmployee?.id,
        propertyId: selectedRvc?.propertyId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Clocked Out",
        description: `${clockEmployee?.firstName} is now clocked out.`,
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

  const handleCloseClockModal = () => {
    setShowClockModal(false);
    setClockPin("");
    setClockEmployee(null);
    setClockStatus(null);
    setClockError(null);
  };

  const handleBackToClockPin = () => {
    setClockEmployee(null);
    setClockStatus(null);
    setClockPin("");
    setClockError(null);
  };

  useEffect(() => {
    if (rvcs.length > 0 && !selectedRvcId) {
      setSelectedRvcId(rvcs[0].id);
    }
  }, [rvcs, selectedRvcId]);

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
                  onClick={() => setShowClockModal(true)}
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

          {!clockEmployee ? (
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
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  {clockEmployee.firstName} {clockEmployee.lastName}
                </h3>
                
                {clockStatus?.isClockedIn ? (
                  <div className="mt-3 space-y-2">
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Clocked In
                    </Badge>
                    {clockStatus.clockedInAt && (
                      <p className="text-sm text-muted-foreground">
                        Since {format(new Date(clockStatus.clockedInAt), "h:mm a")}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3">
                    <Badge variant="secondary">
                      <XCircle className="w-3 h-3 mr-1" />
                      Clocked Out
                    </Badge>
                  </div>
                )}
              </div>

              {clockError && (
                <div className="text-center text-destructive text-sm font-medium">
                  {clockError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {clockStatus?.isClockedIn ? (
                  <Button
                    variant="destructive"
                    className="w-full h-12"
                    onClick={() => clockOutMutation.mutate()}
                    disabled={clockOutMutation.isPending}
                    data-testid="button-clock-out"
                  >
                    <LogOut className="w-5 h-5 mr-2" />
                    {clockOutMutation.isPending ? "Clocking Out..." : "Clock Out"}
                  </Button>
                ) : (
                  <Button
                    className="w-full h-12"
                    onClick={() => clockInMutation.mutate()}
                    disabled={clockInMutation.isPending}
                    data-testid="button-clock-in"
                  >
                    <Clock className="w-5 h-5 mr-2" />
                    {clockInMutation.isPending ? "Clocking In..." : "Clock In"}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  onClick={handleBackToClockPin}
                  data-testid="button-clock-back"
                >
                  Different Employee
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
