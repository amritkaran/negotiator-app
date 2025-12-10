import { NextRequest, NextResponse } from "next/server";
import { getCallStatus, extractQuoteFromTranscript } from "@/lib/vapi";
import { getCallRecordByCallId, updateCallRecord, CallHistoryRecord } from "@/lib/call-history";

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

    // Determine status based on endedReason for more accurate tracking
    let finalStatus: CallHistoryRecord["status"] = "completed";
    if (callData.endedReason) {
      if (callData.endedReason === "customer-busy") {
        finalStatus = "busy";
      } else if (
        callData.endedReason === "customer-did-not-answer" ||
        callData.endedReason === "voicemail"
      ) {
        finalStatus = "no_answer";
      } else if (
        callData.endedReason.includes("error") ||
        callData.endedReason.includes("failed")
      ) {
        finalStatus = "failed";
      }
    }

    // Update call history record when call ends
    if (isEnded) {
      try {
        const existingRecord = await getCallRecordByCallId(callId);
        if (existingRecord) {
          await updateCallRecord(existingRecord.id, {
            status: finalStatus,
            endedReason: callData.endedReason || null,
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
      endedReason: callData.endedReason || null,
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
