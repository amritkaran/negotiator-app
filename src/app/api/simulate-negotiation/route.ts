import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import {
  startSimulationLog,
  logSimulationMessage,
  completeSimulationLog,
  logError,
} from "@/lib/session-logger";
import { buildNegotiationPrompt, NegotiationPromptContext } from "@/lib/prompts/negotiation-prompt";

interface NegotiationContext {
  vendorName: string;
  vendorRating: number;
  vendorDistance: number;
  service: string;
  from: string;
  to: string;
  date?: string;
  time?: string;
  passengerCount?: number;
  vehicleType?: string;
  tripType?: string; // "one-way" or "round-trip"
  waitingTime?: number; // waiting time in minutes (for round trips)
  tollPreference?: string; // "ok" | "avoid" | "no-preference"
  specialInstructions?: string; // any special instructions for vendor
  luggageInfo?: string;
  expectedPriceLow: number;
  expectedPriceMid: number;
  expectedPriceHigh: number;
  targetPrice?: number; // Deprecated - use expectedPriceLow instead
  openingOffer?: number; // Deprecated - use market range + benchmark logic
  lowestPriceSoFar: number | null;
  bestVendorSoFar: string | null;
  vendorStrategy: string;
  callNumber: number;
  totalCalls: number;
}

interface Message {
  role: "agent" | "vendor";
  content: string;
  timestamp: Date;
  thinking?: string;
  needsHumanInput?: boolean;
  humanInputReason?: string;
}

/**
 * LLM-based vendor intent classification
 * Handles multilingual responses (English, Hindi, Kannada, Tamil, Hinglish, etc.)
 */
interface VendorIntent {
  intent: "agreement" | "refusal" | "counter_offer" | "question" | "information" | "unclear";
  confidence: number; // 0-1
  extractedPrice: number | null;
  agreedToPrice: number | null; // If vendor agreed to a specific price we proposed
  needsHumanInput: boolean;
  humanInputReason?: string;
  humanInputQuestion?: string;
  summary: string; // Brief English summary of what vendor said
  mentionsExtraCharges: boolean; // If vendor mentions toll, parking, or other extra charges
  extraChargeTypes?: string[]; // What types of extra charges were mentioned
}

/**
 * Classify vendor response intent using LLM
 * Works across languages: English, Hindi, Kannada, Tamil, Telugu, Hinglish, etc.
 */
async function classifyVendorIntent(
  vendorResponse: string,
  conversationHistory: Message[],
  agentProposedPrices: number[],
  context: NegotiationContext
): Promise<VendorIntent> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini", // Fast and cheap for classification
    temperature: 0
  });

  // Get last few messages for context
  const recentMessages = conversationHistory.slice(-4).map(m =>
    `${m.role === "agent" ? "Agent" : "Vendor"}: ${m.content}`
  ).join("\n");

  const lastAgentProposedPrice = agentProposedPrices.length > 0
    ? agentProposedPrices[agentProposedPrices.length - 1]
    : null;

  const prompt = `You are classifying a vendor's response in a price negotiation for cab/taxi services in India.
The conversation may be in English, Hindi, Kannada, Tamil, Telugu, or mixed (Hinglish).

CONTEXT:
- Service: ${context.service} from ${context.from} to ${context.to}
- Market price range: ₹${context.expectedPriceLow} - ₹${context.expectedPriceHigh}
${lastAgentProposedPrice ? `- Agent's last proposed price: ₹${lastAgentProposedPrice}` : "- Agent hasn't proposed a specific price yet"}
${context.lowestPriceSoFar ? `- Best quote from other vendors: ₹${context.lowestPriceSoFar}` : ""}

RECENT CONVERSATION:
${recentMessages}

VENDOR'S LATEST RESPONSE:
"${vendorResponse}"

Classify the vendor's intent into ONE of these categories:

1. "agreement" - Vendor is accepting/agreeing to a SPECIFIC price that the AGENT previously proposed
   - ONLY use this if the agent proposed a price (e.g., "can you do ₹800?") and vendor is agreeing to THAT EXACT price
   - Examples: "ok I'll do 800", "yes 800 is fine", "theek hai 800", "chalega", "done", "I can match that"
   - If vendor says "yes" but then mentions a DIFFERENT price (e.g., "yes I can do 1000"), this is counter_offer, NOT agreement

2. "refusal" - Vendor is firmly refusing to negotiate/lower price
   Examples: "no", "final price", "nahi hoga", "not possible", "ye hi rate hai", "kam nahi hoga"

3. "counter_offer" - Vendor is proposing a price (whether first quote or counter to agent's offer)
   - Use this for ANY response where vendor mentions a price they want
   - Examples: "I can do 450", "500 chalega", "best price 400", "it will be 1000", "yes I can offer 1000"
   - IMPORTANT: If vendor says "yes" but includes a price number, this is counter_offer NOT agreement

4. "question" - Vendor is asking a question that needs human input
   Examples: "where exactly?", "kahan jana hai?", "how many people?", "kitne log?", "AC or non-AC?"

   IMPORTANT - Questions that do NOT need human input (agent can deflect/handle):
   - "which provider/company gave you that quote?" → Agent can say "I don't recall the name" (this is agent's own tactic)
   - "who else are you talking to?" → Agent can deflect
   - "why do you need it?" → Agent can give generic answer
   - Questions about information the AGENT introduced (like competitor quotes) do NOT need human input

5. "information" - Vendor is providing information or availability
   Examples: "yes available", "we have Innova", "I'll send driver", "haan mil jayega"

6. "unclear" - Cannot determine intent clearly

EXTRA CHARGES DETECTION:
- Check if vendor mentions that the quoted price does NOT include everything
- Common extra charges: toll, parking, night charges, waiting charges, driver allowance, state tax
- Examples in various languages:
  - "1000 plus toll" / "1000 + toll and parking" / "toll extra"
  - "parking alag" / "toll alag se" / "extra charges for toll"
  - "base price 800, toll and parking separate"
  - "800 fare + toll charges"
- If vendor explicitly says price is all-inclusive, set mentionsExtraCharges: false

RESPOND IN THIS EXACT JSON FORMAT:
{
  "intent": "agreement|refusal|counter_offer|question|information|unclear",
  "confidence": 0.0-1.0,
  "extractedPrice": null or number (any price mentioned in vendor's response),
  "agreedToPrice": null or number (if vendor agreed to agent's proposed price of ₹${lastAgentProposedPrice || "N/A"}),
  "needsHumanInput": true/false (true ONLY if vendor asked about USER-SPECIFIC info like exact location, passenger count, vehicle preference. FALSE if question is about agent's own claims like competitor names/quotes),
  "humanInputReason": "category if needsHumanInput" (e.g., "exact_location", "passenger_count", "vehicle_type"). Use null for deflectable questions,
  "humanInputQuestion": "the question to ask user if needsHumanInput",
  "summary": "Brief English translation/summary of what vendor said",
  "mentionsExtraCharges": true/false (true if vendor indicates price does NOT include toll/parking/other extras),
  "extraChargeTypes": ["toll", "parking", etc] or null (list of extra charge types mentioned if any)
}`;

  try {
    const response = await model.invoke([
      new SystemMessage("You are a multilingual intent classifier for Indian cab booking negotiations. Always respond with valid JSON only, no other text."),
      new HumanMessage(prompt),
    ]);

    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[Intent Classifier] Failed to extract JSON from response:", content);
      return getDefaultIntent(vendorResponse);
    }

    const parsed = JSON.parse(jsonMatch[0]) as VendorIntent;
    console.log(`[Intent Classifier] "${vendorResponse}" → ${parsed.intent} (${(parsed.confidence * 100).toFixed(0)}%): ${parsed.summary}`);

    return parsed;
  } catch (error) {
    console.error("[Intent Classifier] Error:", error);
    return getDefaultIntent(vendorResponse);
  }
}

function getDefaultIntent(vendorResponse: string): VendorIntent {
  // Fallback: try basic price extraction at least
  const priceMatch = vendorResponse.match(/\b(\d{1,2},?\d{3}|\d{3,5})\b/);
  const extractedPrice = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) : null;

  // Check for extra charges mentions as fallback
  const extraChargesPatterns = /\b(toll|parking|extra|alag|separate|plus|additional|\+)\b/i;
  const mentionsExtraCharges = extraChargesPatterns.test(vendorResponse);

  return {
    intent: "unclear",
    confidence: 0.3,
    extractedPrice,
    agreedToPrice: null,
    needsHumanInput: false,
    summary: vendorResponse,
    mentionsExtraCharges,
    extraChargeTypes: mentionsExtraCharges ? ["unknown"] : undefined,
  };
}

// Store conversation state in memory (in production, use Redis/DB)
const conversationStore = new Map<string, {
  context: NegotiationContext;
  messages: Message[];
  phase: "greeting" | "inquiry" | "negotiation" | "closing" | "ended";
  quotedPrice: number | null;
  isComplete: boolean;
  customSystemPrompt?: string; // Custom prompt from learning feedback
  agentProposedPrices: number[]; // Track prices the agent has proposed to detect vendor agreement
  counterOfferCount: number; // Track how many counter-offers agent has made
  vendorRefusedCount: number; // Track how many times vendor has refused
  allInclusiveAsked: boolean; // Track if we've asked about all-inclusive pricing
  allInclusiveConfirmed: boolean; // Track if vendor confirmed all-inclusive
  vendorMentionedExtras: boolean; // Track if vendor mentioned extra charges (toll, parking, etc.)
  extraChargeTypes: string[]; // What extra charges were mentioned
}>();

// Session-level HITL cache - stores answers across ALL vendors in a session
// Key: sessionId, Value: Map of questionCategory -> answer
interface HITLCacheEntry {
  category: string;
  originalQuestion: string;
  answer: string;
  answeredAt: Date;
  vendorId: string; // Which vendor first asked this
}

const hitlCacheStore = new Map<string, Map<string, HITLCacheEntry>>();

// Get or create HITL cache for a session
function getSessionHITLCache(sessionId: string): Map<string, HITLCacheEntry> {
  if (!hitlCacheStore.has(sessionId)) {
    hitlCacheStore.set(sessionId, new Map());
  }
  return hitlCacheStore.get(sessionId)!;
}

// Normalize question to a category for cache matching
function normalizeToCategory(question: string, reason: string): string {
  // Use the reason as primary category since it's already well-defined
  const categoryMap: Record<string, string> = {
    "exact_pickup": "address",
    "exact_location": "address",
    "specific_landmark": "address",
    "exact_area": "address",
    "pickup_details": "address",
    "drop_details": "drop_address",
    "contact_info": "contact",
    "name": "customer_name",
    "passenger_count": "passengers",
    "vehicle_type": "vehicle",
    "vehicle_preference": "vehicle",
    "vehicle_model": "vehicle",
    "ac_preference": "ac_preference",
    "luggage_info": "luggage",
    "trip_type": "trip_type",
    "return_trip": "trip_type",
    "waiting_time": "waiting_time",
    "stops": "stops",
    "payment_method": "payment",
    "advance_payment": "advance_payment",
    "child_seat": "child_seat",
    "special_needs": "special_needs",
    "vendor_question": "general",
    "vendor_needs_clarification": "clarification",
    "clarification_needed": "clarification",
  };

  return categoryMap[reason] || reason;
}

// Check if we have a cached answer for this type of question
function checkHITLCache(
  sessionId: string,
  reason: string
): HITLCacheEntry | null {
  const cache = getSessionHITLCache(sessionId);
  const category = normalizeToCategory("", reason);
  return cache.get(category) || null;
}

// Store answer in HITL cache
function storeInHITLCache(
  sessionId: string,
  vendorId: string,
  reason: string,
  question: string,
  answer: string
): void {
  const cache = getSessionHITLCache(sessionId);
  const category = normalizeToCategory(question, reason);

  cache.set(category, {
    category,
    originalQuestion: question,
    answer,
    answeredAt: new Date(),
    vendorId,
  });

  console.log(`[HITL Cache] Stored answer for category "${category}" in session ${sessionId}: "${answer}"`);
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let action = "unknown";

  try {
    const body = await request.json();
    action = body.action;
    const { sessionId, vendorId, vendorResponse, context, systemPrompt } = body;

    // Log all API calls for debugging
    console.log(`[simulate-negotiation] Action: ${action}, Session: ${sessionId}, Vendor: ${vendorId}`);

    if (action === "start") {
      // Start a new simulated negotiation
      const result = await startNegotiation(sessionId, vendorId, context, systemPrompt);
      console.log(`[simulate-negotiation] ${action} completed in ${Date.now() - startTime}ms`);
      return result;
    } else if (action === "respond") {
      // Process vendor's response and generate agent's reply
      if (!vendorResponse || vendorResponse.trim() === "") {
        console.warn(`[simulate-negotiation] Empty vendor response received`);
        return NextResponse.json({ error: "Vendor response cannot be empty" }, { status: 400 });
      }
      const result = await processVendorResponse(sessionId, vendorId, vendorResponse);
      console.log(`[simulate-negotiation] ${action} completed in ${Date.now() - startTime}ms`);
      return result;
    } else if (action === "human_input") {
      // User provides answer to agent's question, then agent continues
      const result = await processHumanInput(sessionId, vendorId, body.humanResponse);
      console.log(`[simulate-negotiation] ${action} completed in ${Date.now() - startTime}ms`);
      return result;
    } else if (action === "end") {
      // End the call and extract results
      const result = await endCall(sessionId, vendorId, body.finalPrice, body.notes);
      console.log(`[simulate-negotiation] ${action} completed in ${Date.now() - startTime}ms`);
      return result;
    } else if (action === "get_state") {
      // Get current conversation state (fast - no LLM call)
      return getState(sessionId, vendorId);
    } else if (action === "debug_all") {
      // Debug: Get all conversations in memory (fast - no LLM call)
      return debugGetAllConversations();
    }

    console.warn(`[simulate-negotiation] Invalid action: ${action}`);
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error(`[simulate-negotiation] Error in ${action}:`, error);

    // Log error to persistent storage
    const body = await request.clone().json().catch(() => ({}));
    const sessionId = body.sessionId || "unknown";
    try {
      await logError(
        sessionId,
        `simulate-negotiation.${action}`,
        error instanceof Error ? error : String(error)
      );
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Simulation failed" },
      { status: 500 }
    );
  }
}

async function startNegotiation(
  sessionId: string,
  vendorId: string,
  context: NegotiationContext,
  customPrompt?: string
) {
  const key = `${sessionId}:${vendorId}`;

  // Generate opening message from agent
  const model = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0.7 });

  // Use custom prompt from learning feedback if provided, otherwise use default
  const systemPrompt = customPrompt
    ? buildCustomizedPrompt(customPrompt, context)
    : buildAgentSystemPrompt(context);

  const isFirstVendor = !context.lowestPriceSoFar;
  const thinkingPrompt = `You are about to call ${context.vendorName} for a ${context.service} booking.

Context:
- This is call ${context.callNumber} of ${context.totalCalls}
- Market rate range: ₹${context.expectedPriceLow} - ₹${context.expectedPriceHigh}
${isFirstVendor
    ? "- This is the FIRST call - no benchmark yet. Use market range for negotiation."
    : `- Current benchmark: ₹${context.lowestPriceSoFar} (from ${context.bestVendorSoFar}). Use this as your leverage.`}
- Vendor strategy: ${context.vendorStrategy}

What's your approach for this call? Think step by step about:
1. How to greet professionally
2. Get their quote FIRST - never reveal budget upfront
3. ${isFirstVendor
    ? `If quote > ₹${context.expectedPriceHigh}: counter with ₹${context.expectedPriceHigh}. If in range: try for ₹${context.expectedPriceLow}. If below range: ask if final.`
    : `If quote > benchmark ₹${context.lowestPriceSoFar}: mention benchmark. If at/below: ask if final, mention long-term interest.`}

Respond with a brief internal thought (2-3 sentences).`;

  const thinkingResponse = await model.invoke([
    new SystemMessage("You are an AI negotiation strategist. Provide brief internal reasoning."),
    new HumanMessage(thinkingPrompt),
  ]);

  const thinking = typeof thinkingResponse.content === "string"
    ? thinkingResponse.content
    : JSON.stringify(thinkingResponse.content);

  // Generate greeting
  const greetingResponse = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage("Start the call with a professional greeting. Ask if they provide the service and if they're available. Keep it brief and natural."),
  ]);

  const greeting = typeof greetingResponse.content === "string"
    ? greetingResponse.content
    : JSON.stringify(greetingResponse.content);

  const conversation = {
    context,
    messages: [{
      role: "agent" as const,
      content: greeting,
      timestamp: new Date(),
      thinking,
    }],
    phase: "greeting" as const,
    quotedPrice: null,
    isComplete: false,
    customSystemPrompt: customPrompt, // Store for use in subsequent calls
    agentProposedPrices: [] as number[], // Track prices agent proposes
    counterOfferCount: 0, // Track counter-offers made
    vendorRefusedCount: 0, // Track vendor refusals
    allInclusiveAsked: false, // Track if we've asked about all-inclusive pricing
    allInclusiveConfirmed: false, // Track if vendor confirmed all-inclusive
    vendorMentionedExtras: false, // Track if vendor mentioned extra charges
    extraChargeTypes: [], // What extra charges were mentioned
  };

  conversationStore.set(key, conversation);

  // Log to persistent storage
  try {
    await startSimulationLog(sessionId, vendorId, context.vendorName, context.expectedPriceLow);
    await logSimulationMessage(sessionId, vendorId, "agent", greeting, thinking);
  } catch (logError) {
    console.error("[simulate-negotiation] Failed to write log:", logError);
  }

  return NextResponse.json({
    success: true,
    message: greeting,
    thinking,
    phase: "greeting",
    agentInfo: {
      marketRange: `₹${context.expectedPriceLow} - ₹${context.expectedPriceHigh}`,
      benchmark: context.lowestPriceSoFar ? `₹${context.lowestPriceSoFar} (${context.bestVendorSoFar})` : null,
      isFirstVendor,
      strategy: context.vendorStrategy,
    },
  });
}

async function processVendorResponse(
  sessionId: string,
  vendorId: string,
  vendorResponse: string
) {
  const key = `${sessionId}:${vendorId}`;
  const conversation = conversationStore.get(key);

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Add vendor message
  conversation.messages.push({
    role: "vendor",
    content: vendorResponse,
    timestamp: new Date(),
  });

  // === LLM-BASED INTENT CLASSIFICATION ===
  // Works for multilingual responses (English, Hindi, Kannada, Tamil, Hinglish, etc.)
  const vendorIntent = await classifyVendorIntent(
    vendorResponse,
    conversation.messages,
    conversation.agentProposedPrices,
    conversation.context
  );

  // Extract price from LLM classification (more reliable for multilingual)
  let extractedPrice = vendorIntent.extractedPrice;

  // If vendor agreed to our proposed price, use that
  if (vendorIntent.agreedToPrice !== null) {
    extractedPrice = vendorIntent.agreedToPrice;
    console.log(`[Negotiation] LLM detected vendor agreed to ₹${extractedPrice}`);
  }

  // Update quoted price if we got one
  if (extractedPrice) {
    conversation.quotedPrice = extractedPrice;
  }

  // Determine intent-based flags
  const isVendorAgreeing = vendorIntent.intent === "agreement";
  const vendorRefused = vendorIntent.intent === "refusal";
  const isCounterOffer = vendorIntent.intent === "counter_offer";

  // Track if vendor mentioned extra charges (toll, parking, etc.)
  if (vendorIntent.mentionsExtraCharges) {
    conversation.vendorMentionedExtras = true;
    if (vendorIntent.extraChargeTypes && vendorIntent.extraChargeTypes.length > 0) {
      // Merge with existing extra charge types
      const existingTypes = new Set(conversation.extraChargeTypes);
      vendorIntent.extraChargeTypes.forEach(type => existingTypes.add(type));
      conversation.extraChargeTypes = Array.from(existingTypes);
    }
    console.log(`[Negotiation] Vendor mentioned extra charges: ${conversation.extraChargeTypes.join(", ")}`);
  }

  // SAFETY CHECK: Filter out deflectable questions that should NEVER trigger HITL
  // These are questions about information the agent itself introduced (like competitor quotes)
  const deflectableCategories = [
    "competitor_name", "competitor_quote", "other_provider", "provider_name",
    "which_provider", "who_gave_quote", "company_name", "other_company"
  ];
  const deflectablePatterns = [
    /which.*provider/i, /which.*company/i, /who.*quote/i, /who.*offer/i,
    /competitor/i, /other.*vendor/i, /other.*cab/i, /kis.*company/i, /kaun.*quote/i
  ];

  let needsHumanInputFromLLM = vendorIntent.needsHumanInput;

  // Override HITL if the question is about agent's own tactics (deflectable)
  if (needsHumanInputFromLLM && vendorIntent.humanInputReason) {
    const reasonLower = vendorIntent.humanInputReason.toLowerCase();
    const questionLower = (vendorIntent.humanInputQuestion || vendorIntent.summary || "").toLowerCase();

    const isDeflectable = deflectableCategories.some(cat => reasonLower.includes(cat)) ||
      deflectablePatterns.some(pat => pat.test(questionLower) || pat.test(reasonLower));

    if (isDeflectable) {
      console.log(`[HITL Override] Deflectable question detected: "${vendorIntent.humanInputQuestion}" (reason: ${vendorIntent.humanInputReason}). Agent will handle without user input.`);
      needsHumanInputFromLLM = false;
    }
  }

  // Determine phase based on conversation (pass LLM price for multilingual support)
  const phase = determinePhase(conversation, vendorResponse, extractedPrice);
  conversation.phase = phase;

  // Generate agent response with thinking
  const model = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0.7 });

  // Use custom prompt from learning feedback if stored, otherwise use default
  const systemPrompt = conversation.customSystemPrompt
    ? buildCustomizedPrompt(conversation.customSystemPrompt, conversation.context)
    : buildAgentSystemPrompt(conversation.context);

  // Build conversation history for context
  const historyMessages = conversation.messages.map(m =>
    m.role === "agent"
      ? new AIMessage(m.content)
      : new HumanMessage(`[Vendor says]: ${m.content}`)
  );

  // Prepare human input check (use LLM result, then check cache)
  let humanInputCheck: { needsHuman: boolean; reason: string; question: string; knownAnswer?: string } = {
    needsHuman: needsHumanInputFromLLM,
    reason: vendorIntent.humanInputReason || "vendor_question",
    question: vendorIntent.humanInputQuestion || vendorIntent.summary,
  };

  // CHECK HITL CACHE: If question needs human input, check if we already have an answer cached
  if (humanInputCheck.needsHuman && vendorIntent.humanInputReason) {
    const cachedAnswer = checkHITLCache(sessionId, vendorIntent.humanInputReason);
    if (cachedAnswer) {
      console.log(`[HITL Cache HIT] Found cached answer for "${vendorIntent.humanInputReason}": "${cachedAnswer.answer}" (originally answered for vendor ${cachedAnswer.vendorId})`);
      // Use cached answer instead of asking human again
      humanInputCheck = {
        needsHuman: false,
        reason: vendorIntent.humanInputReason,
        question: humanInputCheck.question,
        knownAnswer: cachedAnswer.answer,
      };
    }
  }

  // Generate thinking
  const thinkingPrompt = buildThinkingPrompt(conversation, vendorResponse, extractedPrice, humanInputCheck);

  const thinkingResponse = await model.invoke([
    new SystemMessage("You are an AI negotiation strategist analyzing the conversation. Provide brief internal reasoning about what to do next."),
    new HumanMessage(thinkingPrompt),
  ]);

  const thinking = typeof thinkingResponse.content === "string"
    ? thinkingResponse.content
    : JSON.stringify(thinkingResponse.content);

  let response: string;
  let needsHumanInput = false;
  let humanInputReason = "";

  // Track vendor refusals (but NOT if vendor is actually agreeing to our price)
  if (vendorRefused && !isVendorAgreeing) {
    conversation.vendorRefusedCount = (conversation.vendorRefusedCount || 0) + 1;
    console.log(`[Negotiation] Vendor refused (count: ${conversation.vendorRefusedCount})`);
  }

  // Check repetition (still useful as a safeguard)
  const repetitionCheck = checkAgentRepetition(conversation.messages);

  // Check if vendor agreed to a price we proposed - this is a SUCCESS, not a refusal
  const vendorAgreedToOurPrice = isVendorAgreeing &&
    conversation.agentProposedPrices.length > 0 &&
    extractedPrice !== null &&
    conversation.agentProposedPrices.includes(extractedPrice);

  // Force graceful exit if:
  // - Vendor has refused once AND we already have a quoted price (no point pushing further)
  // - OR vendor refused twice (even without explicit quote)
  // - OR agent is stuck in a loop
  // BUT NOT if vendor just agreed to our proposed price!
  // AND NOT if this is the first quote from vendor (we should negotiate, not exit immediately)
  const hasQuote = conversation.quotedPrice !== null || extractedPrice !== null;
  const isFirstQuote = !conversation.quotedPrice && extractedPrice !== null;
  const shouldForceExit = !vendorAgreedToOurPrice && !isFirstQuote && (
    (vendorRefused && !isVendorAgreeing && hasQuote) ||  // Vendor refused once and we have a price - accept it
    (conversation.vendorRefusedCount >= 2) ||  // Vendor refused twice - give up
    (repetitionCheck.repeatCount >= 2 || repetitionCheck.isRepeating)  // Agent looping
  );

  // Debug logging for exit conditions
  if (shouldForceExit) {
    console.log(`[Negotiation Debug] Force exit triggered:`, {
      vendorAgreedToOurPrice,
      isFirstQuote,
      vendorRefused,
      isVendorAgreeing,
      hasQuote,
      vendorRefusedCount: conversation.vendorRefusedCount,
      repeatCount: repetitionCheck.repeatCount,
      isRepeating: repetitionCheck.isRepeating,
      quotedPrice: conversation.quotedPrice,
      extractedPrice,
    });
  }

  if (humanInputCheck.needsHuman) {
    // Agent needs to ask user for input (no cached answer available)
    needsHumanInput = true;
    humanInputReason = humanInputCheck.reason;
    response = `[NEEDS USER INPUT] The vendor is asking: "${humanInputCheck.question}"\n\nI don't have this information. Please provide an answer to continue the negotiation.`;
  } else if (shouldForceExit) {
    // Vendor has refused and we've tried enough - exit gracefully
    const finalPrice = conversation.quotedPrice || extractedPrice;
    if (finalPrice) {
      response = `I understand your position. Thank you for your time and the quote of ₹${finalPrice}. I'll consider it and get back to you if we're interested. Have a great day!`;
    } else {
      response = `I understand. Thank you for your time. I appreciate you speaking with me. Have a great day!`;
    }
    console.log(`[Negotiation] Forcing graceful exit - vendor refused (repeatCount: ${repetitionCheck.repeatCount})`);
  } else {
    // Generate normal response - pass known answer if available
    // Also pass deflectable question info if vendor asked about something agent should handle itself
    const deflectableQuestion = vendorIntent.intent === "question" && !needsHumanInputFromLLM
      ? vendorIntent.humanInputQuestion || vendorIntent.summary
      : undefined;
    const responsePrompt = buildResponsePrompt(
      conversation,
      phase,
      extractedPrice,
      humanInputCheck.knownAnswer,
      vendorRefused,
      deflectableQuestion,
      vendorIntent.mentionsExtraCharges,
      vendorIntent.extraChargeTypes
    );

    const agentResponse = await model.invoke([
      new SystemMessage(systemPrompt),
      ...historyMessages,
      new HumanMessage(responsePrompt),
    ]);

    response = typeof agentResponse.content === "string"
      ? agentResponse.content
      : JSON.stringify(agentResponse.content);
  }

  // Add agent message
  conversation.messages.push({
    role: "agent",
    content: response,
    timestamp: new Date(),
    thinking,
    needsHumanInput,
    humanInputReason,
  });

  // Track any price the agent proposed in this response
  // This helps detect when vendor agrees to our proposed price later
  if (!needsHumanInput) {
    const agentProposedPrice = extractPrice(response);
    if (agentProposedPrice && !conversation.agentProposedPrices.includes(agentProposedPrice)) {
      conversation.agentProposedPrices.push(agentProposedPrice);
      conversation.counterOfferCount = (conversation.counterOfferCount || 0) + 1;
      console.log(`[Negotiation] Agent proposed price ₹${agentProposedPrice} (counter-offer #${conversation.counterOfferCount})`);
    }

    // Track if agent asked about all-inclusive pricing
    const allInclusivePatterns = [
      /all.?inclusive/i,
      /no extra.?charge/i,
      /include.?everything/i,
      /covers? everything/i,
      /any.?extra/i,
      /additional.?charge/i,
      /toll|parking|night.?charge/i
    ];
    if (allInclusivePatterns.some(p => p.test(response))) {
      conversation.allInclusiveAsked = true;
      console.log(`[Negotiation] Agent asked about all-inclusive pricing`);
    }
  }

  // Track if vendor confirmed all-inclusive (check vendor's response if we asked)
  if (conversation.allInclusiveAsked && !conversation.allInclusiveConfirmed) {
    const vendorLower = vendorResponse.toLowerCase();
    const confirmationPatterns = [
      /^yes/i, /^ok/i, /^sure/i, /^correct/i, /^right/i,
      /include/i, /all.?in/i, /no extra/i, /everything/i,
      /haan/i, /theek/i, /sab/i, /total/i
    ];
    if (confirmationPatterns.some(p => p.test(vendorLower))) {
      conversation.allInclusiveConfirmed = true;
      console.log(`[Negotiation] Vendor confirmed all-inclusive pricing`);
    }
  }

  // Check if call should end (only if not waiting for human input)
  const shouldEnd = !needsHumanInput && checkIfShouldEnd(response, phase);
  if (shouldEnd) {
    conversation.isComplete = true;
    conversation.phase = "ended";
  }

  conversationStore.set(key, conversation);

  // Log to persistent storage
  try {
    await logSimulationMessage(sessionId, vendorId, "vendor", vendorResponse);
    await logSimulationMessage(sessionId, vendorId, "agent", response, thinking);
  } catch (err) {
    console.error("[simulate-negotiation] Failed to write log:", err);
  }

  return NextResponse.json({
    success: true,
    message: response,
    thinking,
    phase: conversation.phase,
    extractedPrice,
    quotedPrice: conversation.quotedPrice,
    isComplete: conversation.isComplete,
    needsHumanInput,
    humanInputReason,
    agentInfo: {
      marketRange: `₹${conversation.context.expectedPriceLow} - ₹${conversation.context.expectedPriceHigh}`,
      benchmark: conversation.context.lowestPriceSoFar
        ? `₹${conversation.context.lowestPriceSoFar} (${conversation.context.bestVendorSoFar})`
        : null,
      isFirstVendor: !conversation.context.lowestPriceSoFar,
      strategy: conversation.context.vendorStrategy,
    },
    turnCount: conversation.messages.filter(m => m.role === "agent").length,
  });
}

async function processHumanInput(
  sessionId: string,
  vendorId: string,
  humanResponse: string
) {
  const key = `${sessionId}:${vendorId}`;
  const conversation = conversationStore.get(key);

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Get the last agent message to find the humanInputReason
  const lastAgentMsg = conversation.messages.filter(m => m.role === "agent").pop();
  const humanInputReason = lastAgentMsg?.humanInputReason || "general";

  // Get the last vendor question for context
  const lastVendorMsg = conversation.messages.filter(m => m.role === "vendor").pop();
  const vendorQuestion = lastVendorMsg?.content || "";

  // STORE IN HITL CACHE: Save this answer for future vendors in the same session
  storeInHITLCache(sessionId, vendorId, humanInputReason, vendorQuestion, humanResponse);

  // Generate agent's response to vendor using the human's input
  const model = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0.7 });

  // Use custom prompt from learning feedback if stored, otherwise use default
  const systemPrompt = conversation.customSystemPrompt
    ? buildCustomizedPrompt(conversation.customSystemPrompt, conversation.context)
    : buildAgentSystemPrompt(conversation.context);

  // Build conversation history
  const historyMessages = conversation.messages.slice(0, -1).map(m =>
    m.role === "agent"
      ? new AIMessage(m.content)
      : new HumanMessage(`[Vendor says]: ${m.content}`)
  );

  // Generate thinking
  const thinkingPrompt = `The vendor asked: "${vendorQuestion}"
My user provided this answer: "${humanResponse}"

How should I respond to the vendor incorporating this information naturally?
Brief analysis (1-2 sentences):`;

  const thinkingResponse = await model.invoke([
    new SystemMessage("You are an AI negotiation strategist. Provide brief internal reasoning."),
    new HumanMessage(thinkingPrompt),
  ]);

  const thinking = typeof thinkingResponse.content === "string"
    ? thinkingResponse.content
    : JSON.stringify(thinkingResponse.content);

  // Generate response incorporating the human input
  const responsePrompt = `The vendor asked: "${vendorQuestion}"
My user told me: "${humanResponse}"

Respond to the vendor naturally, incorporating this information. Keep it brief and conversational. Then continue negotiating or ask about pricing if appropriate.`;

  const agentResponse = await model.invoke([
    new SystemMessage(systemPrompt),
    ...historyMessages,
    new HumanMessage(responsePrompt),
  ]);

  const response = typeof agentResponse.content === "string"
    ? agentResponse.content
    : JSON.stringify(agentResponse.content);

  // Remove the last message (which was the [NEEDS USER INPUT] message) and add the real response
  conversation.messages.pop();
  conversation.messages.push({
    role: "agent",
    content: response,
    timestamp: new Date(),
    thinking,
    needsHumanInput: false,
  });

  conversationStore.set(key, conversation);

  // Log the agent's response after HITL to persistent storage
  try {
    await logSimulationMessage(sessionId, vendorId, "agent", response, thinking);
  } catch (err) {
    console.error("[simulate-negotiation] Failed to log HITL response:", err);
  }

  return NextResponse.json({
    success: true,
    message: response,
    thinking,
    phase: conversation.phase,
    quotedPrice: conversation.quotedPrice,
    isComplete: false,
    needsHumanInput: false,
    agentInfo: {
      marketRange: `₹${conversation.context.expectedPriceLow} - ₹${conversation.context.expectedPriceHigh}`,
      benchmark: conversation.context.lowestPriceSoFar
        ? `₹${conversation.context.lowestPriceSoFar} (${conversation.context.bestVendorSoFar})`
        : null,
      isFirstVendor: !conversation.context.lowestPriceSoFar,
      strategy: conversation.context.vendorStrategy,
    },
    turnCount: conversation.messages.filter(m => m.role === "agent").length,
  });
}

async function endCall(
  sessionId: string,
  vendorId: string,
  finalPrice: number | null,
  notes: string
) {
  const key = `${sessionId}:${vendorId}`;
  const conversation = conversationStore.get(key);

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  conversation.isComplete = true;
  conversation.phase = "ended";

  if (finalPrice) {
    conversation.quotedPrice = finalPrice;
  }

  conversationStore.set(key, conversation);

  const finalQuotedPrice = conversation.quotedPrice || finalPrice;
  const success = (finalQuotedPrice || 0) <= conversation.context.expectedPriceMid;

  // Log completion to persistent storage
  try {
    await completeSimulationLog(sessionId, vendorId, finalQuotedPrice, success, notes);
  } catch (err) {
    console.error("[simulate-negotiation] Failed to write completion log:", err);
  }

  return NextResponse.json({
    success: true,
    result: {
      vendorId,
      vendorName: conversation.context.vendorName,
      quotedPrice: finalQuotedPrice,
      targetPrice: conversation.context.targetPrice,
      success,
      notes,
      turnCount: conversation.messages.length,
      messages: conversation.messages,
    },
  });
}

async function getState(sessionId: string, vendorId: string) {
  const key = `${sessionId}:${vendorId}`;
  const conversation = conversationStore.get(key);

  if (!conversation) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    messages: conversation.messages,
    phase: conversation.phase,
    quotedPrice: conversation.quotedPrice,
    isComplete: conversation.isComplete,
    context: conversation.context,
  });
}

function debugGetAllConversations() {
  const allConversations: Record<string, {
    vendorName: string;
    phase: string;
    quotedPrice: number | null;
    isComplete: boolean;
    messageCount: number;
    messages: Array<{
      role: string;
      content: string;
      thinking?: string;
    }>;
    pricesDetected: number[];
  }> = {};

  conversationStore.forEach((conv, key) => {
    // Extract all prices mentioned in the conversation
    const pricesDetected: number[] = [];
    conv.messages.forEach(msg => {
      if (msg.role === "vendor") {
        const price = extractPrice(msg.content);
        if (price) pricesDetected.push(price);
      }
    });

    allConversations[key] = {
      vendorName: conv.context.vendorName,
      phase: conv.phase,
      quotedPrice: conv.quotedPrice,
      isComplete: conv.isComplete,
      messageCount: conv.messages.length,
      messages: conv.messages.map(m => ({
        role: m.role,
        content: m.content,
        thinking: m.thinking,
      })),
      pricesDetected,
    };
  });

  return NextResponse.json({
    totalConversations: conversationStore.size,
    conversations: allConversations,
  });
}

function buildAgentSystemPrompt(context: NegotiationContext): string {
  // Build the shared prompt context from the negotiation context
  const promptContext: NegotiationPromptContext = {
    agentName: "Preet",
    vendorName: context.vendorName,
    service: context.service,
    from: context.from,
    to: context.to,
    date: context.date,
    time: context.time,
    passengerCount: context.passengerCount,
    vehicleType: context.vehicleType,
    tripType: (context.tripType as "one-way" | "round-trip") || "one-way",
    waitingTime: context.waitingTime,
    tollPreference: context.tollPreference as "ok" | "avoid" | "no-preference" | undefined,
    specialInstructions: context.specialInstructions,
    expectedPriceLow: context.expectedPriceLow,
    expectedPriceMid: context.expectedPriceMid,
    expectedPriceHigh: context.expectedPriceHigh,
    lowestPriceSoFar: context.lowestPriceSoFar || undefined,
    bestVendorSoFar: context.bestVendorSoFar || undefined,
    language: "english", // Simulator uses English for text-based chat
    hitlMode: "dialog", // Simulator uses dialog-based HITL (shows [NEEDS USER INPUT] messages)
  };

  return buildNegotiationPrompt(promptContext);
}

/**
 * Build a prompt using the learning-generated template with context substitution
 */
function buildCustomizedPrompt(template: string, context: NegotiationContext): string {
  // Build booking details section
  const bookingDetails = [
    `Service: ${context.service}`,
    `From: ${context.from}`,
    `To: ${context.to}`,
    context.date ? `Date: ${context.date}` : null,
    context.time ? `Time: ${context.time}` : null,
    context.passengerCount ? `Passengers: ${context.passengerCount}` : null,
    context.vehicleType ? `Vehicle: ${context.vehicleType}` : null,
  ].filter(Boolean).join("\n");

  // Build benchmark info
  const benchmarkInfo = context.lowestPriceSoFar
    ? `- Best price from other vendors: ₹${context.lowestPriceSoFar} (from ${context.bestVendorSoFar})`
    : "- This is the first vendor call, no benchmark yet";

  // Replace all placeholders
  let prompt = template
    .replace(/\{vendorName\}/g, context.vendorName || "the vendor")
    .replace(/\{service\}/g, context.service || "service")
    .replace(/\{from\}/g, context.from || "")
    .replace(/\{to\}/g, context.to || "")
    .replace(/\{date\}/g, context.date || "")
    .replace(/\{time\}/g, context.time || "")
    .replace(/\{vehicleType\}/g, context.vehicleType || "cab")
    .replace(/\{passengerCount\}/g, String(context.passengerCount || 1))
    .replace(/\{expectedPriceLow\}/g, String(context.expectedPriceLow))
    .replace(/\{expectedPriceMid\}/g, String(context.expectedPriceMid))
    .replace(/\{expectedPriceHigh\}/g, String(context.expectedPriceHigh))
    .replace(/\{targetPrice\}/g, String(context.targetPrice))
    .replace(/\{openingOffer\}/g, String(context.openingOffer))
    .replace(/\{lowestPriceSoFar\}/g, String(context.lowestPriceSoFar || "N/A"))
    .replace(/\{bestVendorSoFar\}/g, context.bestVendorSoFar || "N/A")
    .replace(/\{bookingDetails\}/g, bookingDetails)
    .replace(/\{benchmarkInfo\}/g, benchmarkInfo)
    .replace(/\{vendorStrategy\}/g, context.vendorStrategy || "Standard approach");

  // Add current context as header if not already in the prompt
  if (!prompt.includes("CURRENT CALL CONTEXT")) {
    prompt = `CURRENT CALL CONTEXT:
- Vendor: ${context.vendorName}
- Call ${context.callNumber} of ${context.totalCalls}
${benchmarkInfo}

${prompt}`;
  }

  return prompt;
}

function checkIfNeedsHumanInput(
  vendorResponse: string,
  context: NegotiationContext
): { needsHuman: boolean; reason: string; question: string; knownAnswer?: string } {
  const response = vendorResponse.toLowerCase();

  // ===========================================
  // GENERAL CONFUSION/FRUSTRATION DETECTION
  // If vendor seems confused, frustrated, or unsatisfied - ALWAYS ask human
  // ===========================================

  const confusionPatterns = [
    // Vendor is confused or doesn't understand
    /what do you mean/,
    /i don't understand/,
    /i didn't get that/,
    /can you (explain|clarify|repeat|be more specific)/,
    /sorry\?|pardon\?|what\?/,
    /that doesn't make sense/,
    /i'm confused/,
    /not sure what you/,

    // Vendor is frustrated or skeptical
    /are you (a bot|ai|robot|machine|automated)/,
    /is this (a bot|ai|robot|automated|real person)/,
    /you('re| are) (not|aren't) (listening|understanding|making sense)/,
    /i (already|just) (told|said|mentioned)/,
    /as i (said|mentioned|told)/,
    /like i said/,
    /i repeat/,
    /listen to me/,
    /pay attention/,

    // Vendor is asking for something specific we can't provide
    /what (exactly|specifically|precisely)/,
    /where (exactly|specifically|precisely)/,
    /which (exactly|specifically)/,
    /(exact|specific|precise) (address|location|place|time|details)/,
    /more (details|information|specifics)/,
    /can you (share|give|provide|tell).*(details|specifics|information)/,

    // Vendor is pushing back or challenging
    /that's not (right|correct|possible|true)/,
    /that (doesn't|won't) work/,
    /i (can't|cannot) (do|accept|agree)/,
    /why (should|would) i/,
    /no way/,
    /impossible/,

    // Vendor wants confirmation or commitment we can't give
    /do you (want|need) (to book|to confirm|this)/,
    /are you (booking|confirming|sure|serious)/,
    /should i (book|confirm|reserve|hold)/,
    /let me (book|confirm|reserve)/,
    /i('ll| will) (book|confirm|reserve) (it|this|now)/,
  ];

  for (const pattern of confusionPatterns) {
    if (pattern.test(response)) {
      // Extract the vendor's question/statement for context
      const questionMatch = vendorResponse.match(/[^.!]*[.!?]?$/);
      const vendorStatement = questionMatch ? questionMatch[0].trim() : vendorResponse;
      return {
        needsHuman: true,
        reason: "vendor_needs_clarification",
        question: `The vendor said: "${vendorStatement}"\n\nHow should I respond?`
      };
    }
  }

  // ===========================================
  // STANDARD INFORMATION REQUESTS
  // ===========================================

  // Helper to check if we already have this info in context
  const hasPassengerInfo = context.passengerCount !== undefined && context.passengerCount > 0;
  const hasVehicleInfo = context.vehicleType !== undefined && context.vehicleType !== "";
  const hasTripTypeInfo = context.tripType !== undefined && context.tripType !== "";
  const hasLuggageInfo = context.luggageInfo !== undefined && context.luggageInfo !== "";
  const hasDateTimeInfo = context.date !== undefined || context.time !== undefined;
  const hasFromToInfo = context.from !== undefined && context.to !== undefined;

  // Questions that require human input - but check context first
  const questionPatterns = [
    // Passenger/person details - SKIP if we have passenger count
    {
      pattern: /how many (passengers?|people|persons?|travelers?)/,
      reason: "passenger_count",
      question: "How many passengers?",
      skipIf: hasPassengerInfo,
      autoAnswer: hasPassengerInfo ? `${context.passengerCount} passenger${context.passengerCount! > 1 ? 's' : ''}` : undefined
    },

    // Vehicle type questions - SKIP if we have vehicle type
    {
      pattern: /(\d+)\s*(seater|seat)/,
      reason: "vehicle_type",
      question: "What type of vehicle do you need?",
      skipIf: hasVehicleInfo,
      autoAnswer: hasVehicleInfo ? context.vehicleType : undefined
    },
    {
      pattern: /which (car|vehicle|type)/,
      reason: "vehicle_preference",
      question: "Which type of vehicle?",
      skipIf: hasVehicleInfo,
      autoAnswer: hasVehicleInfo ? context.vehicleType : undefined
    },
    {
      pattern: /ac or non[- ]?ac/,
      reason: "ac_preference",
      question: "Do you want AC or Non-AC?",
      skipIf: false, // Always ask - we don't track AC preference
      autoAnswer: undefined
    },
    {
      pattern: /(sedan|suv|innova|swift|etios).*\?/,
      reason: "vehicle_model",
      question: "Which vehicle model do you prefer?",
      skipIf: hasVehicleInfo,
      autoAnswer: hasVehicleInfo ? context.vehicleType : undefined
    },

    // Luggage/items
    {
      pattern: /how much (luggage|baggage|bags?)/,
      reason: "luggage_info",
      question: "How much luggage will you have?",
      skipIf: hasLuggageInfo,
      autoAnswer: hasLuggageInfo ? context.luggageInfo : undefined
    },
    {
      pattern: /any (luggage|baggage|bags?|items?)\?/,
      reason: "luggage_info",
      question: "Do you have any luggage?",
      skipIf: hasLuggageInfo,
      autoAnswer: hasLuggageInfo ? context.luggageInfo : undefined
    },

    // Trip details - SKIP if we have trip type
    {
      pattern: /one[- ]?way or (round[- ]?trip|return)/,
      reason: "trip_type",
      question: "Is this a one-way trip or round-trip?",
      skipIf: hasTripTypeInfo,
      autoAnswer: hasTripTypeInfo ? context.tripType : undefined
    },
    {
      pattern: /(return|come back|round[- ]?trip).*\?/,
      reason: "return_trip",
      question: "Do you need a return trip?",
      skipIf: hasTripTypeInfo,
      autoAnswer: hasTripTypeInfo ? (context.tripType === "round-trip" ? "Yes" : "No, one-way only") : undefined
    },
    {
      pattern: /how long.*wait/,
      reason: "waiting_time",
      question: "How long should the driver wait?",
      skipIf: false,
      autoAnswer: undefined
    },
    {
      pattern: /multiple stops?|stopovers?/,
      reason: "stops",
      question: "Do you need any stops along the way?",
      skipIf: false,
      autoAnswer: undefined
    },

    // Contact/booking - always need human input for these
    {
      pattern: /your (phone|mobile|contact|number)/,
      reason: "contact_info",
      question: "What is your contact number?",
      skipIf: false,
      autoAnswer: undefined
    },
    {
      pattern: /your (name|full name)/,
      reason: "name",
      question: "What name should I book under?",
      skipIf: false,
      autoAnswer: undefined
    },
    // EXACT/SPECIFIC location requests - ALWAYS ask human (area names aren't enough)
    {
      pattern: /(exact|specific|precise).*(pick[- ]?up|pickup|location|address|place)/,
      reason: "exact_pickup",
      question: "What is the exact pickup address?",
      skipIf: false, // NEVER skip - vendor needs specific address
      autoAnswer: undefined
    },
    {
      pattern: /specific.*(location|address|place|point)/,
      reason: "exact_location",
      question: "What is the exact address/location?",
      skipIf: false,
      autoAnswer: undefined
    },
    {
      pattern: /where\s*(exactly|precisely)/,
      reason: "exact_location",
      question: "What is the exact location?",
      skipIf: false,
      autoAnswer: undefined
    },
    {
      pattern: /which\s*(building|apartment|flat|house|society|complex|landmark)/,
      reason: "specific_landmark",
      question: "Which specific building/landmark?",
      skipIf: false,
      autoAnswer: undefined
    },
    // Vendor asking for clarification - needs human input
    {
      pattern: /what do you mean/,
      reason: "clarification_needed",
      question: "The vendor needs clarification. What should I tell them?",
      skipIf: false,
      autoAnswer: undefined
    },
    {
      pattern: /can you (be more specific|clarify|explain)/,
      reason: "clarification_needed",
      question: "The vendor needs more details. What should I say?",
      skipIf: false,
      autoAnswer: undefined
    },
    {
      pattern: /where (exactly|specifically) in/,
      reason: "exact_area",
      question: "Where exactly? The vendor needs a more specific location.",
      skipIf: false,
      autoAnswer: undefined
    },
    // General pickup/drop location - can use area name if available
    {
      pattern: /(pick[- ]?up|pickup) (address|location|point)/,
      reason: "pickup_details",
      question: "What is the exact pickup address?",
      skipIf: hasFromToInfo,
      autoAnswer: hasFromToInfo ? context.from : undefined
    },
    {
      pattern: /(drop|destination) (address|location|point)/,
      reason: "drop_details",
      question: "What is the exact drop address?",
      skipIf: hasFromToInfo,
      autoAnswer: hasFromToInfo ? context.to : undefined
    },

    // Payment - always need human input
    {
      pattern: /(cash|card|upi|online|payment method).*\?/,
      reason: "payment_method",
      question: "What is your preferred payment method?",
      skipIf: false,
      autoAnswer: undefined
    },
    {
      pattern: /(advance|token|booking amount).*\?/,
      reason: "advance_payment",
      question: "Are you okay with paying an advance?",
      skipIf: false,
      autoAnswer: undefined
    },

    // Special requirements
    {
      pattern: /(child seat|baby seat|infant)/,
      reason: "child_seat",
      question: "Do you need a child seat?",
      skipIf: false,
      autoAnswer: undefined
    },
    {
      pattern: /(wheelchair|special assistance)/,
      reason: "special_needs",
      question: "Do you need any special assistance?",
      skipIf: false,
      autoAnswer: undefined
    },
  ];

  for (const { pattern, reason, question, skipIf, autoAnswer } of questionPatterns) {
    if (pattern.test(response)) {
      // If we already have this info, return with the known answer so agent can respond
      if (skipIf && autoAnswer) {
        return { needsHuman: false, reason, question, knownAnswer: autoAnswer };
      }
      // If we don't have this info, ask the human
      if (!skipIf) {
        return { needsHuman: true, reason, question };
      }
    }
  }

  // Check for generic question marks with question words
  // But be more selective - only trigger for questions we truly can't answer
  const genericQuestionPatterns = [
    { pattern: /what.*your.*name/, skip: false },
    { pattern: /what.*contact/, skip: false },
    { pattern: /how (many|much)/, skip: hasPassengerInfo }, // Skip if we know passenger count
    { pattern: /which.*vehicle/, skip: hasVehicleInfo }, // Skip if we know vehicle type
  ];

  // Only trigger if it looks like a specific question that needs an answer
  // AND we don't already have the information
  if (response.includes("?")) {
    // First check if it's a question about something we already know
    const isAboutPassengers = /passenger|people|person|traveler/i.test(response);
    const isAboutVehicle = /vehicle|car|sedan|suv|cab|taxi/i.test(response);
    const isAboutTrip = /one.?way|round.?trip|return/i.test(response);

    // If vendor is asking about something we already know, don't ask human
    if (isAboutPassengers && hasPassengerInfo) {
      return { needsHuman: false, reason: "passenger_count", question: "", knownAnswer: `${context.passengerCount} passenger${context.passengerCount! > 1 ? 's' : ''}` };
    }
    if (isAboutVehicle && hasVehicleInfo) {
      return { needsHuman: false, reason: "vehicle_type", question: "", knownAnswer: context.vehicleType };
    }
    if (isAboutTrip && hasTripTypeInfo) {
      return { needsHuman: false, reason: "trip_type", question: "", knownAnswer: context.tripType };
    }

    // For other generic questions, check if we really need human input
    for (const { pattern, skip } of genericQuestionPatterns) {
      if (pattern.test(response) && !skip) {
        const questionMatch = vendorResponse.match(/[^.!]*\?/);
        const extractedQuestion = questionMatch ? questionMatch[0].trim() : vendorResponse;
        return {
          needsHuman: true,
          reason: "vendor_question",
          question: extractedQuestion
        };
      }
    }
  }

  return { needsHuman: false, reason: "", question: "" };
}

function buildThinkingPrompt(
  conversation: { context: NegotiationContext; messages: Message[]; quotedPrice: number | null },
  vendorResponse: string,
  extractedPrice: number | null,
  humanInputCheck?: { needsHuman: boolean; reason: string; question: string; knownAnswer?: string }
): string {
  const ctx = conversation.context;
  const isFirstVendor = !ctx.lowestPriceSoFar;
  const benchmark = ctx.lowestPriceSoFar;

  let prompt = `Current negotiation state:
- Vendor: ${ctx.vendorName}
- Market range: ₹${ctx.expectedPriceLow} - ₹${ctx.expectedPriceHigh}
${isFirstVendor ? "- This is FIRST vendor (no benchmark yet)" : `- Benchmark: ₹${benchmark}`}
- Quoted price so far: ${conversation.quotedPrice ? `₹${conversation.quotedPrice}` : "Not quoted yet"}
${extractedPrice ? `- Price mentioned in last response: ₹${extractedPrice}` : ""}
${ctx.passengerCount ? `- Passengers: ${ctx.passengerCount}` : ""}
${ctx.vehicleType ? `- Vehicle type: ${ctx.vehicleType}` : ""}
${ctx.tripType ? `- Trip type: ${ctx.tripType}` : ""}

Vendor just said: "${vendorResponse}"
${humanInputCheck?.needsHuman ? `\n⚠️ VENDOR IS ASKING A QUESTION I CAN'T ANSWER: "${humanInputCheck.question}"\nI need to ask my user for this information before I can respond.` : ""}
${humanInputCheck?.knownAnswer ? `\n✓ Vendor asked a question I CAN answer: I know the answer is "${humanInputCheck.knownAnswer}"` : ""}

Analyze:
1. Did they quote a price? ${extractedPrice ? (isFirstVendor
    ? `Compare to market range (₹${ctx.expectedPriceLow}-₹${ctx.expectedPriceHigh})`
    : `Compare to benchmark (₹${benchmark})`) : ""}
2. ${humanInputCheck?.needsHuman ? "I need human input to answer this question." : humanInputCheck?.knownAnswer ? `I should provide the answer: "${humanInputCheck.knownAnswer}"` : "What negotiation tactic should I use next?"}
3. Should I counter, accept, or end the call?

Brief analysis (2-3 sentences):`;

  return prompt;
}

function buildResponsePrompt(
  conversation: { context: NegotiationContext; messages: Message[]; quotedPrice: number | null; phase: string; agentProposedPrices?: number[]; counterOfferCount?: number; allInclusiveAsked?: boolean; allInclusiveConfirmed?: boolean; vendorMentionedExtras?: boolean; extraChargeTypes?: string[] },
  phase: string,
  extractedPrice: number | null,
  knownAnswer?: string,
  vendorRefused?: boolean,
  deflectableQuestion?: string,
  vendorMentionedExtrasNow?: boolean,
  extraChargeTypes?: string[]
): string {
  const ctx = conversation.context;
  const isFirstVendor = !ctx.lowestPriceSoFar;
  const benchmark = ctx.lowestPriceSoFar;
  const agentProposedPrices = conversation.agentProposedPrices || [];
  const counterOfferCount = conversation.counterOfferCount || 0;
  const currentPrice = extractedPrice || conversation.quotedPrice;
  const allInclusiveConfirmed = conversation.allInclusiveConfirmed || false;
  const vendorMentionedExtras = vendorMentionedExtrasNow || conversation.vendorMentionedExtras || false;
  const chargeTypes = extraChargeTypes || conversation.extraChargeTypes || [];

  // If we have a known answer, incorporate it
  const answerPrefix = knownAnswer
    ? `The vendor asked a question. Answer with: "${knownAnswer}". Then `
    : "";

  // IMPORTANT: Add instruction about all-inclusive if already confirmed
  const allInclusiveNote = allInclusiveConfirmed
    ? `IMPORTANT: You have ALREADY confirmed that the price is all-inclusive with no extra charges. Do NOT ask about all-inclusive pricing again. `
    : "";

  // CRITICAL: If vendor mentioned extra charges (toll, parking, etc.), ASK for all-inclusive price
  if (vendorMentionedExtras && !allInclusiveConfirmed && chargeTypes.length > 0) {
    const extrasText = chargeTypes.join(", ");
    const priceInfo = extractedPrice || conversation.quotedPrice;
    const priceText = priceInfo ? `₹${priceInfo}` : "that price";
    return answerPrefix + `IMPORTANT: The vendor mentioned that ${extrasText} are EXTRA charges on top of ${priceText}. You MUST ask for the total all-inclusive price. Say: "I see. So ${priceText} is the base fare plus ${extrasText} extra. Can you give me the total all-inclusive price including all charges? I prefer to know the complete cost upfront." Do NOT accept a quote without knowing the total all-inclusive price.`;
  }

  // Handle deflectable questions (questions about agent's own tactics like competitor names)
  if (deflectableQuestion) {
    const deflectionPrefix = `The vendor asked: "${deflectableQuestion}". This is about information YOU introduced as a negotiation tactic (like competitor quotes), so DEFLECT politely. Say something like "I don't recall the name right now" or "I've been talking to a few providers" - do NOT make up specific names. Then continue with the negotiation. `;
    return allInclusiveNote + deflectionPrefix + answerPrefix;
  }

  // If vendor has refused to negotiate, guide toward graceful exit
  if (vendorRefused) {
    const priceInfo = extractedPrice || conversation.quotedPrice;
    if (priceInfo) {
      return allInclusiveNote + answerPrefix + `The vendor has indicated their price is final and they won't negotiate further. Accept this gracefully. Say something like: "I understand. Thank you for the quote of ₹${priceInfo}. I'll consider it and get back to you if we proceed. Have a great day!" Do NOT ask for a lower price again.`;
    } else {
      return allInclusiveNote + answerPrefix + `The vendor has indicated they won't negotiate. End politely: "I understand. Thank you for your time. Have a great day!" Do NOT ask about price again.`;
    }
  }

  // CRITICAL: Check if vendor agreed to a price WE proposed
  // If so, accept immediately - do NOT ask for a better price (that's bad faith negotiation)
  if (extractedPrice && agentProposedPrices.length > 0) {
    const vendorAgreedToOurPrice = agentProposedPrices.includes(extractedPrice);
    if (vendorAgreedToOurPrice) {
      console.log(`[Negotiation] Vendor agreed to our proposed price of ₹${extractedPrice} - accepting immediately`);
      if (allInclusiveConfirmed) {
        // All-inclusive already confirmed, just wrap up
        return allInclusiveNote + answerPrefix + `IMPORTANT: The vendor agreed to ₹${extractedPrice}. You have already confirmed all-inclusive pricing. Now end the call politely: "Great, thank you for the quote of ₹${extractedPrice}. I'll discuss with my customer and get back to you. Have a great day!"`;
      } else {
        return answerPrefix + `IMPORTANT: The vendor agreed to ₹${extractedPrice} which YOU proposed earlier. Accept this gracefully - do NOT ask for a better price or say "is this your final price" as that would be bad faith negotiation. Say something like: "Perfect, ₹${extractedPrice} works for me. Just to confirm - this includes everything, no extra charges?" Keep the conversation going to confirm details, do NOT end the call yet.`;
      }
    }
  }

  // CRITICAL: If we've already made a counter-offer and vendor responded with a price,
  // don't make another counter-offer - accept or gracefully close
  // BUT ONLY if this is truly a response to our counter-offer, not the FIRST quote from vendor
  const isFirstQuoteFromVendor = !conversation.quotedPrice && extractedPrice;
  if (counterOfferCount >= 1 && currentPrice && !isFirstQuoteFromVendor) {
    console.log(`[Negotiation] Already made ${counterOfferCount} counter-offer(s), accepting current price of ₹${currentPrice}`);
    if (allInclusiveConfirmed) {
      return allInclusiveNote + answerPrefix + `You've already made a counter-offer and confirmed all-inclusive pricing. The vendor's current price is ₹${currentPrice}. End politely: "Thank you for the quote of ₹${currentPrice}. I'll discuss with my customer and get back to you. Have a great day!"`;
    } else {
      return answerPrefix + `You've already made a counter-offer. The vendor's current price is ₹${currentPrice}. Do NOT counter again or ask "what's your rate" - you already know the rate. Accept gracefully: "Alright, ₹${currentPrice} works. Just to confirm - this includes everything, no extra charges? I'll check with my customer and get back to you to confirm. Thank you!" Do NOT ask for a better price.`;
    }
  }

  if (phase === "greeting") {
    return answerPrefix + "Respond to their greeting and ask about availability. Ask: 'What would be your rate for this trip?' WAIT for their quote - do NOT mention any price yourself.";
  }

  if (phase === "inquiry") {
    return answerPrefix + "Ask about the price: 'What would you charge for this trip?' WAIT for their quote - do NOT reveal any budget or price yourself.";
  }

  if (phase === "negotiation") {
    if (extractedPrice) {
      if (isFirstVendor) {
        // FIRST VENDOR LOGIC - Use research price range
        if (extractedPrice > ctx.expectedPriceHigh) {
          // Price ABOVE market range - suggest budget is expectedPriceHigh
          return answerPrefix + `They quoted ₹${extractedPrice} which is above market range (₹${ctx.expectedPriceLow}-₹${ctx.expectedPriceHigh}). Say: "That's a bit higher than I expected. My budget is around ₹${ctx.expectedPriceHigh}. Can you work with that?" If they say no or it's fixed, thank them politely and END the call - don't keep asking.`;
        } else if (extractedPrice >= ctx.expectedPriceLow) {
          // Price WITHIN market range - try for expectedPriceLow
          return answerPrefix + `They quoted ₹${extractedPrice} which is within market range. Say: "I was hoping for something around ₹${ctx.expectedPriceLow}. Is that possible?" One counter is enough - if they refuse, accept gracefully and end.`;
        } else {
          // Price BELOW market range - great deal, ask if final
          return answerPrefix + `They quoted ₹${extractedPrice} which is BELOW market range - great deal! Say: "That sounds reasonable. Is this your final price, or can you do any better? I'm looking for a long-term arrangement." Don't push too hard.`;
        }
      } else {
        // SUBSEQUENT VENDOR LOGIC - Use benchmark
        if (extractedPrice > benchmark!) {
          // Price ABOVE benchmark - use benchmark as leverage
          return answerPrefix + `They quoted ₹${extractedPrice} which is above your benchmark of ₹${benchmark}. Say: "I've already received a quote of ₹${benchmark} from another provider. Can you match that?" If they say no or can't match, thank them and END politely - don't keep pushing.`;
        } else {
          // Price AT or BELOW benchmark - good deal, ask if final
          return answerPrefix + `They quoted ₹${extractedPrice} which matches or beats your benchmark of ₹${benchmark}. Say: "That's competitive. Is this your final price? I'm looking for a long-term relationship and would appreciate your best rate." This is a good deal - don't push too hard.`;
        }
      }
    }
    // If we're in negotiation but don't have an extracted price, check if we already have a quoted price
    if (conversation.quotedPrice) {
      return answerPrefix + `You already have a quote of ₹${conversation.quotedPrice}. Do NOT ask for the rate again. Either make one counter-offer or accept the price gracefully.`;
    }
    return answerPrefix + "Ask for the price: 'What would be your rate for this trip?' and WAIT for their quote. NEVER mention any price, budget, or number first - let them quote first.";
  }

  if (phase === "closing") {
    return allInclusiveNote + answerPrefix + "End the call politely. Say EXACTLY: 'Thank you for the quote. I'll discuss with my customer and call back to confirm.' DO NOT book, confirm, or ask for driver details.";
  }

  // Default: if we have a quoted price, don't ask for rate again
  if (currentPrice) {
    if (allInclusiveConfirmed) {
      return allInclusiveNote + answerPrefix + `You have a quote of ₹${currentPrice} and have confirmed all-inclusive pricing. End politely: "Thank you for the quote. I'll discuss with my customer and get back to you."`;
    }
    return allInclusiveNote + answerPrefix + `You have a quote of ₹${currentPrice}. Respond appropriately - do NOT ask for the rate again. Either negotiate briefly or accept gracefully.`;
  }
  return answerPrefix + "Respond appropriately. If vendor hasn't quoted a price yet, ask 'What would be your rate?' and wait for their quote. Do NOT mention any price yourself.";
}

function extractPrice(text: string, baselinePrice?: { low: number; mid: number; high: number } | null): number | null {
  // Match patterns like: 1200, 1,200, Rs 1200, Rs. 1200, ₹1200, 1200 rupees, etc.
  // IMPORTANT: Handle comma-formatted numbers like "1,200" or "10,000"

  const allPrices: number[] = [];

  // Helper to parse price string (handles commas)
  const parsePrice = (priceStr: string): number => {
    return parseInt(priceStr.replace(/,/g, ""), 10);
  };

  // Number pattern that handles optional comma formatting: matches "1200", "1,200", "10,000"
  const numPattern = "\\d{1,2},?\\d{3}|\\d{3,5}";

  const patterns = [
    // Currency symbols with numbers (most specific) - handles comma formatting
    new RegExp(`₹\\s*(${numPattern})`, "gi"),
    new RegExp(`rs\\.?\\s*(${numPattern})`, "gi"),
    new RegExp(`inr\\.?\\s*(${numPattern})`, "gi"),

    // Price followed by currency/unit
    new RegExp(`(${numPattern})\\s*(?:rupees?|rs\\.?|inr|only|\\/\\-)`, "gi"),

    // Common price phrases - "charges are 1,200" or "cost is 1200"
    new RegExp(`(?:price|cost|charges?|fare|rate|quote|offer|amount)\\s+(?:is|are|will be)?\\s*(${numPattern})`, "gi"),
    new RegExp(`(?:will be|is|it's|its|that's|thats|for)\\s*(${numPattern})`, "gi"),
    new RegExp(`(?:final|best|lowest|last)\\s*(${numPattern})`, "gi"),
    new RegExp(`(?:i can do|can do|do it for|give you|offer|do)\\s*(${numPattern})`, "gi"),

    // Standalone number (3-5 digits, possibly with comma)
    new RegExp(`\\b(${numPattern})\\b`, "g"),
  ];

  // Extract all potential prices from the text
  for (const pattern of patterns) {
    let match;
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) {
        const price = parsePrice(match[1]);
        // Valid price range for Indian cab services
        if (price >= 100 && price <= 50000) {
          // Avoid duplicates
          if (!allPrices.includes(price)) {
            allPrices.push(price);
          }
        }
      }
    }
  }

  if (allPrices.length === 0) {
    return null;
  }

  // Filter prices based on baseline if available (sanity check)
  // A realistic price should be within 30% below to 100% above the baseline low price
  let plausiblePrices = allPrices;
  if (baselinePrice && baselinePrice.low > 0) {
    const minPlausible = baselinePrice.low * 0.3; // Allow 70% discount as absolute minimum
    const maxPlausible = baselinePrice.high * 2.0; // Allow up to 2x high estimate

    plausiblePrices = allPrices.filter(p => p >= minPlausible && p <= maxPlausible);

    // If no prices pass the baseline sanity check, log warning but return largest as fallback
    if (plausiblePrices.length === 0) {
      console.warn(`[extractPrice] All extracted prices (${allPrices.join(', ')}) are outside plausible range [${minPlausible}-${maxPlausible}] based on baseline. Returning largest as fallback.`);
      return Math.max(...allPrices);
    }
  }

  // Return the most likely price:
  // - If there are multiple prices, prefer ones in typical cab fare range (500-5000)
  // - Otherwise return the largest valid price (to avoid partial number matches)
  const typicalRangePrices = plausiblePrices.filter(p => p >= 500 && p <= 5000);
  if (typicalRangePrices.length > 0) {
    return Math.max(...typicalRangePrices);
  }

  // Return the largest plausible price found
  return Math.max(...plausiblePrices);
}

function determinePhase(
  conversation: { messages: Message[]; quotedPrice: number | null; phase: string },
  vendorResponse: string,
  llmExtractedPrice?: number | null // Use LLM-extracted price for multilingual support
): "greeting" | "inquiry" | "negotiation" | "closing" | "ended" {
  const messageCount = conversation.messages.length;
  // Use LLM-extracted price if available, otherwise fall back to regex (for English)
  const hasPrice = conversation.quotedPrice !== null ||
    llmExtractedPrice !== null ||
    (llmExtractedPrice === undefined && extractPrice(vendorResponse) !== null);

  // Check for ending indicators (vendor response - may be multilingual, but these are common)
  // Note: Most call endings are initiated by agent (English), so this is a minor issue
  const endIndicators = ["call back", "confirm", "thank you", "bye", "talk later", "ok", "done"];
  const isEnding = endIndicators.some(ind => vendorResponse.toLowerCase().includes(ind));

  if (isEnding && hasPrice) return "closing";
  if (hasPrice) return "negotiation";
  if (messageCount <= 2) return "greeting";
  if (messageCount <= 4) return "inquiry";
  return "negotiation";
}

function checkIfShouldEnd(agentResponse: string, phase: string): boolean {
  const response = agentResponse.toLowerCase();

  // Positive endings - got a quote and wrapping up
  const gotQuotePhrases = [
    "thank you for the quote",
    "thanks for the quote",
    "i'll discuss with",
    "will discuss with",
    "get back to you",
    "call back to confirm",
    "check with my customer",
    "discuss with my customer",
    "i'll consider",
    "will consider",
    "appreciate your time",
    "appreciate the offer",
    "have a great day",
    "have a good day"
  ];

  // Negative endings - declined the offer
  const declinedPhrases = [
    "have to pass",
    "won't work for me",
    "too high for me",
    "higher than our budget",
    "can't do that",
    "will have to decline",
    "thank you for your time",
    "thanks for your time",
    "outside my budget",
    "beyond my budget",
    "i understand",
    "understand your position"
  ];

  // Check if we got a quote and are wrapping up, or declined
  const gotQuote = gotQuotePhrases.some(p => response.includes(p));
  const isDeclined = declinedPhrases.some(p => response.includes(p));

  return gotQuote || isDeclined;
}

/**
 * Check if vendor is clearly refusing to negotiate further
 */
function checkVendorRefusal(vendorResponse: string): boolean {
  const response = vendorResponse.toLowerCase();

  const refusalPatterns = [
    // Explicit refusals
    /(?:price|rate|this) is (?:final|fixed)/,
    /(?:no|not) (?:possible|negotiable)/,
    /(?:cannot|can't|won't) (?:reduce|lower|match|go lower|do that|bargain)/,
    /(?:we|i) (?:don't|do not) (?:bargain|negotiate)/,
    /(?:sorry|no),? (?:this is|that's) (?:final|my (?:best|final|last))/,
    /(?:final|best|last|lowest) (?:price|rate|offer)/,
    /(?:take it or leave it)/,
    /(?:no discount|no reduction)/,
    /premium (?:service|cab)/,
    /(?:we offer|this is) premium/,
    // Additional patterns for common refusals
    /\b(?:mine|this|that|it) is final\b/,
    /\bwill be final\b/,
    /\bis final\b/,
    /\bfinal\s*$/,  // Response ends with "final"
    /\bno\s*$/,     // Just "no" as response
    /\bcan'?t do\b/,
    /\bnot possible\b/,
    /\bbest i can\b/,
    /\bcan'?t go lower\b/,
    /\blowest\s*$/,  // Response ends with "lowest"
  ];

  return refusalPatterns.some(pattern => pattern.test(response));
}

/**
 * Check if agent is repeating itself (stuck in a loop)
 * Only count genuine repetitions, not normal conversation flow
 */
function checkAgentRepetition(messages: Message[]): { isRepeating: boolean; repeatCount: number } {
  const agentMessages = messages
    .filter(m => m.role === "agent" && !m.content.includes("[NEEDS USER INPUT]")) // Exclude HITL messages
    .map(m => m.content.toLowerCase());

  if (agentMessages.length < 3) {
    return { isRepeating: false, repeatCount: 0 };
  }

  // Check for similar consecutive messages (asking same thing)
  // Only check the last 3 messages, not 4
  const recentMessages = agentMessages.slice(-3);

  // Phrases that indicate asking for price/rate SPECIFICALLY (not general conversation)
  const priceAskPatterns = [
    "what would be your rate",
    "what's the price",
    "what can you offer",
    "what's your rate",
    "what is your rate",
    "your rate for this",
  ];

  // Only count if the SAME pattern appears multiple times
  let repeatCount = 0;
  for (const msg of recentMessages) {
    if (priceAskPatterns.some(p => msg.includes(p))) {
      repeatCount++;
    }
  }

  // If agent asked about rate 3+ times (in last 3 messages), it's truly repeating
  return { isRepeating: repeatCount >= 3, repeatCount };
}
