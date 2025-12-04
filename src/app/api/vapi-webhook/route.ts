import { NextRequest, NextResponse } from "next/server";

// In-memory store for pending HITL requests (in production, use Redis or database)
// Maps callId -> { question, timestamp, resolved, answer }
const pendingHITLRequests = new Map<
  string,
  {
    question: string;
    vendorName: string;
    timestamp: number;
    resolved: boolean;
    answer: string | null;
    toolCallId: string;
  }
>();

// Store for active call control URLs
const activeCallControls = new Map<
  string,
  {
    controlUrl: string;
    listenUrl: string;
  }
>();

// Export for use in other routes
export { pendingHITLRequests, activeCallControls };

// VAPI webhook handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messageType = body.message?.type;

    console.log(`[VAPI Webhook] Received: ${messageType}`);

    // Log full body for tool-calls to debug structure
    if (messageType === "tool-calls") {
      console.log(`[VAPI Webhook] Full tool-calls body:`, JSON.stringify(body, null, 2));
    }

    // Handle different message types
    switch (messageType) {
      case "tool-calls":
        return handleToolCalls(body);

      case "status-update":
        return handleStatusUpdate(body);

      case "end-of-call-report":
        return handleEndOfCall(body);

      case "transcript":
        // Real-time transcript updates - can be used for monitoring
        console.log(`[VAPI Webhook] Transcript update:`, body.message?.transcript);
        return NextResponse.json({ success: true });

      case "assistant-request":
        // Dynamic assistant configuration if needed
        return NextResponse.json({ success: true });

      default:
        console.log(`[VAPI Webhook] Unhandled message type: ${messageType}`);
        return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error("[VAPI Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

// Shared function to handle askHumanForDetails tool
async function handleAskHumanForDetails(
  callId: string,
  toolCallId: string,
  parameters: { question?: string; context?: string },
  call: { customer?: { name?: string } }
): Promise<{ toolCallId: string; result: string }> {
  const question = parameters.question || "Unknown question";
  const vendorName = call?.customer?.name || "Unknown vendor";

  // Store the pending request
  pendingHITLRequests.set(callId, {
    question,
    vendorName,
    timestamp: Date.now(),
    resolved: false,
    answer: null,
    toolCallId,
  });

  console.log(`[HITL] Pending request for call ${callId}: "${question}"`);

  // Wait for human response (with timeout)
  // VAPI times out at 20 seconds, so we use 15 seconds to leave buffer
  const answer = await waitForHumanResponse(callId, 15000); // 15 second timeout

  // Clean up
  pendingHITLRequests.delete(callId);

  if (answer) {
    console.log(`[HITL] Got human response for call ${callId}: "${answer}"`);
    return {
      toolCallId,
      result: answer, // VAPI expects result to be a simple string
    };
  } else {
    // Timeout - provide default response in Hinglish
    console.log(`[HITL] Timeout for call ${callId}, using default response`);
    return {
      toolCallId,
      result: "Main road pe pickup hoga, exact location main callback karte waqt bata dungi.",
    };
  }
}

// Handle tool calls - this is where HITL magic happens
async function handleToolCalls(body: unknown) {
  // Cast body to any for exploration
  const bodyAny = body as Record<string, unknown>;
  const message = bodyAny.message as Record<string, unknown> | undefined;

  // Log ALL keys to understand structure
  console.log(`[VAPI Webhook] Body keys:`, Object.keys(bodyAny));
  console.log(`[VAPI Webhook] Message keys:`, message ? Object.keys(message) : 'no message');

  // Try to find tool calls in various possible locations
  // VAPI sends toolCalls at root level OR inside message - check both
  const rootToolCalls = bodyAny.toolCalls as Array<Record<string, unknown>> | undefined;
  const messageToolCalls = message?.toolCalls as Array<Record<string, unknown>> | undefined;
  const toolCallList = message?.toolCallList as Array<Record<string, unknown>> | undefined;
  const toolWithToolCallList = message?.toolWithToolCallList as Array<Record<string, unknown>> | undefined;

  // Use whichever one has data
  const toolCalls = rootToolCalls || messageToolCalls;

  // Log what we found
  console.log(`[VAPI Webhook] rootToolCalls:`, rootToolCalls ? JSON.stringify(rootToolCalls).slice(0, 500) : 'undefined');
  console.log(`[VAPI Webhook] messageToolCalls:`, messageToolCalls ? JSON.stringify(messageToolCalls).slice(0, 500) : 'undefined');

  // VAPI sends tool calls in different formats - handle all
  const toolCallsList = toolCalls || toolCallList || [];
  const toolWithList = toolWithToolCallList || [];

  // Get call info - also check root level
  const rootCall = bodyAny.call as { id?: string; customer?: { name?: string } } | undefined;
  const messageCall = message?.call as { id?: string; customer?: { name?: string } } | undefined;
  const call = rootCall || messageCall;
  const callId = call?.id || "unknown";

  console.log(`[VAPI Webhook] handleToolCalls - callId: ${callId}`);
  console.log(`[VAPI Webhook] toolCalls count:`, toolCallsList.length);
  console.log(`[VAPI Webhook] toolWithToolCallList count:`, toolWithList.length);

  const results: Array<{ toolCallId: string; result: string }> = [];

  // Handle toolCalls format (newer format)
  for (const toolCall of toolCallsList) {
    // Log the raw tool call object
    console.log(`[VAPI Webhook] Raw toolCall object:`, JSON.stringify(toolCall).slice(0, 500));

    const toolCallTyped = toolCall as { id?: string; function?: { name?: string; arguments?: string | object } };
    const toolCallId = toolCallTyped.id || "unknown";
    const toolName = toolCallTyped.function?.name;
    let parameters: { question?: string; context?: string } = {};

    if (toolCallTyped.function?.arguments) {
      parameters = typeof toolCallTyped.function.arguments === 'string'
        ? JSON.parse(toolCallTyped.function.arguments)
        : toolCallTyped.function.arguments as { question?: string; context?: string };
    }

    console.log(`[VAPI Webhook] Tool call (toolCalls format): ${toolName}`, parameters);

    if (toolName === "askHumanForDetails") {
      const result = await handleAskHumanForDetails(callId, toolCallId, parameters, call || {});
      results.push(result);
    } else {
      results.push({
        toolCallId,
        result: "OK",
      });
    }
  }

  // Handle toolWithToolCallList format (older format)
  for (const toolData of toolWithList) {
    const toolDataTyped = toolData as {
      function?: { name?: string };
      name?: string;
      toolCall?: { id: string; function?: { arguments?: string | object }; parameters?: object }
    };
    const toolName = toolDataTyped.function?.name || toolDataTyped.name;
    const toolCallId = toolDataTyped.toolCall?.id || "unknown";
    let parameters: { question?: string; context?: string } = {};

    if (toolDataTyped.toolCall?.function?.arguments) {
      parameters = typeof toolDataTyped.toolCall.function.arguments === 'string'
        ? JSON.parse(toolDataTyped.toolCall.function.arguments)
        : toolDataTyped.toolCall.function.arguments as { question?: string; context?: string };
    } else if (toolDataTyped.toolCall?.parameters) {
      parameters = toolDataTyped.toolCall.parameters as { question?: string; context?: string };
    }

    console.log(`[VAPI Webhook] Tool call (toolWithToolCallList format): ${toolName}`, parameters);

    if (toolName === "askHumanForDetails") {
      const result = await handleAskHumanForDetails(callId, toolCallId, parameters, call || {});
      results.push(result);
    } else {
      results.push({
        toolCallId,
        result: "OK",
      });
    }
  }

  console.log(`[VAPI Webhook] Returning ${results.length} results`);
  return NextResponse.json({ results });
}

// Wait for human to provide answer
async function waitForHumanResponse(
  callId: string,
  timeoutMs: number
): Promise<string | null> {
  const startTime = Date.now();
  const pollInterval = 500; // Check every 500ms

  while (Date.now() - startTime < timeoutMs) {
    const request = pendingHITLRequests.get(callId);
    if (request?.resolved && request.answer) {
      return request.answer;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return null; // Timeout
}

// Handle status updates (call started, ringing, etc.)
function handleStatusUpdate(body: unknown) {
  const message = (body as { message?: { call?: { id?: string; monitor?: { controlUrl: string; listenUrl: string } }; status?: string } })?.message;
  const call = message?.call;
  const status = message?.status;

  console.log(`[VAPI Webhook] Call ${call?.id} status: ${status}`);

  // Store control URLs when call starts
  if (status === "in-progress" && call?.monitor && call.id) {
    activeCallControls.set(call.id, {
      controlUrl: call.monitor.controlUrl,
      listenUrl: call.monitor.listenUrl,
    });
    console.log(`[VAPI Webhook] Stored control URLs for call ${call.id}`);
  }

  return NextResponse.json({ success: true });
}

// Handle end of call
function handleEndOfCall(body: unknown) {
  const message = (body as { message?: { call?: { id?: string } } })?.message;
  const call = message?.call;
  const callId = call?.id;

  console.log(`[VAPI Webhook] Call ended: ${callId}`);

  // Clean up
  if (callId) {
    pendingHITLRequests.delete(callId);
    activeCallControls.delete(callId);
  }

  return NextResponse.json({ success: true });
}
