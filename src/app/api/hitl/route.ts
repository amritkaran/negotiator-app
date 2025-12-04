import { NextRequest, NextResponse } from "next/server";
import {
  pendingHITLRequests,
  activeCallControls,
} from "../vapi-webhook/route";

// GET - Retrieve pending HITL requests
export async function GET() {
  const pending: Array<{
    callId: string;
    question: string;
    vendorName: string;
    timestamp: number;
    waitingSeconds: number;
  }> = [];

  pendingHITLRequests.forEach((request, callId) => {
    if (!request.resolved) {
      pending.push({
        callId,
        question: request.question,
        vendorName: request.vendorName,
        timestamp: request.timestamp,
        waitingSeconds: Math.round((Date.now() - request.timestamp) / 1000),
      });
    }
  });

  return NextResponse.json({
    pending,
    count: pending.length,
  });
}

// POST - Submit answer to a HITL request
export async function POST(request: NextRequest) {
  try {
    const { callId, answer } = await request.json();

    if (!callId || !answer) {
      return NextResponse.json(
        { error: "callId and answer are required" },
        { status: 400 }
      );
    }

    const pendingRequest = pendingHITLRequests.get(callId);

    if (!pendingRequest) {
      return NextResponse.json(
        { error: "No pending request found for this call" },
        { status: 404 }
      );
    }

    if (pendingRequest.resolved) {
      return NextResponse.json(
        { error: "This request has already been answered" },
        { status: 400 }
      );
    }

    // Mark as resolved with the answer
    pendingRequest.resolved = true;
    pendingRequest.answer = answer;
    pendingHITLRequests.set(callId, pendingRequest);

    console.log(`[HITL] Answer provided for call ${callId}: "${answer}"`);

    return NextResponse.json({
      success: true,
      message: "Answer submitted successfully",
      callId,
      answer,
    });
  } catch (error) {
    console.error("[HITL] Error:", error);
    return NextResponse.json(
      { error: "Failed to submit answer" },
      { status: 500 }
    );
  }
}
