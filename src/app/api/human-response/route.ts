import { NextRequest, NextResponse } from "next/server";

// Store for human responses (shared with agent-stream)
// In production, use Redis or a database
const humanResponses = new Map<
  string,
  {
    interruptId: string;
    response: string;
    respondedAt: Date;
  }
>();

// Submit a human response for an interrupt
export async function POST(request: NextRequest) {
  try {
    const { sessionId, interruptId, response } = await request.json();

    if (!sessionId || !interruptId || !response) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, interruptId, response" },
        { status: 400 }
      );
    }

    // Store the response
    humanResponses.set(`${sessionId}:${interruptId}`, {
      interruptId,
      response,
      respondedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      sessionId,
      interruptId,
      message: "Response submitted successfully",
    });
  } catch (error) {
    console.error("Human response error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Get a human response (used by the agent)
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const interruptId = request.nextUrl.searchParams.get("interruptId");

  if (!sessionId || !interruptId) {
    return NextResponse.json(
      { error: "Missing sessionId or interruptId" },
      { status: 400 }
    );
  }

  const key = `${sessionId}:${interruptId}`;
  const response = humanResponses.get(key);

  if (!response) {
    return NextResponse.json({
      found: false,
      message: "No response yet",
    });
  }

  // Optionally remove after retrieval
  // humanResponses.delete(key);

  return NextResponse.json({
    found: true,
    response: response.response,
    respondedAt: response.respondedAt,
  });
}

// Export helper to check for response
export function getHumanResponse(
  sessionId: string,
  interruptId: string
): string | null {
  const key = `${sessionId}:${interruptId}`;
  const response = humanResponses.get(key);
  return response?.response || null;
}
