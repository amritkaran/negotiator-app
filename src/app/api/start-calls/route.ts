import { NextRequest, NextResponse } from "next/server";
import { makeOutboundCall, getCallStatus, extractQuoteFromTranscript } from "@/lib/vapi";
import { Business, UserRequirement } from "@/types";

// Store active calls and lowest prices in memory (use Redis/DB in production)
const activeCalls = new Map<
  string,
  {
    callId: string;
    businessId: string;
    status: string;
    startedAt: Date;
  }
>();

const sessionLowestPrices = new Map<string, number>();

export async function POST(request: NextRequest) {
  try {
    const { businesses, requirements, sessionId } = await request.json();

    if (!businesses || !requirements || !sessionId) {
      return NextResponse.json(
        { error: "Businesses, requirements, and sessionId are required" },
        { status: 400 }
      );
    }

    // Get existing lowest price for this session (if any)
    let lowestPriceSoFar = sessionLowestPrices.get(sessionId);

    const results = [];

    // TEST MODE: Limit to 1 call at a time for testing
    const maxCalls = process.env.TEST_PHONE_NUMBER ? 1 : (businesses as Business[]).length;
    const businessesToCall = (businesses as Business[]).slice(0, maxCalls);

    if (process.env.TEST_PHONE_NUMBER && businesses.length > 1) {
      console.log(`[TEST MODE] Limiting calls to 1 (out of ${businesses.length} vendors)`);
    }

    // Make calls sequentially to track and use lowest price in negotiations
    for (const business of businessesToCall) {
      try {
        const { callId, status } = await makeOutboundCall(
          business,
          requirements as UserRequirement,
          lowestPriceSoFar
        );

        // Store call info
        activeCalls.set(callId, {
          callId,
          businessId: business.id,
          status,
          startedAt: new Date(),
        });

        results.push({
          businessId: business.id,
          businessName: business.name,
          callId,
          status: "initiated",
          lowestPriceSoFar,
        });
      } catch (error) {
        console.error(`Failed to call ${business.name}:`, error);
        results.push({
          businessId: business.id,
          businessName: business.name,
          callId: null,
          status: "failed",
          error: error instanceof Error ? error.message : "Failed to initiate call",
        });
      }
    }

    return NextResponse.json({
      calls: results,
      message: `Initiated ${results.filter((r) => r.status === "initiated").length} calls`,
    });
  } catch (error) {
    console.error("Start calls error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start calls" },
      { status: 500 }
    );
  }
}

// Export function to update lowest price from call-status route
export function updateLowestPrice(sessionId: string, price: number) {
  const current = sessionLowestPrices.get(sessionId);
  if (!current || price < current) {
    sessionLowestPrices.set(sessionId, price);
  }
}
