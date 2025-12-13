/**
 * API Route: /api/eval/runs
 *
 * Get eval run history
 * - GET: List all eval runs
 */

import { NextRequest, NextResponse } from "next/server";
import { getEvalRuns, getEvalRunById } from "@/lib/eval";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      // Get specific run
      const run = await getEvalRunById(id);
      if (!run) {
        return NextResponse.json(
          { error: "Eval run not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, run });
    }

    // List all runs
    const runs = await getEvalRuns();

    return NextResponse.json({
      success: true,
      runs,
      count: runs.length,
    });
  } catch (error) {
    console.error("[api/eval/runs] error:", error);
    return NextResponse.json(
      { error: "Failed to get eval runs" },
      { status: 500 }
    );
  }
}
