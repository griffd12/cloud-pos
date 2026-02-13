import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEmc } from "@/lib/emc-context";
import { fetchWithTimeout, getAuthHeaders } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Activity, ChevronDown, ChevronRight, AlertCircle, Loader2 } from "lucide-react";

interface StressTestResult {
  id: string;
  enterpriseId: string | null;
  propertyId: string | null;
  rvcId: string | null;
  employeeId: string | null;
  status: string;
  durationMinutes: number;
  targetTxPerMinute: number;
  patterns: string[] | null;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  avgTransactionMs: number;
  minTransactionMs: number;
  maxTransactionMs: number;
  actualTxPerMinute: string | null;
  elapsedSeconds: number;
  errors: string[] | null;
  startedAt: string;
  completedAt: string | null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <Badge variant="default" className="bg-green-600 text-white" data-testid={`badge-status-${status}`}>
        {status}
      </Badge>
    );
  }
  if (status === "stopped") {
    return (
      <Badge variant="secondary" className="bg-yellow-500 text-white" data-testid={`badge-status-${status}`}>
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" data-testid={`badge-status-${status}`}>
      {status}
    </Badge>
  );
}

export default function StressTestReportPage() {
  const { selectedPropertyId, selectedRvcId } = useEmc();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data: results = [], isLoading } = useQuery<StressTestResult[]>({
    queryKey: ["/api/stress-test/results", selectedRvcId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedRvcId) params.set("rvcId", selectedRvcId);
      params.set("limit", "50");
      const res = await fetchWithTimeout(`/api/stress-test/results?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch stress test results");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-stress-test-report">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold" data-testid="text-stress-test-title">
            Stress Test Report
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          View past stress test results and performance metrics for the selected revenue center.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metric Definitions</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm" data-testid="metric-definitions">
            <div>
              <dt className="font-medium">Status</dt>
              <dd className="text-muted-foreground">Whether the test ran to completion, was manually stopped, or encountered an error</dd>
            </div>
            <div>
              <dt className="font-medium">Duration</dt>
              <dd className="text-muted-foreground">How long the test was configured to run</dd>
            </div>
            <div>
              <dt className="font-medium">Target Speed</dt>
              <dd className="text-muted-foreground">The configured transactions per minute target</dd>
            </div>
            <div>
              <dt className="font-medium">Actual Speed</dt>
              <dd className="text-muted-foreground">The measured transactions per minute achieved</dd>
            </div>
            <div>
              <dt className="font-medium">Total Tx</dt>
              <dd className="text-muted-foreground">Total number of transactions attempted</dd>
            </div>
            <div>
              <dt className="font-medium">Success / Failed</dt>
              <dd className="text-muted-foreground">Breakdown of successful vs failed transactions</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="font-medium">Avg / Min / Max ms</dt>
              <dd className="text-muted-foreground">
                Transaction timing &mdash; under 100ms is excellent, 100&ndash;200ms is good, 200&ndash;500ms is acceptable, over 500ms needs investigation
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {!selectedPropertyId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground" data-testid="text-select-property">
              Select a property from the hierarchy tree to view stress test results.
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12" data-testid="loading-results">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-results">
              No stress test results found
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table data-testid="table-stress-results">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Target Speed</TableHead>
                  <TableHead className="text-right">Actual Speed</TableHead>
                  <TableHead className="text-right">Total Tx</TableHead>
                  <TableHead className="text-right">Success</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Avg ms</TableHead>
                  <TableHead className="text-right">Min ms</TableHead>
                  <TableHead className="text-right">Max ms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => {
                  const hasErrors = result.errors && result.errors.length > 0;
                  const isExpanded = expandedRow === result.id;
                  return (
                    <Fragment key={result.id}>
                      <TableRow
                        className={hasErrors ? "cursor-pointer" : ""}
                        onClick={() => hasErrors && toggleRow(result.id)}
                        data-testid={`row-result-${result.id}`}
                      >
                        <TableCell>
                          {hasErrors && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRow(result.id);
                              }}
                              data-testid={`button-expand-${result.id}`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-date-${result.id}`}>
                          {formatDate(result.startedAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={result.status} />
                        </TableCell>
                        <TableCell className="text-right">{result.durationMinutes} min</TableCell>
                        <TableCell className="text-right">{result.targetTxPerMinute}/min</TableCell>
                        <TableCell className="text-right">
                          {result.actualTxPerMinute ? `${parseFloat(result.actualTxPerMinute).toFixed(1)}/min` : "—"}
                        </TableCell>
                        <TableCell className="text-right">{result.totalTransactions}</TableCell>
                        <TableCell className="text-right text-green-600">{result.successfulTransactions}</TableCell>
                        <TableCell className="text-right text-red-600">{result.failedTransactions}</TableCell>
                        <TableCell className="text-right">{result.avgTransactionMs}</TableCell>
                        <TableCell className="text-right">{result.minTransactionMs}</TableCell>
                        <TableCell className="text-right">{result.maxTransactionMs}</TableCell>
                      </TableRow>
                      {isExpanded && hasErrors && (
                        <TableRow key={`${result.id}-errors`}>
                          <TableCell colSpan={12} className="bg-muted/30 p-4">
                            <div className="space-y-2" data-testid={`errors-${result.id}`}>
                              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                                <AlertCircle className="w-4 h-4" />
                                Errors ({result.errors!.length})
                              </div>
                              <ul className="text-sm text-muted-foreground space-y-1 pl-6 list-disc">
                                {result.errors!.map((err, idx) => (
                                  <li key={idx} data-testid={`text-error-${result.id}-${idx}`}>
                                    {err}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
