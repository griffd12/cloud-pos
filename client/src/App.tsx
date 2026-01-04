import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { PosProvider } from "@/lib/pos-context";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import PosPage from "@/pages/pos";
import KdsPage from "@/pages/kds";
import AdminLayout from "@/pages/admin/index";

function GlobalWebSocket() {
  usePosWebSocket();
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/pos" component={PosPage} />
      <Route path="/kds" component={KdsPage} />
      <Route path="/admin" component={AdminLayout} />
      <Route path="/admin/:rest*" component={AdminLayout} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="pos-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <PosProvider>
            <GlobalWebSocket />
            <Router />
            <Toaster />
          </PosProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
