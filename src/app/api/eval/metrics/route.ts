/**
 * API Route: /api/eval/metrics
 *
 * Get eval metrics from call history
 * - GET: Calculate metrics from call history
 * - POST: Create new eval run with full transcript analysis
 *
 * Key Metrics:
 * 1. Quote Obtained Rate: % of calls with successful vendor quote
 * 2. Negotiation Attempt Rate: % of calls where bot asked to lower price
 * 3. Negotiation Success Rate: % of calls where bot lowered the price
 * 4. Safety Rate: % of calls where bot was professional
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
import { getAllCallRecords, CallDataFilter } from "@/lib/call-history";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const period = searchParams.get("period") as "day" | "week" | "month" | null;
    const format = searchParams.get("format") as "json" | "report" | null;
    const analyze = searchParams.get("analyze") === "true"; // Set to true to analyze transcripts
    const useSaved = searchParams.get("saved") === "true"; // Load last saved eval
    const dataFilter = (searchParams.get("filter") || "all") as CallDataFilter; // "all", "actual", "synthetic"

    // If useSaved, return the latest saved eval run
    if (useSaved) {
      const latestRun = await getLatestEvalRun();
      if (latestRun) {
        return NextResponse.json({
          success: true,
          metrics: latestRun.metrics,
          run: latestRun,
          comparison: { hasPrevious: false, delta: null, improvement: false },
          callCount: latestRun.callIds.length,
          analyzedTranscripts: true,
          fromSaved: true,
          dataFilter: "all", // Saved evals don't have filter info yet
        });
      }
    }

    // Get call records with filter
    const calls = await getAllCallRecords(limit, dataFilter);

    // Calculate metrics (with optional transcript analysis)
    const metrics = await calculateMetrics(calls, analyze);

    // Get previous metrics for comparison
    const previousRun = await getLatestEvalRun();
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
      const periodMetrics = await calculateMetricsByPeriod(calls, period);
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
      analyzedTranscripts: analyze,
      fromSaved: false,
      dataFilter,
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
    const {
      notes = "",
      dateRange,
      limit = 100,
      analyzeTranscripts = true, // Default to full analysis for POST
      dataFilter = "all" as CallDataFilter, // "all", "actual", "synthetic"
    } = body;

    // Get call records with filter
    let calls = await getAllCallRecords(limit, dataFilter);

    // Filter by date range if provided
    if (dateRange?.start || dateRange?.end) {
      const start = dateRange.start ? new Date(dateRange.start) : new Date(0);
      const end = dateRange.end ? new Date(dateRange.end) : new Date();

      calls = calls.filter(c => {
        const callDate = new Date(c.dateTime);
        return callDate >= start && callDate <= end;
      });
    }

    if (calls.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No calls found for the specified criteria",
      }, { status: 400 });
    }

    // Create eval run with transcript analysis
    const run = await createEvalRun(
      calls,
      {
        dateRange: dateRange ? {
          start: new Date(dateRange.start),
          end: new Date(dateRange.end),
        } : undefined,
        minCalls: 1,
      },
      notes,
      analyzeTranscripts
    );

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
      { error: "Failed to create eval run", details: String(error) },
      { status: 500 }
    );
  }
}
