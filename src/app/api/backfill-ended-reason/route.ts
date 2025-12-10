import { NextResponse } from "next/server";
import { getAllCallRecords, updateCallRecord } from "@/lib/call-history";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = "https://api.vapi.ai";

interface VapiCallResponse {
  id: string;
  status: string;
  endedReason?: string;
}

async function getCallFromVapi(callId: string): Promise<VapiCallResponse | null> {
  try {
    const response = await fetch(`${VAPI_BASE_URL}/call/${callId}`, {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
      },
    });

    if (!response.ok) {
      console.log(`[backfill] Failed to fetch call ${callId}: ${response.status}`);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error(`[backfill] Error fetching call ${callId}:`, error);
    return null;
  }
}

export async function POST() {
  if (!VAPI_API_KEY) {
    return NextResponse.json({ error: "VAPI_API_KEY not configured" }, { status: 500 });
  }

  try {
    // Get all call records
    const records = await getAllCallRecords(500); // Get up to 500 records

    console.log(`[backfill] Found ${records.length} records to process`);

    const results = {
      total: records.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      details: [] as { callId: string; status: string; endedReason?: string }[],
    };

    for (const record of records) {
      // Skip if already has endedReason
      if (record.endedReason) {
        results.skipped++;
        continue;
      }

      // Skip if no callId
      if (!record.callId) {
        results.skipped++;
        continue;
      }

      // Fetch from VAPI
      const vapiData = await getCallFromVapi(record.callId);

      if (vapiData && vapiData.endedReason) {
        // Update the record
        await updateCallRecord(record.id, {
          endedReason: vapiData.endedReason,
        });

        results.updated++;
        results.details.push({
          callId: record.callId,
          status: "updated",
          endedReason: vapiData.endedReason,
        });

        console.log(`[backfill] Updated ${record.callId} with endedReason: ${vapiData.endedReason}`);
      } else {
        results.failed++;
        results.details.push({
          callId: record.callId,
          status: "no_data",
        });
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[backfill] Complete: ${results.updated} updated, ${results.skipped} skipped, ${results.failed} failed`);

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("[backfill] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backfill failed" },
      { status: 500 }
    );
  }
}
