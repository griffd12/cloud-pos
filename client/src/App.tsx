import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { PosProvider } from "@/lib/pos-context";
import { DeviceProvider, useDeviceContext, getAutoEnrollRedirect } from "@/lib/device-context";
import { EmcProvider } from "@/lib/emc-context";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import PosPage from "@/pages/pos";
import PizzaBuilderPage from "@/pages/pizza-builder";
import KdsPage from "@/pages/kds";
import DeviceSetupPage from "@/pages/device-setup";
import DeviceTypeSelectPage from "@/pages/device-type-select";
import EmcLoginPage from "@/pages/emc/login";
import EmcSetupPage from "@/pages/emc/setup";
import EmcAdminLayout from "@/pages/emc/admin-layout";

function GlobalWebSocket() {
  usePosWebSocket();
  return null;
}

function DeviceGuardedRoute({ 
  component: Component, 
  allowedTypes,
  ...rest 
}: { 
  component: React.ComponentType; 
  allowedTypes: ("pos" | "kds" | "unconfigured")[];
}) {
  const { deviceType, isConfigured } = useDeviceContext();
  
  if (!isConfigured) {
    if (allowedTypes.includes("unconfigured")) {
      return <Component />;
    }
    return <Redirect to="/setup" />;
  }
  
  if (deviceType && allowedTypes.includes(deviceType)) {
    return <Component />;
  }
  
  if (deviceType === "kds") {
    return <Redirect to="/kds" />;
  }
  
  return <Redirect to="/login" />;
}

function Router() {
  const { deviceType, isConfigured, hasExplicitDeviceType } = useDeviceContext();
  const [location] = useLocation();
  
  // Check for auto-enroll redirect from CAL wizard - handle FIRST before any other routing
  const autoEnrollRedirect = getAutoEnrollRedirect();
  if (autoEnrollRedirect && isConfigured) {
    console.log("[Router] Auto-enroll redirect to:", autoEnrollRedirect);
    return <Redirect to={autoEnrollRedirect} />;
  }
  
  // EMC routes bypass device enrollment completely - accessible from any browser
  if (location.startsWith("/emc")) {
    return (
      <EmcProvider>
        <Switch>
          <Route path="/emc/login" component={EmcLoginPage} />
          <Route path="/emc/setup" component={EmcSetupPage} />
          <Route path="/emc/:rest*" component={EmcAdminLayout} />
          <Route path="/emc" component={EmcAdminLayout} />
        </Switch>
      </EmcProvider>
    );
  }
  
  // Device type selection - show if user hasn't explicitly chosen a device type
  // This is the FIRST screen a new device sees (POS Terminal or KDS Display)
  if (!hasExplicitDeviceType && !deviceType) {
    if (location !== "/device-type" && location !== "/setup") {
      return <Redirect to="/device-type" />;
    }
  }
  
  // Handle KDS devices - they can only access /kds, /device-type, and /setup
  if (hasExplicitDeviceType && deviceType === "kds") {
    if (location !== "/kds" && location !== "/device-type" && location !== "/setup") {
      return <Redirect to="/kds" />;
    }
  }

  return (
    <Switch>
      <Route path="/device-type" component={DeviceTypeSelectPage} />
      <Route path="/setup" component={DeviceSetupPage} />
      <Route path="/kds">
        {() => <DeviceGuardedRoute component={KdsPage} allowedTypes={["pos", "kds"]} />}
      </Route>
      <Route path="/">
        {() => <DeviceGuardedRoute component={LoginPage} allowedTypes={["pos"]} />}
      </Route>
      <Route path="/login">
        {() => <DeviceGuardedRoute component={LoginPage} allowedTypes={["pos"]} />}
      </Route>
      <Route path="/pos">
        {() => <DeviceGuardedRoute component={PosPage} allowedTypes={["pos"]} />}
      </Route>
      <Route path="/pos/pizza-builder/:menuItemId">
        {() => <DeviceGuardedRoute component={PizzaBuilderPage} allowedTypes={["pos"]} />}
      </Route>
      {/* Admin routes are not available on POS/KDS devices - use EMC instead */}
      <Route path="/admin">
        {() => <Redirect to="/login" />}
      </Route>
      <Route path="/admin/:rest*">
        {() => <Redirect to="/login" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="pos-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <DeviceProvider>
            <PosProvider>
              <GlobalWebSocket />
              <Router />
              <Toaster />
            </PosProvider>
          </DeviceProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
