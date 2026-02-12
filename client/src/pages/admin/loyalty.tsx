import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useEmcFilter } from "@/lib/emc-context";
import { useToast } from "@/hooks/use-toast";
import { DataTable, Column, CustomAction } from "@/components/admin/data-table";
import { EntityForm, FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
import { getScopeColumn, getZoneColumn, getInheritanceColumn } from "@/components/admin/scope-column";
import { useScopeLookup } from "@/hooks/use-scope-lookup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  insertLoyaltyProgramSchema,
  insertLoyaltyMemberSchema,
  insertLoyaltyRewardSchema,
  type LoyaltyProgram,
  type LoyaltyMember,
  type LoyaltyMemberEnrollment,
  type LoyaltyMemberWithEnrollments,
  type LoyaltyTransaction,
  type LoyaltyReward,
  type InsertLoyaltyProgram,
  type InsertLoyaltyMember,
  type InsertLoyaltyReward,
  type Property,
} from "@shared/schema";

// Extended member type from API that includes enrollments
type MemberWithEnrollments = LoyaltyMember & {
  enrollments?: (LoyaltyMemberEnrollment & { program?: LoyaltyProgram })[];
};
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Star, Users, Gift, Plus, Search, Award, TrendingUp, History, Crown, Loader2, Pencil, Trash2 } from "lucide-react";
import type { MenuItem } from "@shared/schema";
import { format } from "date-fns";

export default function LoyaltyPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const { filterParam, filterKeys, selectedEnterpriseId, selectedPropertyId, selectedRvcId, scopePayload } = useEmcFilter();
  const scopeLookup = useScopeLookup();
  const [activeTab, setActiveTab] = useState("programs");
  
  const [programFormOpen, setProgramFormOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);
  const [programFormData, setProgramFormData] = useState({
    name: "",
    propertyId: "",
    programType: "points" as "points" | "visits" | "spend" | "tiered",
    pointsPerDollar: "1",
    visitsForReward: "10",
    minimumPointsRedeem: "100",
    pointsRedemptionValue: "0.01",
    spendThreshold: "100",
    active: true,
  });
  
  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberWithEnrollments | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberWithEnrollments | null>(null);
  const [memberDetailOpen, setMemberDetailOpen] = useState(false);
  const [lookupDialogOpen, setLookupDialogOpen] = useState(false);
  const [lookupEmail, setLookupEmail] = useState("");
  
  const [rewardFormOpen, setRewardFormOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<LoyaltyReward | null>(null);
  
  const [earnPointsOpen, setEarnPointsOpen] = useState(false);
  const [earnPoints, setEarnPoints] = useState("");
  const [earnReason, setEarnReason] = useState("");
  
  const [redeemRewardOpen, setRedeemRewardOpen] = useState(false);
  const [selectedRewardId, setSelectedRewardId] = useState("");
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  const [enrollInProgramOpen, setEnrollInProgramOpen] = useState(false);
  const [enrollProgramId, setEnrollProgramId] = useState("");

  const { data: programs = [], isLoading: programsLoading } = useQuery<LoyaltyProgram[]>({
    queryKey: ["/api/loyalty-programs", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/loyalty-programs${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch loyalty programs");
      return res.json();
    },
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<MemberWithEnrollments[]>({
    queryKey: ["/api/loyalty-members", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/loyalty-members${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch loyalty members");
      return res.json();
    },
  });

  const { data: rewards = [], isLoading: rewardsLoading } = useQuery<LoyaltyReward[]>({
    queryKey: ["/api/loyalty-rewards", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/loyalty-rewards${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch loyalty rewards");
      return res.json();
    },
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/menu-items${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch menu items");
      return res.json();
    },
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/properties${filterParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: memberTransactions = [] } = useQuery<(LoyaltyTransaction & { programName?: string })[]>({
    queryKey: ["/api/loyalty-transactions", selectedMember?.id, filterKeys],
    queryFn: async () => {
      const res = await fetch(`/api/loyalty-transactions/${selectedMember?.id}${filterParam}`, { headers: getAuthHeaders(), credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!selectedMember?.id,
  });

  const programColumns: Column<LoyaltyProgram>[] = [
    { key: "name", header: "Program Name", sortable: true },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => {
        const property = properties.find(p => p.id === value);
        return property?.name || <span className="text-muted-foreground">Not assigned</span>;
      },
    },
    {
      key: "programType",
      header: "Type",
      render: (value) => {
        const labels: Record<string, string> = {
          points: "Points",
          visits: "Visits",
          spend: "Spend",
          tiered: "Tiered",
        };
        return <Badge variant="outline">{labels[value as string] || value}</Badge>;
      },
    },
    {
      key: "id",
      header: "Configuration",
      render: (_, row) => {
        if (row.programType === "points" || row.programType === "tiered") {
          return <span className="text-sm text-muted-foreground">{row.pointsPerDollar} pts/$</span>;
        }
        if (row.programType === "visits") {
          return <span className="text-sm text-muted-foreground">{row.visitsForReward} visits</span>;
        }
        return <span className="text-sm text-muted-foreground">-</span>;
      },
    },
    {
      key: "active",
      header: "Status",
      render: (value) => value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>,
    },
    getScopeColumn(),
    getZoneColumn<LoyaltyProgram>(scopeLookup),
    getInheritanceColumn<LoyaltyProgram>(selectedPropertyId, selectedRvcId),
  ];

  const memberColumns: Column<MemberWithEnrollments>[] = [
    { key: "firstName", header: "First Name", sortable: true },
    { key: "lastName", header: "Last Name", sortable: true },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => {
        const property = properties.find(p => p.id === value);
        return property?.name || <span className="text-muted-foreground">Not assigned</span>;
      },
    },
    { key: "email", header: "Email", sortable: true },
    { key: "phone", header: "Phone" },
    {
      key: "enrollments",
      header: "Programs",
      render: (_, row) => {
        const count = row.enrollments?.length || 0;
        return <Badge variant="outline">{count} program{count !== 1 ? "s" : ""}</Badge>;
      },
    },
    {
      key: "id",
      header: "Total Points",
      render: (_, row) => {
        const totalPoints = row.enrollments?.reduce((sum, e) => sum + (e.currentPoints || 0), 0) || 0;
        return <span className="font-bold tabular-nums">{totalPoints}</span>;
      },
    },
    {
      key: "memberNumber",
      header: "Lifetime Points",
      render: (_, row) => {
        const lifetimeTotal = row.enrollments?.reduce((sum, e) => sum + (e.lifetimePoints || 0), 0) || 0;
        return lifetimeTotal;
      },
    },
  ];

  const rewardColumns: Column<LoyaltyReward>[] = [
    { key: "name", header: "Reward Name", sortable: true },
    {
      key: "propertyId",
      header: "Property",
      render: (value) => {
        const property = properties.find(p => p.id === value);
        return property?.name || <span className="text-muted-foreground">Not assigned</span>;
      },
    },
    {
      key: "programId",
      header: "Program",
      render: (value) => {
        const program = programs.find(p => p.id === value);
        return program ? <Badge variant="outline">{program.name}</Badge> : <span className="text-muted-foreground">-</span>;
      },
    },
    { key: "description", header: "Description" },
    {
      key: "pointsCost",
      header: "Points Required",
      render: (value) => <span className="font-bold tabular-nums">{value}</span>,
      sortable: true,
    },
    {
      key: "autoAwardAtPoints",
      header: "Auto-Award At",
      render: (value) => value ? <span className="font-bold tabular-nums">{value} pts</span> : <span className="text-muted-foreground">-</span>,
    },
    {
      key: "rewardType",
      header: "Type",
      render: (value) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: "active",
      header: "Status",
      render: (value) => value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>,
    },
  ];


  const memberFormFields: FormFieldConfig[] = [
    { name: "firstName", label: "First Name", type: "text", required: true },
    { name: "lastName", label: "Last Name", type: "text", required: true },
    { name: "email", label: "Email", type: "text", required: true },
    { name: "phone", label: "Phone", type: "text" },
    { name: "birthDate", label: "Birth Date", type: "text", placeholder: "YYYY-MM-DD" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const rewardFormFields: FormFieldConfig[] = [
    {
      name: "programId",
      label: "Loyalty Program",
      type: "select",
      options: programs.map(p => ({ 
        value: p.id, 
        label: `${p.name} (${properties.find(prop => prop.id === p.propertyId)?.name || 'No property'})` 
      })),
      required: true,
      description: "Which program this reward belongs to (property is inherited from program)",
    },
    { name: "name", label: "Reward Name", type: "text", placeholder: "Free Appetizer", required: true },
    { name: "description", label: "Description", type: "textarea", placeholder: "Redeem for any appetizer" },
    {
      name: "rewardType",
      label: "Reward Type",
      type: "select",
      options: [
        { value: "discount", label: "Discount - Apply $ or % off" },
        { value: "free_item", label: "Free Item - Award a specific menu item" },
        { value: "gift_card", label: "Gift Card - Issue a gift card amount" },
        { value: "points_multiplier", label: "Points Multiplier - Bonus points on next visit" },
      ],
      required: true,
      defaultValue: "discount",
      description: "How the reward will be applied",
    },
    { name: "discountAmount", label: "Discount Amount ($)", type: "decimal", placeholder: "5.00", description: "For Discount type: fixed dollar amount off" },
    { name: "discountPercent", label: "Discount Percent (%)", type: "decimal", placeholder: "10", description: "For Discount type: percentage off" },
    {
      name: "freeMenuItemId",
      label: "Free Menu Item",
      type: "select",
      options: menuItems.map(m => ({ value: m.id, label: `${m.name} ($${m.price})` })),
      description: "For Free Item type: select the specific item to award",
    },
    { name: "giftCardAmount", label: "Gift Card Amount ($)", type: "decimal", placeholder: "10.00", description: "For Gift Card type: the value of the gift card issued" },
    { name: "pointsCost", label: "Points to Redeem", type: "number", placeholder: "100", description: "Points required for manual redemption at POS" },
    { name: "autoAwardAtPoints", label: "Auto-Award at Points", type: "number", placeholder: "500", description: "Automatically award when member reaches this many lifetime points (leave blank for manual only)" },
    { name: "autoAwardOnce", label: "Auto-Award Once Only", type: "switch", defaultValue: true, description: "Only auto-award this reward once per member" },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const programMutation = useMutation({
    mutationFn: async (data: InsertLoyaltyProgram) => {
      if (editingProgram) {
        const response = await apiRequest("PUT", `/api/loyalty-programs/${editingProgram.id}`, data);
        return response.json();
      }
      const response = await apiRequest("POST", "/api/loyalty-programs", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-programs", filterKeys] });
      setProgramFormOpen(false);
      setEditingProgram(null);
      toast({ title: editingProgram ? "Program updated" : "Program created" });
    },
    onError: () => {
      toast({ title: "Failed to save program", variant: "destructive" });
    },
  });

  const memberMutation = useMutation({
    mutationFn: async (data: InsertLoyaltyMember) => {
      const enrichedData = { ...data, ...scopePayload };
      if (editingMember) {
        const response = await apiRequest("PUT", `/api/loyalty-members/${editingMember.id}`, enrichedData);
        return response.json();
      }
      const response = await apiRequest("POST", "/api/loyalty-members", enrichedData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members", filterKeys] });
      setMemberFormOpen(false);
      setEditingMember(null);
      toast({ title: editingMember ? "Member updated" : "Member enrolled" });
    },
    onError: () => {
      toast({ title: "Failed to save member", variant: "destructive" });
    },
  });

  const rewardMutation = useMutation({
    mutationFn: async (data: InsertLoyaltyReward) => {
      // Auto-set propertyId from the selected program
      const selectedProgram = programs.find(p => p.id === data.programId);
      const enrichedData = {
        ...data,
        propertyId: selectedProgram?.propertyId || null,
      };
      if (editingReward) {
        const response = await apiRequest("PUT", `/api/loyalty-rewards/${editingReward.id}`, enrichedData);
        return response.json();
      }
      const response = await apiRequest("POST", "/api/loyalty-rewards", enrichedData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-rewards", filterKeys] });
      setRewardFormOpen(false);
      setEditingReward(null);
      toast({ title: editingReward ? "Reward updated" : "Reward created" });
    },
    onError: () => {
      toast({ title: "Failed to save reward", variant: "destructive" });
    },
  });

  const deleteRewardMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      const response = await apiRequest("DELETE", `/api/loyalty-rewards/${rewardId}`);
      if (response.status === 204) return { success: true };
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-rewards", filterKeys] });
      toast({ title: "Reward deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete reward", variant: "destructive" });
    },
  });

  const earnMutation = useMutation({
    mutationFn: async ({ memberId, points, reason, enrollmentId }: { memberId: string; points: number; reason: string; enrollmentId?: string }) => {
      const response = await apiRequest("POST", `/api/loyalty-members/${memberId}/earn`, { points, reason, enrollmentId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-transactions", selectedMember?.id, filterKeys] });
      setEarnPointsOpen(false);
      setEarnPoints("");
      setEarnReason("");
      setSelectedEnrollmentId("");
      toast({ title: "Points added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add points", variant: "destructive" });
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async ({ memberId, rewardId, enrollmentId, points }: { memberId: string; rewardId: string; enrollmentId: string; points: number }) => {
      const response = await apiRequest("POST", `/api/loyalty-members/${memberId}/redeem`, { rewardId, enrollmentId, points });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members", filterKeys] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-transactions", selectedMember?.id, filterKeys] });
      setRedeemRewardOpen(false);
      setSelectedRewardId("");
      setSelectedEnrollmentId("");
      toast({ title: "Reward redeemed successfully" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to redeem reward", variant: "destructive" });
    },
  });

  const enrollInProgramMutation = useMutation({
    mutationFn: async ({ memberId, programId }: { memberId: string; programId: string }) => {
      const response = await apiRequest("POST", `/api/loyalty-members/${memberId}/enrollments`, { programId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members", filterKeys] });
      setEnrollInProgramOpen(false);
      setEnrollProgramId("");
      toast({ title: "Enrolled in program successfully" });
      // Refresh selected member data
      if (selectedMember) {
        const updatedMember = members.find(m => m.id === selectedMember.id);
        if (updatedMember) setSelectedMember(updatedMember);
      }
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to enroll in program", variant: "destructive" });
    },
  });

  const lookupMutation = useMutation({
    mutationFn: async (email: string) => {
      const member = members.find(m => m.email?.toLowerCase() === email.toLowerCase());
      if (!member) throw new Error("Member not found");
      return member;
    },
    onSuccess: (data) => {
      setSelectedMember(data);
      setLookupDialogOpen(false);
      setMemberDetailOpen(true);
      setLookupEmail("");
    },
    onError: () => {
      toast({ title: "Member not found", variant: "destructive" });
    },
  });

  const handleViewMember = (member: MemberWithEnrollments) => {
    setSelectedMember(member);
    setMemberDetailOpen(true);
  };

  const memberActions: CustomAction<MemberWithEnrollments>[] = [
    { label: "View Details", icon: History, onClick: handleViewMember },
  ];

  const totalMembers = members.length;
  const totalPoints = members.reduce((sum, m) => {
    const memberPoints = m.enrollments?.reduce((eSum, e) => eSum + (e.currentPoints || 0), 0) || 0;
    return sum + memberPoints;
  }, 0);
  const activePrograms = programs.filter(p => p.active).length;

  // Get available rewards based on selected member's enrollments
  const availableRewards = selectedMember?.enrollments?.flatMap(enrollment => {
    return rewards.filter(r => 
      r.active && 
      r.programId === enrollment.programId && 
      (enrollment.currentPoints || 0) >= (r.pointsCost || 0)
    );
  }) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-loyalty-title">Loyalty Program</h1>
          <p className="text-muted-foreground">Manage loyalty programs, members, and rewards</p>
        </div>
        <Button variant="outline" onClick={() => setLookupDialogOpen(true)} data-testid="button-lookup-member">
          <Search className="w-4 h-4 mr-2" />
          Lookup Member
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Programs</CardTitle>
            <Star className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-active-programs">{activePrograms}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Members</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-total-members">{totalMembers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Points</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-total-points">{totalPoints.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Available Rewards</CardTitle>
            <Gift className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-total-rewards">{rewards.filter(r => r.active).length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="programs">Programs</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="mt-4">
          <DataTable
            data={programs}
            columns={programColumns}
            onAdd={() => { 
              setEditingProgram(null); 
              setProgramFormData({
                name: "",
                propertyId: "",
                programType: "points",
                pointsPerDollar: "1",
                visitsForReward: "10",
                minimumPointsRedeem: "100",
                pointsRedemptionValue: "0.01",
                spendThreshold: "100",
                active: true,
              });
              setProgramFormOpen(true); 
            }}
            onEdit={(item) => { 
              setEditingProgram(item); 
              setProgramFormData({
                name: item.name || "",
                propertyId: item.propertyId || "",
                programType: (item.programType as "points" | "visits" | "spend" | "tiered") || "points",
                pointsPerDollar: item.pointsPerDollar || "1",
                visitsForReward: String(item.visitsForReward || 10),
                minimumPointsRedeem: String(item.minimumPointsRedeem || 100),
                pointsRedemptionValue: item.pointsRedemptionValue || "0.01",
                spendThreshold: "100",
                active: item.active ?? true,
              });
              setProgramFormOpen(true); 
            }}
            isLoading={programsLoading}
            searchPlaceholder="Search programs..."
            emptyMessage="No loyalty programs created yet"
          />
        </TabsContent>

        <TabsContent value="rewards" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">Rewards grouped by program</p>
            <Button onClick={() => { setEditingReward(null); setRewardFormOpen(true); }} data-testid="button-add-reward">
              <Plus className="w-4 h-4 mr-2" />
              Add Reward
            </Button>
          </div>
          {rewardsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : programs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Create a loyalty program first to add rewards
              </CardContent>
            </Card>
          ) : (
            <Accordion type="multiple" defaultValue={programs.map(p => p.id)} className="space-y-2">
              {programs.map(program => {
                const programRewards = rewards.filter(r => r.programId === program.id);
                return (
                  <AccordionItem key={program.id} value={program.id} className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-program-${program.id}`}>
                      <div className="flex items-center gap-3">
                        <Gift className="w-4 h-4" />
                        <span className="font-medium">{program.name}</span>
                        <Badge variant={program.active ? "default" : "secondary"}>
                          {programRewards.length} reward{programRewards.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      {programRewards.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No rewards for this program yet</p>
                      ) : (
                        <div className="space-y-2">
                          {programRewards.map(reward => {
                            const rewardTypeLabels: Record<string, string> = {
                              discount: "Discount",
                              free_item: "Free Item",
                              gift_card: "Gift Card",
                              points_multiplier: "Points Multiplier",
                            };
                            const linkedMenuItem = menuItems.find(m => m.id === reward.freeMenuItemId);
                            return (
                              <div 
                                key={reward.id} 
                                className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                                data-testid={`row-reward-${reward.id}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium">{reward.name}</p>
                                  <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                                    <span>{rewardTypeLabels[reward.rewardType || "discount"] || reward.rewardType}</span>
                                    {reward.discountAmount && <span>- ${reward.discountAmount} off</span>}
                                    {reward.discountPercent && <span>- {reward.discountPercent}% off</span>}
                                    {linkedMenuItem && <span>- {linkedMenuItem.name}</span>}
                                    {reward.giftCardAmount && <span>- ${reward.giftCardAmount} card</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{reward.pointsCost || 0} pts</Badge>
                                  {reward.autoAwardAtPoints && (
                                    <Badge variant="secondary" className="text-xs">Auto @ {reward.autoAwardAtPoints}</Badge>
                                  )}
                                  <Badge variant={reward.active ? "default" : "secondary"}>
                                    {reward.active ? "Active" : "Inactive"}
                                  </Badge>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => { setEditingReward(reward); setRewardFormOpen(true); }}
                                    data-testid={`button-edit-reward-${reward.id}`}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`Delete reward "${reward.name}"?`)) {
                                        deleteRewardMutation.mutate(reward.id);
                                      }
                                    }}
                                    data-testid={`button-delete-reward-${reward.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <DataTable
            data={members}
            columns={memberColumns}
            onAdd={() => { setEditingMember(null); setMemberFormOpen(true); }}
            onEdit={(item) => { setEditingMember(item); setMemberFormOpen(true); }}
            customActions={memberActions}
            isLoading={membersLoading}
            searchPlaceholder="Search members..."
            emptyMessage="No members enrolled yet"
          />
        </TabsContent>
      </Tabs>

      <Dialog open={programFormOpen} onOpenChange={(open) => { if (!open) { setProgramFormOpen(false); setEditingProgram(null); }}}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingProgram ? "Edit Program" : "Create Loyalty Program"}</DialogTitle>
            <DialogDescription>Configure your loyalty program settings</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="space-y-2">
              <Label htmlFor="prog-name">Program Name</Label>
              <Input
                id="prog-name"
                value={programFormData.name}
                onChange={(e) => setProgramFormData({ ...programFormData, name: e.target.value })}
                placeholder="Rewards Program"
                data-testid="input-program-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Program Type</Label>
              <Select
                value={programFormData.programType}
                onValueChange={(value: "points" | "visits" | "spend" | "tiered") => 
                  setProgramFormData({ ...programFormData, programType: value })
                }
              >
                <SelectTrigger data-testid="select-program-type">
                  <SelectValue placeholder="Select program type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="points">Points Based - Earn points per dollar spent</SelectItem>
                  <SelectItem value="visits">Visits Based - Reward after X visits</SelectItem>
                  <SelectItem value="spend">Spend Based - Reward after spending $X</SelectItem>
                  <SelectItem value="tiered">Tiered Rewards - Multiple reward levels</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {programFormData.programType === "points" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium text-sm">Points Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="points-per-dollar">Points per Dollar</Label>
                    <Input
                      id="points-per-dollar"
                      type="number"
                      step="0.5"
                      value={programFormData.pointsPerDollar}
                      onChange={(e) => setProgramFormData({ ...programFormData, pointsPerDollar: e.target.value })}
                      placeholder="1"
                      data-testid="input-points-per-dollar"
                    />
                    <p className="text-xs text-muted-foreground">Points earned for each $1 spent</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="min-redeem">Minimum Points to Redeem</Label>
                    <Input
                      id="min-redeem"
                      type="number"
                      value={programFormData.minimumPointsRedeem}
                      onChange={(e) => setProgramFormData({ ...programFormData, minimumPointsRedeem: e.target.value })}
                      placeholder="100"
                      data-testid="input-min-redeem"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="point-value">Point Redemption Value ($)</Label>
                  <Input
                    id="point-value"
                    type="number"
                    step="0.01"
                    value={programFormData.pointsRedemptionValue}
                    onChange={(e) => setProgramFormData({ ...programFormData, pointsRedemptionValue: e.target.value })}
                    placeholder="0.01"
                    data-testid="input-point-value"
                  />
                  <p className="text-xs text-muted-foreground">Dollar value per point when redeeming (e.g., 0.01 = 1 cent per point)</p>
                </div>
              </div>
            )}
            
            {programFormData.programType === "visits" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium text-sm">Visits Configuration</h4>
                <div className="space-y-2">
                  <Label htmlFor="visits-for-reward">Visits Required for Reward</Label>
                  <Input
                    id="visits-for-reward"
                    type="number"
                    value={programFormData.visitsForReward}
                    onChange={(e) => setProgramFormData({ ...programFormData, visitsForReward: e.target.value })}
                    placeholder="10"
                    data-testid="input-visits-for-reward"
                  />
                  <p className="text-xs text-muted-foreground">Number of visits before earning a reward (e.g., "Buy 10, Get 1 Free")</p>
                </div>
              </div>
            )}
            
            {programFormData.programType === "spend" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium text-sm">Spend Configuration</h4>
                <div className="space-y-2">
                  <Label htmlFor="spend-threshold">Spend Threshold ($)</Label>
                  <Input
                    id="spend-threshold"
                    type="number"
                    step="10"
                    value={programFormData.spendThreshold}
                    onChange={(e) => setProgramFormData({ ...programFormData, spendThreshold: e.target.value })}
                    placeholder="100"
                    data-testid="input-spend-threshold"
                  />
                  <p className="text-xs text-muted-foreground">Total amount customer must spend to earn a reward</p>
                </div>
              </div>
            )}
            
            {programFormData.programType === "tiered" && (
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium text-sm">Tiered Configuration</h4>
                <p className="text-sm text-muted-foreground">
                  Tiered programs reward customers based on their total spend or points. 
                  Configure tiers (Bronze, Silver, Gold) with different point multipliers and benefits.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tier-points-per-dollar">Base Points per Dollar</Label>
                    <Input
                      id="tier-points-per-dollar"
                      type="number"
                      step="0.5"
                      value={programFormData.pointsPerDollar}
                      onChange={(e) => setProgramFormData({ ...programFormData, pointsPerDollar: e.target.value })}
                      placeholder="1"
                      data-testid="input-tier-points-per-dollar"
                    />
                    <p className="text-xs text-muted-foreground">Base points (higher tiers get multipliers)</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tier-min-redeem">Minimum Points to Redeem</Label>
                    <Input
                      id="tier-min-redeem"
                      type="number"
                      value={programFormData.minimumPointsRedeem}
                      onChange={(e) => setProgramFormData({ ...programFormData, minimumPointsRedeem: e.target.value })}
                      placeholder="100"
                      data-testid="input-tier-min-redeem"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
            <Button variant="outline" onClick={() => { setProgramFormOpen(false); setEditingProgram(null); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const data: any = {
                  name: programFormData.name,
                  ...scopePayload,
                  programType: programFormData.programType,
                  active: programFormData.active,
                };
                if (programFormData.programType === "points" || programFormData.programType === "tiered") {
                  data.pointsPerDollar = programFormData.pointsPerDollar;
                  data.minimumPointsRedeem = parseInt(programFormData.minimumPointsRedeem) || 100;
                  data.pointsRedemptionValue = programFormData.pointsRedemptionValue;
                }
                if (programFormData.programType === "visits") {
                  data.visitsForReward = parseInt(programFormData.visitsForReward) || 10;
                }
                programMutation.mutate(data);
              }}
              disabled={!programFormData.name || programMutation.isPending}
              data-testid="button-save-program"
            >
              {editingProgram ? "Update Program" : "Create Program"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EntityForm
        open={memberFormOpen}
        onClose={() => { setMemberFormOpen(false); setEditingMember(null); }}
        onSubmit={(data) => memberMutation.mutate(data)}
        schema={insertLoyaltyMemberSchema}
        fields={memberFormFields}
        title={editingMember ? "Edit Member" : "Enroll New Member"}
        initialData={editingMember || undefined}
        isLoading={memberMutation.isPending}
      />

      <EntityForm
        open={rewardFormOpen}
        onClose={() => { setRewardFormOpen(false); setEditingReward(null); }}
        onSubmit={(data) => rewardMutation.mutate(data)}
        schema={insertLoyaltyRewardSchema}
        fields={rewardFormFields}
        title={editingReward ? "Edit Reward" : "Create Reward"}
        initialData={editingReward || undefined}
        isLoading={rewardMutation.isPending}
      />

      <Dialog open={lookupDialogOpen} onOpenChange={setLookupDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Lookup Loyalty Member</DialogTitle>
            <DialogDescription>Enter email to find member</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
                placeholder="member@example.com"
                data-testid="input-lookup-email"
              />
            </div>
          </div>
          <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
            <Button variant="outline" onClick={() => setLookupDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => lookupMutation.mutate(lookupEmail)}
              disabled={!lookupEmail || lookupMutation.isPending}
              data-testid="button-lookup-member-submit"
            >
              <Search className="w-4 h-4 mr-2" />
              Lookup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberDetailOpen} onOpenChange={setMemberDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Member Details</DialogTitle>
            <DialogDescription>
              {selectedMember?.firstName} {selectedMember?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {selectedMember && (
            <Tabs defaultValue="info" className="mt-4">
              <TabsList>
                <TabsTrigger value="info">Member Info</TabsTrigger>
                <TabsTrigger value="history">Points History</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="space-y-4">
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Member Number</p>
                    <p className="text-lg font-medium" data-testid="text-member-number">{selectedMember.memberNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="text-lg font-medium">{selectedMember.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="text-lg font-medium">{selectedMember.phone || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Birth Date</p>
                    <p className="text-lg font-medium">{selectedMember.birthDate || "-"}</p>
                  </div>
                </div>

                {/* Program Enrollments */}
                <div className="space-y-3">
                  <h4 className="font-medium">Program Enrollments</h4>
                  {selectedMember.enrollments && selectedMember.enrollments.length > 0 ? (
                    <div className="space-y-2">
                      {selectedMember.enrollments.map((enrollment) => (
                        <div key={enrollment.id} className="p-3 border rounded-md space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {enrollment.program?.name || "Unknown Program"}
                            </span>
                            <Badge variant={enrollment.status === "active" ? "default" : "secondary"}>
                              {enrollment.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Points:</span>
                              <span className="ml-1 font-bold" data-testid={`text-enrollment-points-${enrollment.id}`}>
                                {(enrollment.currentPoints || 0).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Visits:</span>
                              <span className="ml-1 font-medium">{enrollment.visitCount || 0}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tier:</span>
                              <span className="ml-1 font-medium capitalize">{enrollment.currentTier || "Standard"}</span>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Lifetime: {(enrollment.lifetimePoints || 0).toLocaleString()} pts / ${parseFloat(enrollment.lifetimeSpend || "0").toFixed(2)} spent
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No program enrollments yet</p>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => setEarnPointsOpen(true)} data-testid="button-add-points">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Points
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setRedeemRewardOpen(true)}
                    disabled={availableRewards.length === 0}
                    data-testid="button-redeem-reward"
                  >
                    <Award className="w-4 h-4 mr-2" />
                    Redeem Reward ({availableRewards.length} available)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEnrollInProgramOpen(true)}
                    data-testid="button-enroll-in-program"
                  >
                    <Star className="w-4 h-4 mr-2" />
                    Enroll in Program
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="history">
                <div className="max-h-64 overflow-y-auto">
                  {memberTransactions.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No transactions yet</p>
                  ) : (
                    <div className="space-y-2">
                      {memberTransactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-3 border rounded-md">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium capitalize">{tx.transactionType}</p>
                              {tx.programName && (
                                <Badge variant="outline" className="text-xs">{tx.programName}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{tx.reason}</p>
                            <p className="text-xs text-muted-foreground">
                              {tx.createdAt && format(new Date(tx.createdAt), "MMM d, yyyy h:mm a")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold ${tx.transactionType === "redeem" ? "text-red-600" : "text-green-600"}`}>
                              {tx.transactionType === "redeem" ? "-" : "+"}{tx.points} pts
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={earnPointsOpen} onOpenChange={(open) => { setEarnPointsOpen(open); if (!open) setSelectedEnrollmentId(""); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Points</DialogTitle>
            <DialogDescription>Add points to {selectedMember?.firstName}'s account</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {selectedMember?.enrollments && selectedMember.enrollments.length > 1 && (
              <div className="space-y-2">
                <Label>Target Program (optional)</Label>
                <Select value={selectedEnrollmentId} onValueChange={setSelectedEnrollmentId}>
                  <SelectTrigger data-testid="select-earn-enrollment">
                    <SelectValue placeholder="All enrolled programs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All enrolled programs</SelectItem>
                    {selectedMember.enrollments.map((enrollment) => (
                      <SelectItem key={enrollment.id} value={enrollment.id}>
                        {enrollment.program?.name || "Unknown"} ({enrollment.currentPoints || 0} pts)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Leave blank to add points to all active enrollments</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="earnPoints">Points</Label>
                <Input
                  id="earnPoints"
                  type="number"
                  min="1"
                  value={earnPoints}
                  onChange={(e) => setEarnPoints(e.target.value)}
                  placeholder="100"
                  data-testid="input-earn-points"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="earnReason">Reason</Label>
                <Input
                  id="earnReason"
                  value={earnReason}
                  onChange={(e) => setEarnReason(e.target.value)}
                  placeholder="Purchase, bonus, promotion..."
                  data-testid="input-earn-reason"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
            <Button variant="outline" onClick={() => setEarnPointsOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedMember && earnMutation.mutate({
                memberId: selectedMember.id,
                points: parseInt(earnPoints),
                reason: earnReason,
                enrollmentId: selectedEnrollmentId || undefined,
              })}
              disabled={!earnPoints || parseInt(earnPoints) <= 0 || earnMutation.isPending}
              data-testid="button-earn-submit"
            >
              Add {earnPoints || 0} Points
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={redeemRewardOpen} onOpenChange={(open) => { setRedeemRewardOpen(open); if (!open) { setSelectedRewardId(""); setSelectedEnrollmentId(""); }}}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Redeem Reward</DialogTitle>
            <DialogDescription>
              Select which program to redeem from
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Select Program</Label>
                <Select value={selectedEnrollmentId} onValueChange={(val) => { setSelectedEnrollmentId(val); setSelectedRewardId(""); }}>
                  <SelectTrigger data-testid="select-redeem-enrollment">
                    <SelectValue placeholder="Choose a program" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedMember?.enrollments?.filter(e => (e.currentPoints || 0) > 0).map((enrollment) => (
                      <SelectItem key={enrollment.id} value={enrollment.id}>
                        {enrollment.program?.name || "Unknown"} ({enrollment.currentPoints || 0} pts available)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedEnrollmentId && (
                <div className="space-y-2">
                  <Label>Select Reward</Label>
                  <Select value={selectedRewardId} onValueChange={setSelectedRewardId}>
                    <SelectTrigger data-testid="select-reward">
                      <SelectValue placeholder="Choose a reward" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const enrollment = selectedMember?.enrollments?.find(e => e.id === selectedEnrollmentId);
                        const programRewards = rewards.filter(r => 
                          r.active && 
                          r.programId === enrollment?.programId && 
                          (enrollment?.currentPoints || 0) >= (r.pointsCost || 0)
                        );
                        return programRewards.map((reward) => (
                          <SelectItem key={reward.id} value={reward.id}>
                            {reward.name} ({reward.pointsCost} pts)
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
            <Button variant="outline" onClick={() => setRedeemRewardOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const reward = rewards.find(r => r.id === selectedRewardId);
                if (selectedMember && reward) {
                  redeemMutation.mutate({
                    memberId: selectedMember.id,
                    rewardId: selectedRewardId,
                    enrollmentId: selectedEnrollmentId,
                    points: reward.pointsCost || 0,
                  });
                }
              }}
              disabled={!selectedRewardId || !selectedEnrollmentId || redeemMutation.isPending}
              data-testid="button-redeem-reward-submit"
            >
              Redeem Reward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={enrollInProgramOpen} onOpenChange={(open) => { setEnrollInProgramOpen(open); if (!open) setEnrollProgramId(""); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Enroll in Program</DialogTitle>
            <DialogDescription>
              Select a loyalty program to enroll {selectedMember?.firstName} in
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="space-y-2">
              <Label>Select Program</Label>
              <Select value={enrollProgramId} onValueChange={setEnrollProgramId}>
                <SelectTrigger data-testid="select-enroll-program">
                  <SelectValue placeholder="Choose a program" />
                </SelectTrigger>
                <SelectContent>
                  {programs
                    .filter(p => p.active && !selectedMember?.enrollments?.some(e => e.programId === p.id))
                    .map((program) => (
                      <SelectItem key={program.id} value={program.id}>
                        {program.name} ({program.programType})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {programs.filter(p => p.active && !selectedMember?.enrollments?.some(e => e.programId === p.id)).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                This member is already enrolled in all active programs
              </p>
            )}
          </div>
          <DialogFooter className="pt-4 border-t mt-4 flex-shrink-0">
            <Button variant="outline" onClick={() => setEnrollInProgramOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedMember && enrollProgramId) {
                  enrollInProgramMutation.mutate({
                    memberId: selectedMember.id,
                    programId: enrollProgramId,
                  });
                }
              }}
              disabled={!enrollProgramId || enrollInProgramMutation.isPending}
              data-testid="button-enroll-program-submit"
            >
              Enroll in Program
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
