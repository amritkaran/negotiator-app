import { NextRequest, NextResponse } from "next/server";
import { getCallStatus, extractQuoteFromTranscript } from "@/lib/vapi";
import { getCallRecordByCallId, updateCallRecord } from "@/lib/call-history";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const callId = searchParams.get("callId");
  const businessName = searchParams.get("businessName") || "Business";

  if (!callId) {
    return NextResponse.json({ error: "callId is required" }, { status: 400 });
  }

  try {
    const callData = await getCallStatus(callId);

    let quote = null;
    const isEnded = callData.status === "ended" || callData.status === "completed";

    if (callData.transcript && isEnded) {
      try {
        quote = await extractQuoteFromTranscript(callData.transcript, businessName);
      } catch (e) {
        console.error("Failed to extract quote:", e);
      }
    }

    // Calculate duration
    const duration = callData.endedAt
      ? Math.round(
          (new Date(callData.endedAt).getTime() -
            new Date(callData.createdAt).getTime()) /
            1000
        )
      : null;

    // Update call history record when call ends
    if (isEnded) {
      try {
        const existingRecord = await getCallRecordByCallId(callId);
        if (existingRecord) {
          await updateCallRecord(existingRecord.id, {
            status: "completed",
            duration: duration || 0,
            transcript: callData.transcript || null,
            recordingUrl: callData.recordingUrl || null,
            quotedPrice: quote?.price || null,
            notes: quote?.notes || callData.summary || null,
          });
        }
      } catch (e) {
        console.error("Failed to update call history:", e);
      }
    }

    return NextResponse.json({
      callId,
      status: callData.status,
      transcript: callData.transcript,
      summary: callData.summary,
      recordingUrl: callData.recordingUrl || null,
      duration,
      quote,
    });
  } catch (error) {
    console.error("Call status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get call status" },
      { status: 500 }
    );
  }
}
