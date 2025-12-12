/**
 * API Route: /api/eval/metrics
 *
 * Get eval metrics from call history
 * - GET: Calculate metrics from call history
 * - POST: Create new eval run and store results
 */

import { NextRequest, NextResponse } from "next/server";
import {
  calculateMetrics,
  calculateMetricsByPeriod,
  compareMetrics,
  generateEvalReport,
  createEvalRun,
  getEvalRuns,
  getLatestEvalRun,
} from "@/lib/eval";
import { getAllCallRecords } from "@/lib/call-history";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const period = searchParams.get("period") as "day" | "week" | "month" | null;
    const format = searchParams.get("format") as "json" | "report" | null;

    // Get call records
    const calls = await getAllCallRecords(limit);

    // Calculate metrics
    const metrics = calculateMetrics(calls);

    // Get previous metrics for comparison
    const previousRun = getLatestEvalRun();
    const comparison = compareMetrics(metrics, previousRun?.metrics || null);

    // Response based on format
    if (format === "report") {
      const report = generateEvalReport(metrics, comparison);
      return new Response(report, {
        headers: { "Content-Type": "text/markdown" },
      });
    }

    // Calculate by period if requested
    let byPeriod = null;
    if (period) {
      const periodMetrics = calculateMetricsByPeriod(calls, period);
      byPeriod = Object.fromEntries(periodMetrics);
    }

    return NextResponse.json({
      success: true,
      metrics,
      comparison: {
        hasPrevious: !!previousRun,
        delta: comparison.delta,
        improvement: comparison.improvement,
      },
      byPeriod,
      callCount: calls.length,
    });
  } catch (error) {
    console.error("[api/eval/metrics] GET error:", error);
    return NextResponse.json(
      { error: "Failed to calculate metrics" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notes = "", dateRange, limit = 100 } = body;

    // Get call records
    let calls = await getAllCallRecords(limit);

    // Filter by date range if provided
    if (dateRange?.start || dateRange?.end) {
      const start = dateRange.start ? new Date(dateRange.start) : new Date(0);
      const end = dateRange.end ? new Date(dateRange.end) : new Date();

      calls = calls.filter(c => {
        const callDate = new Date(c.dateTime);
        return callDate >= start && callDate <= end;
      });
    }

    // Create eval run
    const run = createEvalRun(calls, {
      dateRange: dateRange ? {
        start: new Date(dateRange.start),
        end: new Date(dateRange.end),
      } : undefined,
      minCalls: 1,
    }, notes);

    // Get comparison with previous run
    const allRuns = getEvalRuns();
    const previousRun = allRuns.length > 1 ? allRuns[1] : null;
    const comparison = compareMetrics(run.metrics, previousRun?.metrics || null);

    return NextResponse.json({
      success: true,
      run,
      comparison: {
        hasPrevious: !!previousRun,
        delta: comparison.delta,
        improvement: comparison.improvement,
      },
      report: generateEvalReport(run.metrics, comparison),
    });
  } catch (error) {
    console.error("[api/eval/metrics] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create eval run" },
      { status: 500 }
    );
  }
}
