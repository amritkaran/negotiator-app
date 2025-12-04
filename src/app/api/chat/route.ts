import { NextRequest, NextResponse } from "next/server";
import { extractRequirements } from "@/lib/openai";
import { UserRequirement } from "@/types";
import { logRequirements, logError } from "@/lib/session-logger";

// Store conversation state in memory (use Redis/DB in production)
const conversations = new Map<
  string,
  {
    history: { role: "user" | "assistant"; content: string }[];
    requirements: UserRequirement | null;
  }
>();

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let sessionId = "unknown";

  try {
    const body = await request.json();
    const { message } = body;
    sessionId = body.sessionId || "unknown";

    console.log(`[chat] Processing message for session ${sessionId}`);

    if (!message || !sessionId || sessionId === "unknown") {
      return NextResponse.json(
        { error: "Message and sessionId are required" },
        { status: 400 }
      );
    }

    // Get or create conversation
    let conversation = conversations.get(sessionId);
    if (!conversation) {
      conversation = { history: [], requirements: null };
      conversations.set(sessionId, conversation);
    }

    // Add user message to history
    conversation.history.push({ role: "user", content: message });

    // Extract requirements from conversation
    const { requirements, followUpQuestion } = await extractRequirements(
      conversation.history
    );

    conversation.requirements = requirements;

    let response: string;

    if (requirements.isComplete) {
      response = `Perfect! I have all the details:

**Your Request:**
- Service: ${requirements.service}
- From: ${requirements.from}
- To: ${requirements.to}
- Date: ${requirements.date}
- Time: ${requirements.time}
- Trip Type: ${requirements.tripType === "round-trip" ? "Round trip (up and down)" : "One way"}
${requirements.tripType === "round-trip" && requirements.waitingTime ? `- Waiting Time: ${requirements.waitingTime} minutes` : ""}
- Toll Roads: ${requirements.tollPreference === "ok" ? "OK to use" : requirements.tollPreference === "avoid" ? "Avoid if possible" : "No preference"}
${requirements.passengers ? `- Passengers: ${requirements.passengers}` : ""}
${requirements.vehicleType ? `- Vehicle: ${requirements.vehicleType}` : ""}
${requirements.specialInstructions && requirements.specialInstructions !== "none" ? `- Special Instructions: ${requirements.specialInstructions}` : ""}
${requirements.budget ? `- Budget: ₹${requirements.budget}` : ""}
${requirements.preferredVendors && requirements.preferredVendors.length > 0 ? `- **Preferred Vendors:** ${requirements.preferredVendors.join(", ")} (will be prioritized)` : ""}

Click "Find Providers" to search for the best service providers near you!`;
    } else {
      response = followUpQuestion || "Could you provide more details about what you need?";
    }

    // Add assistant response to history
    conversation.history.push({ role: "assistant", content: response });

    // Log requirements if complete
    if (requirements.isComplete) {
      console.log(`[chat] Requirements complete - preferredVendors:`, requirements.preferredVendors);
      try {
        await logRequirements(sessionId, {
          service: requirements.service,
          from: requirements.from,
          to: requirements.to,
          date: requirements.date,
          time: requirements.time,
          passengers: requirements.passengers,
          vehicleType: requirements.vehicleType,
          tripType: requirements.tripType,
          waitingTime: requirements.waitingTime,
          tollPreference: requirements.tollPreference,
          specialInstructions: requirements.specialInstructions,
          preferredVendors: requirements.preferredVendors,
        });
      } catch {
        // Ignore logging errors
      }
    }

    console.log(`[chat] Completed in ${Date.now() - startTime}ms`);

    return NextResponse.json({
      response,
      requirements,
      isComplete: requirements.isComplete,
    });
  } catch (error) {
    console.error("[chat] Error:", error);

    // Log error to persistent storage
    try {
      await logError(sessionId, "chat", error instanceof Error ? error : String(error));
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process message",
        details: process.env.NODE_ENV === "development" ? String(error) : undefined,
      },
      { status: 500 }
    );
  }
}

// Clear conversation
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (sessionId) {
    conversations.delete(sessionId);
  }

  return NextResponse.json({ success: true });
}
