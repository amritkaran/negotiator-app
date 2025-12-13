import { NextRequest, NextResponse } from "next/server";
import { makeOutboundCall } from "@/lib/vapi";
import { Business, UserRequirement, NegotiatorPersona } from "@/types";
import { saveCallRecord, updateCallRecord, getCallRecordByCallId } from "@/lib/call-history";

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
    const { businesses, requirements, sessionId, languageMode, regionalLanguage, priceIntel, persona } = await request.json();

    if (!businesses || !requirements || !sessionId) {
      return NextResponse.json(
        { error: "Businesses, requirements, and sessionId are required" },
        { status: 400 }
      );
    }

    // Language mode: "hindi-english" (Deepgram Nova-3 multi) or "regional" (Google STT)
    const useRegionalLanguages = languageMode === "regional";
    // Regional language code (hi, kn, te, ta, bn, mr, gu)
    const selectedRegionalLanguage = regionalLanguage || "hi";
    // Negotiator persona
    const selectedPersona: NegotiatorPersona = persona || "preet";

    // Get existing lowest price for this session (if any)
    let lowestPriceSoFar = sessionLowestPrices.get(sessionId);

    // Price context from research phase
    const priceContext = priceIntel?.baselinePrice ? {
      expectedPriceLow: priceIntel.baselinePrice.low,
      expectedPriceMid: priceIntel.baselinePrice.mid,
      expectedPriceHigh: priceIntel.baselinePrice.high,
      bestVendorSoFar: undefined as string | undefined,
    } : undefined;

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
          lowestPriceSoFar,
          useRegionalLanguages,
          selectedRegionalLanguage,
          priceContext,
          selectedPersona
        );

        // Store call info
        activeCalls.set(callId, {
          callId,
          businessId: business.id,
          status,
          startedAt: new Date(),
        });

        // Save to call history
        const reqs = requirements as UserRequirement;
        await saveCallRecord({
          callId,
          vendorName: business.name,
          vendorPhone: business.phone,
          dateTime: new Date().toISOString(),
          duration: 0,
          status: "in_progress",
          endedReason: null, // Will be populated when call ends
          requirements: {
            service: reqs.service,
            from: reqs.from || "",
            to: reqs.to || "",
            date: reqs.date || "",
            time: reqs.time || "",
            passengers: reqs.passengers,
            vehicleType: reqs.vehicleType,
            tripType: reqs.tripType,
          },
          quotedPrice: null,
          negotiatedPrice: null,
          transcript: null,
          recordingUrl: null,
          notes: null,
          sessionId,
          isSynthetic: false,
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
