import { NextRequest, NextResponse } from "next/server";
import { getCallStatus, extractQuoteFromTranscript } from "@/lib/vapi";

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
    if (callData.transcript && (callData.status === "ended" || callData.status === "completed")) {
      try {
        quote = await extractQuoteFromTranscript(callData.transcript, businessName);
      } catch (e) {
        console.error("Failed to extract quote:", e);
      }
    }

    return NextResponse.json({
      callId,
      status: callData.status,
      transcript: callData.transcript,
      summary: callData.summary,
      duration: callData.endedAt
        ? Math.round(
            (new Date(callData.endedAt).getTime() -
              new Date(callData.createdAt).getTime()) /
              1000
          )
        : null,
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
