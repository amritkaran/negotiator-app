import { NextRequest, NextResponse } from "next/server";
import { extractRequirements } from "@/lib/openai";
import { UserRequirement } from "@/types";
import { logRequirements, logError } from "@/lib/session-logger";
import { getServiceConfig, ServiceConfig } from "@/lib/services/service-config";

// Store conversation state in memory (use Redis/DB in production)
const conversations = new Map<
  string,
  {
    history: { role: "user" | "assistant"; content: string }[];
    requirements: UserRequirement | null;
    serviceType: string | null;
  }
>();

/**
 * Build a dynamic completion message based on service type and requirements
 */
function buildCompletionMessage(requirements: UserRequirement, serviceConfig: ServiceConfig): string {
  const lines: string[] = [`${serviceConfig.completionMessage}\n\n**Your ${serviceConfig.displayName} Request:**`];

  // Add service icon and type
  lines.push(`- ${serviceConfig.icon} Service: ${serviceConfig.displayName}`);

  // Add all required fields that have values
  for (const field of serviceConfig.requiredFields) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqAny = requirements as any;
    const value = reqAny[field.name] ?? requirements.serviceFields?.[field.name];

    if (value !== null && value !== undefined && value !== "") {
      let displayValue = String(value);

      // Format special values
      if (field.name === "tripType") {
        displayValue = value === "round-trip" ? "Round trip (up and down)" : "One way";
      } else if (field.name === "tollPreference") {
        displayValue = value === "ok" ? "OK to use" : value === "avoid" ? "Avoid if possible" : "No preference";
      } else if (field.name === "foodType") {
        displayValue = value === "veg" ? "Vegetarian" : value === "non-veg" ? "Non-Vegetarian" : "Both Veg & Non-Veg";
      } else if (field.name === "photoVideo") {
        displayValue = value === "photo-only" ? "Photos Only" : value === "video-only" ? "Video Only" : "Photos + Video";
      }

      lines.push(`- ${field.displayName}: ${displayValue}`);
    }
  }

  // Add optional fields if they have values
  for (const field of serviceConfig.optionalFields) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqAny = requirements as any;
    const value = reqAny[field.name] ?? requirements.serviceFields?.[field.name];

    if (value !== null && value !== undefined && value !== "" && value !== "none") {
      if (field.name === "preferredVendors" && Array.isArray(value) && value.length > 0) {
        lines.push(`- **Preferred Vendors:** ${value.join(", ")} (will be prioritized)`);
      } else if (field.name === "budget") {
        lines.push(`- Budget: ₹${value}`);
      } else {
        lines.push(`- ${field.displayName}: ${value}`);
      }
    }
  }

  lines.push(`\nClick "Find Providers" to search for the best ${serviceConfig.displayName.toLowerCase()} providers near you!`);

  return lines.join("\n");
}

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
      conversation = { history: [], requirements: null, serviceType: null };
      conversations.set(sessionId, conversation);
    }

    // Add user message to history
    conversation.history.push({ role: "user", content: message });

    // Extract requirements from conversation (pass existing service type if known)
    const { requirements, followUpQuestion, serviceConfig } = await extractRequirements(
      conversation.history,
      conversation.serviceType || undefined
    );

    // Store detected service type for future messages
    if (serviceConfig && !conversation.serviceType) {
      conversation.serviceType = serviceConfig.id;
    }

    conversation.requirements = requirements;

    let response: string;

    if (requirements.isComplete && serviceConfig) {
      // Build dynamic completion message based on service type
      response = buildCompletionMessage(requirements, serviceConfig);
    } else {
      response = followUpQuestion || "Could you provide more details about what you need?";
    }

    // Add assistant response to history
    conversation.history.push({ role: "assistant", content: response });

    // Log requirements if complete
    if (requirements.isComplete) {
      console.log(`[chat] Requirements complete for ${requirements.service}:`, requirements);
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
          serviceFields: requirements.serviceFields,
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
      serviceType: serviceConfig?.id || null,
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
