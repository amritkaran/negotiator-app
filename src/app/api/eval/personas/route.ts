/**
 * API Route: /api/eval/personas
 *
 * Handles vendor persona extraction and management
 * - GET: List all persona templates
 * - POST: Extract personas from call transcripts
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAllPersonaTemplates,
  extractPersonasFromCalls,
  analyzePersonaDistribution,
} from "@/lib/eval";
import { getAllCallRecords } from "@/lib/call-history";

export async function GET() {
  try {
    const templates = getAllPersonaTemplates();

    return NextResponse.json({
      success: true,
      personas: templates,
      count: templates.length,
    });
  } catch (error) {
    console.error("[api/eval/personas] GET error:", error);
    return NextResponse.json(
      { error: "Failed to get personas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { limit = 50, callIds } = body;

    // Get call records
    let calls = await getAllCallRecords(limit);

    // Filter by call IDs if provided
    if (callIds && Array.isArray(callIds)) {
      calls = calls.filter(c => callIds.includes(c.callId));
    }

    // Filter to only completed calls with transcripts
    const callsWithTranscripts = calls.filter(
      c => c.status === "completed" && c.transcript && c.transcript.length > 100
    );

    if (callsWithTranscripts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No calls with transcripts found",
        extractions: [],
        personas: getAllPersonaTemplates(),
        stats: {
          totalCalls: calls.length,
          callsWithTranscripts: 0,
          successfulExtractions: 0,
          avgConfidence: 0,
          personasGenerated: 0,
        },
      });
    }

    // Extract personas from calls
    const result = await extractPersonasFromCalls(callsWithTranscripts);

    // Analyze distribution
    const distribution = result.extractions.length > 0
      ? analyzePersonaDistribution(result.extractions)
      : null;

    return NextResponse.json({
      success: true,
      extractions: result.extractions,
      personas: result.personas,
      stats: {
        ...result.stats,
        callsWithTranscripts: callsWithTranscripts.length,
      },
      distribution,
    });
  } catch (error) {
    console.error("[api/eval/personas] POST error:", error);
    return NextResponse.json(
      { error: "Failed to extract personas" },
      { status: 500 }
    );
  }
}
