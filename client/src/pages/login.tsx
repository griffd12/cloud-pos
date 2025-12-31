import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePosContext } from "@/lib/pos-context";
import { apiRequest } from "@/lib/queryClient";
import type { Employee, Rvc, Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { Building2, Delete, LogIn } from "lucide-react";

interface LoginResponse {
  employee: Employee;
  privileges: string[];
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const {
    setCurrentEmployee,
    setCurrentRvc,
    setPrivileges,
    currentEmployee,
    currentRvc,
  } = usePosContext();

  const [selectedRvcId, setSelectedRvcId] = useState<string>("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const { data: rvcs = [], isLoading: rvcsLoading } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  // Fetch property details for the selected RVC to get the logo
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
    onSuccess: (data) => {
      setCurrentEmployee(data.employee);
      setPrivileges(data.privileges);
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
        {/* Left side - Logo area */}
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

        {/* Right side - Login keypad */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 md:max-w-md lg:max-w-lg md:border-l">
          <div className="w-full max-w-sm space-y-6">
            {/* Mobile logo - only shows on small screens */}
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

            {/* Location selector */}
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

            {/* PIN entry */}
            {selectedRvcId && (
              <Card>
                <CardHeader className="text-center space-y-2">
                  <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                    <LogIn className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl font-semibold" data-testid="text-login-title">
                    Employee Sign In
                  </CardTitle>
                  <p className="text-muted-foreground text-sm">Enter your PIN to clock in</p>
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
          </div>
        </div>
      </div>
    </div>
  );
}
