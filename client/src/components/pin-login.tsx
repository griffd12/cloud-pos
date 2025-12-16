import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Delete, LogIn } from "lucide-react";

interface PinLoginProps {
  onLogin: (pin: string) => void;
  isLoading?: boolean;
  error?: string | null;
  title?: string;
  subtitle?: string;
}

export function PinLogin({ 
  onLogin, 
  isLoading = false, 
  error = null,
  title = "Employee Sign In",
  subtitle = "Enter your PIN to continue"
}: PinLoginProps) {
  const [pin, setPin] = useState("");

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      setPin(prev => prev + digit);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin("");
  };

  const handleSubmit = () => {
    if (pin.length >= 4) {
      onLogin(pin);
    }
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <LogIn className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-semibold" data-testid="text-login-title">
            {title}
          </CardTitle>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-colors ${
                  i < pin.length
                    ? "bg-primary border-primary"
                    : "border-muted-foreground/30"
                }`}
                data-testid={`pin-dot-${i}`}
              />
            ))}
          </div>

          {error && (
            <div 
              className="text-center text-destructive text-sm font-medium"
              data-testid="text-login-error"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {digits.slice(0, 9).map((digit) => (
              <Button
                key={digit}
                variant="secondary"
                className="h-16 text-2xl font-semibold"
                onClick={() => handleDigit(digit)}
                disabled={isLoading}
                data-testid={`button-pin-${digit}`}
              >
                {digit}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="h-16 text-sm"
              onClick={handleClear}
              disabled={isLoading}
              data-testid="button-pin-clear"
            >
              Clear
            </Button>
            <Button
              variant="secondary"
              className="h-16 text-2xl font-semibold"
              onClick={() => handleDigit("0")}
              disabled={isLoading}
              data-testid="button-pin-0"
            >
              0
            </Button>
            <Button
              variant="ghost"
              className="h-16"
              onClick={handleDelete}
              disabled={isLoading}
              data-testid="button-pin-delete"
            >
              <Delete className="w-6 h-6" />
            </Button>
          </div>

          <Button
            className="w-full h-14 text-lg font-semibold"
            onClick={handleSubmit}
            disabled={pin.length < 4 || isLoading}
            data-testid="button-login-submit"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
