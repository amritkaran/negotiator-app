import { NextRequest, NextResponse } from "next/server";
import { makeOutboundCall } from "@/lib/vapi";

// Test endpoint to make a call to a specific phone number
export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, from, to, date, service } = await request.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    // Create a test business object
    const testBusiness = {
      id: "test-business",
      name: "Test Vendor",
      phone: phoneNumber,
      address: "Test Address",
      rating: 4.5,
      reviewCount: 100,
      distance: 5,
      placeId: "test-place-id",
      types: ["taxi"],
    };

    // Create test requirements
    const testRequirements = {
      service: service || "cab",
      from: from || "Whitefield",
      to: to || "Airport",
      date: date || "tomorrow",
      time: "10 AM",
      passengers: 2,
      vehicleType: "sedan",
      isComplete: true,
      missingFields: [],
    };

    console.log(`[Test Call] Initiating call to ${phoneNumber}`);

    const result = await makeOutboundCall(
      testBusiness,
      testRequirements,
      undefined // No benchmark for test
    );

    console.log(`[Test Call] Call initiated: ${result.callId}`);

    return NextResponse.json({
      success: true,
      callId: result.callId,
      status: result.status,
      message: `Test call initiated to ${phoneNumber}. Check your phone!`,
    });
  } catch (error) {
    console.error("[Test Call] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to make test call" },
      { status: 500 }
    );
  }
}
