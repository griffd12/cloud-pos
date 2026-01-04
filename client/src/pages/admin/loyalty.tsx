import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DataTable, Column, CustomAction } from "@/components/admin/data-table";
import { EntityForm, FormFieldConfig } from "@/components/admin/entity-form";
import { Badge } from "@/components/ui/badge";
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
  type LoyaltyTransaction,
  type LoyaltyReward,
  type InsertLoyaltyProgram,
  type InsertLoyaltyMember,
  type InsertLoyaltyReward,
} from "@shared/schema";
import { Star, Users, Gift, Plus, Search, Award, TrendingUp, History, Crown } from "lucide-react";
import { format } from "date-fns";

export default function LoyaltyPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("programs");
  
  const [programFormOpen, setProgramFormOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);
  
  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<LoyaltyMember | null>(null);
  const [selectedMember, setSelectedMember] = useState<LoyaltyMember | null>(null);
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

  const { data: programs = [], isLoading: programsLoading } = useQuery<LoyaltyProgram[]>({
    queryKey: ["/api/loyalty-programs"],
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<LoyaltyMember[]>({
    queryKey: ["/api/loyalty-members"],
  });

  const { data: rewards = [], isLoading: rewardsLoading } = useQuery<LoyaltyReward[]>({
    queryKey: ["/api/loyalty-rewards"],
  });

  const { data: memberTransactions = [] } = useQuery<LoyaltyTransaction[]>({
    queryKey: ["/api/loyalty-transactions", selectedMember?.id],
    enabled: !!selectedMember?.id,
  });

  const programColumns: Column<LoyaltyProgram>[] = [
    { key: "name", header: "Program Name", sortable: true },
    {
      key: "type",
      header: "Type",
      render: (value) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: "pointsPerDollar",
      header: "Points/Dollar",
      render: (value) => value || "-",
    },
    {
      key: "active",
      header: "Status",
      render: (value) => value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>,
    },
  ];

  const memberColumns: Column<LoyaltyMember>[] = [
    { key: "firstName", header: "First Name", sortable: true },
    { key: "lastName", header: "Last Name", sortable: true },
    { key: "email", header: "Email", sortable: true },
    { key: "phone", header: "Phone" },
    {
      key: "currentPoints",
      header: "Points",
      render: (value) => <span className="font-bold tabular-nums">{value || 0}</span>,
      sortable: true,
    },
    {
      key: "currentTier",
      header: "Tier",
      render: (value) => {
        const colors: Record<string, "default" | "secondary" | "outline"> = {
          gold: "default",
          silver: "secondary",
          bronze: "outline",
        };
        return value ? <Badge variant={colors[value] || "outline"}>{value}</Badge> : <Badge variant="outline">Standard</Badge>;
      },
    },
    {
      key: "lifetimePoints",
      header: "Lifetime Points",
      render: (value) => value || 0,
    },
  ];

  const rewardColumns: Column<LoyaltyReward>[] = [
    { key: "name", header: "Reward Name", sortable: true },
    { key: "description", header: "Description" },
    {
      key: "pointsCost",
      header: "Points Required",
      render: (value) => <span className="font-bold tabular-nums">{value}</span>,
      sortable: true,
    },
    {
      key: "type",
      header: "Type",
      render: (value) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: "active",
      header: "Status",
      render: (value) => value ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>,
    },
  ];

  const programFormFields: FormFieldConfig[] = [
    { name: "name", label: "Program Name", type: "text", placeholder: "Rewards Program", required: true },
    { name: "description", label: "Description", type: "textarea", placeholder: "Earn points on every purchase" },
    {
      name: "type",
      label: "Program Type",
      type: "select",
      options: [
        { value: "points", label: "Points Based" },
        { value: "visits", label: "Visits Based" },
        { value: "spend", label: "Spend Based" },
        { value: "tiered", label: "Tiered Rewards" },
      ],
      required: true,
      defaultValue: "points",
    },
    { name: "pointsPerDollar", label: "Points per Dollar", type: "number", placeholder: "1", defaultValue: 1 },
    { name: "active", label: "Active", type: "switch", defaultValue: true },
  ];

  const memberFormFields: FormFieldConfig[] = [
    { name: "firstName", label: "First Name", type: "text", required: true },
    { name: "lastName", label: "Last Name", type: "text", required: true },
    { name: "email", label: "Email", type: "text", required: true },
    { name: "phone", label: "Phone", type: "text" },
    {
      name: "programId",
      label: "Loyalty Program",
      type: "select",
      options: programs.map(p => ({ value: p.id, label: p.name })),
      required: true,
    },
    {
      name: "tier",
      label: "Tier",
      type: "select",
      options: [
        { value: "standard", label: "Standard" },
        { value: "bronze", label: "Bronze" },
        { value: "silver", label: "Silver" },
        { value: "gold", label: "Gold" },
      ],
      defaultValue: "standard",
    },
  ];

  const rewardFormFields: FormFieldConfig[] = [
    { name: "name", label: "Reward Name", type: "text", placeholder: "Free Appetizer", required: true },
    { name: "description", label: "Description", type: "textarea", placeholder: "Redeem for any appetizer" },
    { name: "pointsCost", label: "Points Required", type: "number", placeholder: "100", required: true },
    {
      name: "type",
      label: "Reward Type",
      type: "select",
      options: [
        { value: "discount", label: "Discount" },
        { value: "free_item", label: "Free Item" },
        { value: "gift_card", label: "Gift Card" },
        { value: "experience", label: "Experience" },
      ],
      required: true,
      defaultValue: "free_item",
    },
    { name: "discountValue", label: "Value ($)", type: "decimal", placeholder: "5.00" },
    {
      name: "programId",
      label: "Loyalty Program",
      type: "select",
      options: programs.map(p => ({ value: p.id, label: p.name })),
      required: true,
    },
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
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-programs"] });
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
      if (editingMember) {
        const response = await apiRequest("PUT", `/api/loyalty-members/${editingMember.id}`, data);
        return response.json();
      }
      const response = await apiRequest("POST", "/api/loyalty-members", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members"] });
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
      if (editingReward) {
        const response = await apiRequest("PUT", `/api/loyalty-rewards/${editingReward.id}`, data);
        return response.json();
      }
      const response = await apiRequest("POST", "/api/loyalty-rewards", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-rewards"] });
      setRewardFormOpen(false);
      setEditingReward(null);
      toast({ title: editingReward ? "Reward updated" : "Reward created" });
    },
    onError: () => {
      toast({ title: "Failed to save reward", variant: "destructive" });
    },
  });

  const earnMutation = useMutation({
    mutationFn: async ({ memberId, points, reason }: { memberId: string; points: number; reason: string }) => {
      const response = await apiRequest("POST", `/api/loyalty-members/${memberId}/earn`, { points, reason });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-transactions", selectedMember?.id] });
      setEarnPointsOpen(false);
      setEarnPoints("");
      setEarnReason("");
      toast({ title: "Points added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add points", variant: "destructive" });
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async ({ memberId, rewardId }: { memberId: string; rewardId: string }) => {
      const response = await apiRequest("POST", `/api/loyalty-members/${memberId}/redeem`, { rewardId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-transactions", selectedMember?.id] });
      setRedeemRewardOpen(false);
      setSelectedRewardId("");
      toast({ title: "Reward redeemed successfully" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to redeem reward", variant: "destructive" });
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

  const handleViewMember = (member: LoyaltyMember) => {
    setSelectedMember(member);
    setMemberDetailOpen(true);
  };

  const memberActions: CustomAction<LoyaltyMember>[] = [
    { label: "View Details", icon: History, onClick: handleViewMember },
  ];

  const totalMembers = members.length;
  const totalPoints = members.reduce((sum, m) => sum + (m.currentPoints || 0), 0);
  const activePrograms = programs.filter(p => p.active).length;

  const availableRewards = rewards.filter(r => 
    r.active && 
    selectedMember && 
    r.programId === selectedMember.programId && 
    (selectedMember.currentPoints || 0) >= (r.pointsCost || 0)
  );

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
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="mt-4">
          <DataTable
            data={programs}
            columns={programColumns}
            onAdd={() => { setEditingProgram(null); setProgramFormOpen(true); }}
            onEdit={(item) => { setEditingProgram(item); setProgramFormOpen(true); }}
            isLoading={programsLoading}
            searchPlaceholder="Search programs..."
            emptyMessage="No loyalty programs created yet"
          />
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

        <TabsContent value="rewards" className="mt-4">
          <DataTable
            data={rewards}
            columns={rewardColumns}
            onAdd={() => { setEditingReward(null); setRewardFormOpen(true); }}
            onEdit={(item) => { setEditingReward(item); setRewardFormOpen(true); }}
            isLoading={rewardsLoading}
            searchPlaceholder="Search rewards..."
            emptyMessage="No rewards created yet"
          />
        </TabsContent>
      </Tabs>

      <EntityForm
        open={programFormOpen}
        onClose={() => { setProgramFormOpen(false); setEditingProgram(null); }}
        onSubmit={(data) => programMutation.mutate(data)}
        schema={insertLoyaltyProgramSchema}
        fields={programFormFields}
        title={editingProgram ? "Edit Program" : "Create Loyalty Program"}
        initialData={editingProgram ? { ...editingProgram, tierConfig: undefined } : undefined}
        isLoading={programMutation.isPending}
      />

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lookup Loyalty Member</DialogTitle>
            <DialogDescription>Enter email to find member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
          <DialogFooter>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Member Details</DialogTitle>
            <DialogDescription>
              {selectedMember?.firstName} {selectedMember?.lastName}
            </DialogDescription>
          </DialogHeader>
          {selectedMember && (
            <Tabs defaultValue="info" className="mt-4">
              <TabsList>
                <TabsTrigger value="info">Member Info</TabsTrigger>
                <TabsTrigger value="history">Points History</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="space-y-4">
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Current Points</p>
                    <p className="text-3xl font-bold text-primary" data-testid="text-member-points">
                      {(selectedMember.currentPoints || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tier</p>
                    <div className="flex items-center gap-2">
                      <Crown className="w-5 h-5 text-yellow-500" />
                      <span className="text-lg font-medium capitalize">{selectedMember.currentTier || "Standard"}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Lifetime Points</p>
                    <p className="text-lg font-medium">{(selectedMember.lifetimePoints || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="text-lg font-medium">{selectedMember.email}</p>
                  </div>
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
                            <p className="font-medium capitalize">{tx.transactionType}</p>
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
        </DialogContent>
      </Dialog>

      <Dialog open={earnPointsOpen} onOpenChange={setEarnPointsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Points</DialogTitle>
            <DialogDescription>Add points to {selectedMember?.firstName}'s account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEarnPointsOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedMember && earnMutation.mutate({
                memberId: selectedMember.id,
                points: parseInt(earnPoints),
                reason: earnReason,
              })}
              disabled={!earnPoints || parseInt(earnPoints) <= 0 || earnMutation.isPending}
              data-testid="button-earn-submit"
            >
              Add {earnPoints || 0} Points
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={redeemRewardOpen} onOpenChange={setRedeemRewardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem Reward</DialogTitle>
            <DialogDescription>
              Current points: {(selectedMember?.currentPoints || 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Reward</Label>
              <Select value={selectedRewardId} onValueChange={setSelectedRewardId}>
                <SelectTrigger data-testid="select-reward">
                  <SelectValue placeholder="Choose a reward" />
                </SelectTrigger>
                <SelectContent>
                  {availableRewards.map((reward) => (
                    <SelectItem key={reward.id} value={reward.id}>
                      {reward.name} ({reward.pointsCost} pts)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemRewardOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedMember && redeemMutation.mutate({
                memberId: selectedMember.id,
                rewardId: selectedRewardId,
              })}
              disabled={!selectedRewardId || redeemMutation.isPending}
              data-testid="button-redeem-reward-submit"
            >
              Redeem Reward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
