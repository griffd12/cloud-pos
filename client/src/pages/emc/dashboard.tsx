import { useLocation } from "wouter";
import { useEffect } from "react";
import { useEmc } from "@/lib/emc-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  Store, 
  Users, 
  Monitor, 
  UtensilsCrossed,
  Settings,
  Shield,
  LogOut
} from "lucide-react";
import { Link } from "wouter";

export default function EmcDashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout, isLoading } = useEmc();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/emc/login");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate("/emc/login");
  };

  const menuSections = [
    {
      title: "Organization",
      items: [
        { label: "Enterprises", icon: Building2, href: "/emc/enterprises", description: "Manage enterprise organizations" },
        { label: "Properties", icon: Store, href: "/emc/properties", description: "Configure property locations" },
        { label: "Revenue Centers", icon: UtensilsCrossed, href: "/emc/revenue-centers", description: "Set up revenue centers" },
      ]
    },
    {
      title: "Devices & Access",
      items: [
        { label: "Registered Devices", icon: Monitor, href: "/emc/devices", description: "Enroll and manage POS/KDS devices" },
        { label: "EMC Users", icon: Users, href: "/emc/users", description: "Manage EMC administrator accounts" },
      ]
    },
    {
      title: "Configuration",
      items: [
        { label: "Roles & Privileges", icon: Shield, href: "/emc/roles", description: "Configure employee roles and permissions" },
        { label: "System Settings", icon: Settings, href: "/emc/settings", description: "Global system configuration" },
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Enterprise Management Console</h1>
              <p className="text-sm text-muted-foreground">Cloud POS Administration</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{user?.displayName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-2">Welcome, {user?.displayName?.split(' ')[0]}</h2>
          <p className="text-muted-foreground">
            Configure your enterprise POS system from this central management console.
          </p>
        </div>

        <div className="space-y-8">
          {menuSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-lg font-medium mb-4 text-muted-foreground">{section.title}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.items.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Card className="hover-elevate cursor-pointer h-full">
                      <CardHeader className="flex flex-row items-center gap-4 pb-2">
                        <div className="p-2 rounded-md bg-primary/10">
                          <item.icon className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-base">{item.label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <CardDescription>{item.description}</CardDescription>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
