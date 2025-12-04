import { NextRequest } from "next/server";
import { runNegotiatorGraph, NegotiatorGraphState } from "@/lib/agents/graph";
import { createInitialState, AgentEvent } from "@/lib/agents/types";
import { searchNearbyBusinesses, geocodeAddress } from "@/lib/google-maps";

// Store active sessions
const sessions = new Map<
  string,
  {
    state: Partial<NegotiatorGraphState>;
    events: AgentEvent[];
    status: "running" | "paused" | "completed" | "error";
    lastUpdated: Date;
  }
>();

// SSE endpoint for streaming agent events
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("Missing sessionId", { status: 400 });
  }

  // Get or create session
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      state: createInitialState(sessionId),
      events: [],
      status: "paused",
      lastUpdated: new Date(),
    };
    sessions.set(sessionId, session);
  }

  // Create SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial state
      const initialEvent = {
        type: "init",
        sessionId,
        status: session!.status,
        eventsCount: session!.events.length,
        currentAgent: session!.state.currentAgent || "intake",
      };
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initialEvent)}\n\n`)
      );

      // Send any existing events
      for (const event of session!.events.slice(-20)) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "event", event })}\n\n`)
        );
      }

      // Keep connection alive
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: keepalive\n\n`));
      }, 15000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Start or resume the agent graph
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId,
      action,
      requirements,
      humanResponse,
      skipVerification,
    } = body;

    if (!sessionId) {
      return Response.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // Get or create session
    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        state: createInitialState(sessionId),
        events: [],
        status: "paused",
        lastUpdated: new Date(),
      };
      sessions.set(sessionId, session);
    }

    // Handle different actions
    switch (action) {
      case "start":
      case "update_requirements":
        // Update requirements
        if (requirements) {
          session.state.requirements = requirements;
        }
        break;

      case "search_businesses":
        // Search for businesses based on requirements
        if (session.state.requirements?.from) {
          const location = await geocodeAddress(session.state.requirements.from);
          if (location) {
            const businesses = await searchNearbyBusinesses(
              session.state.requirements.service || "cab",
              location,
              5
            );
            session.state.businesses = businesses;
          }
        }
        break;

      case "human_response":
        // Handle human-in-the-loop response
        if (humanResponse && session.state.humanInterrupt?.active) {
          session.state.humanInterrupt = {
            ...session.state.humanInterrupt,
            response: humanResponse,
            respondedAt: new Date(),
          };
        }
        break;

      case "call_decision":
        // Handle user's call decision (continue or stop calling)
        const { decision } = body; // "continue" or "stop"
        if (session.state.callDecision?.awaitingDecision) {
          session.state.callDecision = {
            ...session.state.callDecision,
            userDecision: decision,
            awaitingDecision: false,
          };

          if (decision === "stop") {
            // User wants to stop - proceed to learning with current best deal
            session.state.shouldContinue = true; // Allow graph to continue
          } else if (decision === "continue") {
            // User wants to continue calling more vendors
            session.state.shouldContinue = true; // Allow graph to continue to next vendor
            // Increment vendor index so we call the next vendor
            if (session.state.negotiation) {
              session.state.negotiation = {
                ...session.state.negotiation,
                currentVendorIndex: session.state.negotiation.currentVendorIndex + 1,
              };
            }
          }
        }
        break;

      case "skip_verification":
        session.state.skipVerification = true;
        break;

      case "run":
        // Run the graph
        session.status = "running";

        try {
          for await (const update of runNegotiatorGraph(session.state)) {
            // Update session state
            session.state = { ...session.state, ...update.state };
            session.events.push(...update.events);
            session.lastUpdated = new Date();

            // Check for pause conditions
            if (session.state.shouldContinue === false) {
              session.status = "paused";
              break;
            }
          }

          if (session.status !== "paused") {
            session.status = "completed";
          }
        } catch (error) {
          session.status = "error";
          session.events.push({
            id: `error-${Date.now()}`,
            timestamp: new Date(),
            type: "agent_error",
            agent: session.state.currentAgent || "intake",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
        break;

      case "reset":
        // Reset session
        session.state = createInitialState(sessionId);
        session.events = [];
        session.status = "paused";
        break;

      default:
        return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    sessions.set(sessionId, session);

    return Response.json({
      sessionId,
      status: session.status,
      currentAgent: session.state.currentAgent,
      eventsCount: session.events.length,
      requirements: session.state.requirements,
      businesses: session.state.businesses?.length || 0,
      bestDeal: session.state.bestDeal,
      humanInterrupt: session.state.humanInterrupt?.active
        ? {
            question: session.state.humanInterrupt.vendorQuestion,
            reason: session.state.humanInterrupt.reason,
          }
        : null,
      callDecision: session.state.callDecision?.awaitingDecision
        ? {
            awaitingDecision: true,
            lastCallSummary: session.state.callDecision.lastCallSummary,
            vendorsRemaining: session.state.callDecision.vendorsRemaining,
            currentBestPrice: session.state.callDecision.currentBestPrice,
            currentBestVendor: session.state.callDecision.currentBestVendor,
          }
        : null,
    });
  } catch (error) {
    console.error("Agent stream error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Get session state
export async function PUT(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  return Response.json({
    sessionId,
    status: session.status,
    currentAgent: session.state.currentAgent,
    previousAgents: session.state.previousAgents,
    requirements: session.state.requirements,
    businesses: session.state.businesses,
    research: session.state.research,
    negotiation: session.state.negotiation,
    learning: session.state.learning,
    verification: session.state.verification,
    bestDeal: session.state.bestDeal,
    humanInterrupt: session.state.humanInterrupt,
    callDecision: session.state.callDecision,
    events: session.events.slice(-50), // Last 50 events
    lastUpdated: session.lastUpdated,
  });
}

// Delete session
export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  sessions.delete(sessionId);

  return Response.json({ success: true, sessionId });
}
