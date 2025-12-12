/**
 * Eval Metrics Tracking System
 *
 * Tracks and analyzes performance metrics for the negotiation bot
 * Key metrics:
 * - Quote Obtained Rate: % of calls where quotation was received
 * - Negotiation Success Rate: % of calls where bot reduced price from first offer
 * - Price Reduction %: Average % reduction from vendor's first offer
 */

import { CallHistoryRecord } from "../call-history";

// Core eval metrics
export interface EvalMetrics {
  // Primary metrics
  quoteObtainedRate: number;        // 0-100%
  negotiationSuccessRate: number;   // 0-100%
  avgPriceReductionPercent: number; // Average % reduction

  // Secondary metrics
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  avgCallDuration: number;          // seconds

  // Price metrics
  avgQuotedPrice: number;
  avgFinalPrice: number;
  totalSavings: number;             // Sum of (quoted - negotiated) for all calls

  // Call outcome breakdown
  outcomes: {
    completed: number;
    noAnswer: number;
    busy: number;
    rejected: number;
    failed: number;
  };
}

// Eval run result
export interface EvalRunResult {
  id: string;
  runAt: Date;
  metrics: EvalMetrics;
  callIds: string[];
  notes: string;
  config: {
    dateRange?: { start: Date; end: Date };
    personaFilter?: string[];
    minCalls: number;
  };
}

// Historical eval comparison
export interface EvalComparison {
  current: EvalMetrics;
  previous: EvalMetrics | null;
  delta: {
    quoteObtainedRate: number;
    negotiationSuccessRate: number;
    avgPriceReductionPercent: number;
  } | null;
  improvement: boolean;
}

// Calculate metrics from call records
export function calculateMetrics(calls: CallHistoryRecord[]): EvalMetrics {
  const totalCalls = calls.length;

  if (totalCalls === 0) {
    return {
      quoteObtainedRate: 0,
      negotiationSuccessRate: 0,
      avgPriceReductionPercent: 0,
      totalCalls: 0,
      completedCalls: 0,
      failedCalls: 0,
      avgCallDuration: 0,
      avgQuotedPrice: 0,
      avgFinalPrice: 0,
      totalSavings: 0,
      outcomes: {
        completed: 0,
        noAnswer: 0,
        busy: 0,
        rejected: 0,
        failed: 0,
      },
    };
  }

  // Count outcomes
  const outcomes = {
    completed: calls.filter(c => c.status === "completed").length,
    noAnswer: calls.filter(c => c.status === "no_answer").length,
    busy: calls.filter(c => c.status === "busy").length,
    rejected: calls.filter(c => c.status === "rejected").length,
    failed: calls.filter(c => c.status === "failed").length,
  };

  // Calls with quotes obtained
  const callsWithQuotes = calls.filter(c => c.quotedPrice !== null && c.quotedPrice > 0);
  const quoteObtainedRate = Math.round((callsWithQuotes.length / totalCalls) * 100);

  // Calls where negotiation reduced price
  const callsWithNegotiation = callsWithQuotes.filter(c =>
    c.negotiatedPrice !== null &&
    c.quotedPrice !== null &&
    c.negotiatedPrice < c.quotedPrice
  );
  const negotiationSuccessRate = callsWithQuotes.length > 0
    ? Math.round((callsWithNegotiation.length / callsWithQuotes.length) * 100)
    : 0;

  // Calculate price reductions
  const priceReductions: number[] = [];
  let totalSavings = 0;
  let totalQuoted = 0;
  let totalFinal = 0;

  for (const call of callsWithQuotes) {
    const quoted = call.quotedPrice!;
    const final = call.negotiatedPrice || quoted;

    totalQuoted += quoted;
    totalFinal += final;

    if (final < quoted) {
      const reductionPercent = ((quoted - final) / quoted) * 100;
      priceReductions.push(reductionPercent);
      totalSavings += quoted - final;
    }
  }

  const avgPriceReductionPercent = priceReductions.length > 0
    ? Math.round(priceReductions.reduce((a, b) => a + b, 0) / priceReductions.length)
    : 0;

  // Average prices
  const avgQuotedPrice = callsWithQuotes.length > 0
    ? Math.round(totalQuoted / callsWithQuotes.length)
    : 0;
  const avgFinalPrice = callsWithQuotes.length > 0
    ? Math.round(totalFinal / callsWithQuotes.length)
    : 0;

  // Average call duration
  const callsWithDuration = calls.filter(c => c.duration > 0);
  const avgCallDuration = callsWithDuration.length > 0
    ? Math.round(callsWithDuration.reduce((sum, c) => sum + c.duration, 0) / callsWithDuration.length)
    : 0;

  return {
    quoteObtainedRate,
    negotiationSuccessRate,
    avgPriceReductionPercent,
    totalCalls,
    completedCalls: outcomes.completed,
    failedCalls: outcomes.failed + outcomes.noAnswer + outcomes.busy,
    avgCallDuration,
    avgQuotedPrice,
    avgFinalPrice,
    totalSavings,
    outcomes,
  };
}

// Calculate metrics by time period
export function calculateMetricsByPeriod(
  calls: CallHistoryRecord[],
  period: "day" | "week" | "month"
): Map<string, EvalMetrics> {
  // Group calls by period
  const grouped = new Map<string, CallHistoryRecord[]>();

  for (const call of calls) {
    const date = new Date(call.dateTime);
    let key: string;

    if (period === "day") {
      key = date.toISOString().split("T")[0]; // YYYY-MM-DD
    } else if (period === "week") {
      // Get week number
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
      key = `${date.getFullYear()}-W${weekNum.toString().padStart(2, "0")}`;
    } else {
      key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`;
    }

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(call);
  }

  // Calculate metrics for each period
  const result = new Map<string, EvalMetrics>();
  for (const [key, periodCalls] of grouped) {
    result.set(key, calculateMetrics(periodCalls));
  }

  return result;
}

// Compare current metrics with previous period
export function compareMetrics(
  current: EvalMetrics,
  previous: EvalMetrics | null
): EvalComparison {
  if (!previous) {
    return {
      current,
      previous: null,
      delta: null,
      improvement: false,
    };
  }

  const delta = {
    quoteObtainedRate: current.quoteObtainedRate - previous.quoteObtainedRate,
    negotiationSuccessRate: current.negotiationSuccessRate - previous.negotiationSuccessRate,
    avgPriceReductionPercent: current.avgPriceReductionPercent - previous.avgPriceReductionPercent,
  };

  // Consider improvement if any 2 of 3 metrics improved
  const improvements = [
    delta.quoteObtainedRate > 0,
    delta.negotiationSuccessRate > 0,
    delta.avgPriceReductionPercent > 0,
  ].filter(Boolean).length;

  return {
    current,
    previous,
    delta,
    improvement: improvements >= 2,
  };
}

// Generate eval report
export function generateEvalReport(
  metrics: EvalMetrics,
  comparison?: EvalComparison
): string {
  let report = `# Negotiation Bot Eval Report

## Primary Metrics

| Metric | Value | ${comparison?.delta ? "Change" : ""} |
|--------|-------|${comparison?.delta ? "--------|" : ""}
| Quote Obtained Rate | ${metrics.quoteObtainedRate}% | ${comparison?.delta ? `${comparison.delta.quoteObtainedRate > 0 ? "+" : ""}${comparison.delta.quoteObtainedRate}%` : ""} |
| Negotiation Success Rate | ${metrics.negotiationSuccessRate}% | ${comparison?.delta ? `${comparison.delta.negotiationSuccessRate > 0 ? "+" : ""}${comparison.delta.negotiationSuccessRate}%` : ""} |
| Avg Price Reduction | ${metrics.avgPriceReductionPercent}% | ${comparison?.delta ? `${comparison.delta.avgPriceReductionPercent > 0 ? "+" : ""}${comparison.delta.avgPriceReductionPercent}%` : ""} |

## Call Statistics

- **Total Calls**: ${metrics.totalCalls}
- **Completed Calls**: ${metrics.completedCalls}
- **Failed/No Answer**: ${metrics.failedCalls}
- **Avg Call Duration**: ${Math.round(metrics.avgCallDuration / 60)} min ${metrics.avgCallDuration % 60} sec

## Price Statistics

- **Avg Quoted Price**: ₹${metrics.avgQuotedPrice}
- **Avg Final Price**: ₹${metrics.avgFinalPrice}
- **Total Savings**: ₹${metrics.totalSavings}

## Call Outcomes

- Completed: ${metrics.outcomes.completed}
- No Answer: ${metrics.outcomes.noAnswer}
- Busy: ${metrics.outcomes.busy}
- Rejected: ${metrics.outcomes.rejected}
- Failed: ${metrics.outcomes.failed}
`;

  if (comparison?.improvement !== undefined) {
    report += `\n## Trend

${comparison.improvement ? "📈 **Overall improvement** compared to previous period" : "📉 Performance decreased compared to previous period"}
`;
  }

  return report;
}

// Store for eval runs (in-memory for now, could be persisted to DB)
const evalRuns: EvalRunResult[] = [];

// Create a new eval run
export function createEvalRun(
  calls: CallHistoryRecord[],
  config: EvalRunResult["config"],
  notes: string = ""
): EvalRunResult {
  const run: EvalRunResult = {
    id: `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    runAt: new Date(),
    metrics: calculateMetrics(calls),
    callIds: calls.map(c => c.callId),
    notes,
    config,
  };

  evalRuns.push(run);
  return run;
}

// Get all eval runs
export function getEvalRuns(): EvalRunResult[] {
  return evalRuns.sort((a, b) => b.runAt.getTime() - a.runAt.getTime());
}

// Get latest eval run
export function getLatestEvalRun(): EvalRunResult | null {
  return evalRuns.length > 0
    ? evalRuns.sort((a, b) => b.runAt.getTime() - a.runAt.getTime())[0]
    : null;
}

// Get eval run by ID
export function getEvalRunById(id: string): EvalRunResult | null {
  return evalRuns.find(r => r.id === id) || null;
}
