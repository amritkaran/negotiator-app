/**
 * Synthetic Vendor Simulator
 *
 * Creates simulated vendors based on personas for eval testing
 * Can generate realistic conversations to test the negotiation bot
 */

import {
  VendorPersona,
  ObjectionType,
  PERSONA_TEMPLATES,
  getPersonaTemplate,
} from "./vendor-persona";

// Conversation turn in a simulated call
export interface ConversationTurn {
  speaker: "bot" | "vendor";
  text: string;
  intent?: string; // What the speaker is trying to achieve
  timestamp: number; // Relative time in seconds
}

// Simulated call result
export interface SimulatedCallResult {
  persona: VendorPersona;
  conversation: ConversationTurn[];
  outcome: {
    quoteObtained: boolean;
    firstOffer: number | null;
    finalPrice: number | null;
    priceReduced: boolean;
    priceReductionPercent: number | null;
    negotiationRounds: number;
    callDuration: number; // seconds
    endedBy: "bot" | "vendor";
    endReason: string;
  };
  evalMetrics: {
    quoteObtainedRate: number; // 0 or 1
    negotiationSuccess: number; // 0 or 1 (price reduced)
    priceReductionPercent: number | null;
    conversationNaturalness: number; // 0-100
  };
}

// Vendor simulator context
export interface VendorSimulatorContext {
  persona: VendorPersona;
  tripDetails: {
    from: string;
    to: string;
    date: string;
    time: string;
    distance: number; // km
    vehicleType?: string;
    tripType?: "one-way" | "round-trip";
  };
  marketPrice: {
    low: number;
    mid: number;
    high: number;
  };
  currentState: {
    quotedPrice: number | null;
    currentOffer: number | null;
    negotiationRound: number;
    objectionsUsed: ObjectionType[];
    mood: "neutral" | "positive" | "negative" | "frustrated";
  };
}

// Generate synthetic vendor response using LLM
export async function generateVendorResponse(
  context: VendorSimulatorContext,
  botMessage: string,
  conversationHistory: ConversationTurn[]
): Promise<{ response: string; newPrice: number | null; intent: string }> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const persona = context.persona;

  // Calculate vendor's target price based on persona
  const markup = persona.typicalFirstOfferMarkup / 100;
  const firstOfferPrice = Math.round(context.marketPrice.mid * (1 + markup) / 50) * 50;
  const minimumPrice = Math.round(firstOfferPrice * (1 - persona.minimumAcceptableDiscount / 100) / 50) * 50;

  // Build conversation history string
  const historyStr = conversationHistory
    .map(t => `${t.speaker === "bot" ? "Bot" : "Vendor"}: ${t.text}`)
    .join("\n");

  const prompt = `You are simulating a cab vendor with the following personality:

VENDOR PERSONA: ${persona.name}
- Negotiation Style: ${persona.negotiationStyle} - ${persona.description}
- Communication Style: ${persona.communicationStyle}
- Language: ${persona.languageMix} (respond in appropriate mix of Hindi/English)
- Typical Objections: ${persona.commonObjections.join(", ")}
- Deal Closing: ${persona.dealClosingBehavior}

TRIP DETAILS:
- From: ${context.tripDetails.from}
- To: ${context.tripDetails.to}
- Date: ${context.tripDetails.date}, Time: ${context.tripDetails.time}
- Distance: ~${context.tripDetails.distance} km
- Vehicle: ${context.tripDetails.vehicleType || "sedan"}
- Trip Type: ${context.tripDetails.tripType || "one-way"}

PRICING STRATEGY:
- Market Price Range: ₹${context.marketPrice.low} - ₹${context.marketPrice.high}
- Your First Offer: ₹${firstOfferPrice} (start here if not quoted yet)
- Your Minimum (don't go below): ₹${minimumPrice}
- Current Quote Given: ${context.currentState.quotedPrice ? `₹${context.currentState.quotedPrice}` : "Not yet quoted"}
- Negotiation Round: ${context.currentState.negotiationRound}
- Current Mood: ${context.currentState.mood}

SAMPLE PHRASES (use similar style):
- Greeting: ${persona.responsePatterns.greeting.join(" / ")}
- Price Quote: ${persona.responsePatterns.priceQuote.join(" / ")}
- Rejection: ${persona.responsePatterns.rejection.join(" / ")}
- Acceptance: ${persona.responsePatterns.acceptance.join(" / ")}

CONVERSATION SO FAR:
${historyStr || "(Call just started)"}

BOT'S LATEST MESSAGE: "${botMessage}"

Respond as the vendor. Remember:
1. Stay in character based on your persona
2. Use ${persona.languageMix === "pure_hindi" ? "Hindi" : persona.languageMix === "pure_english" ? "English" : "Hinglish"}
3. If asked for price and haven't quoted, start with ₹${firstOfferPrice}
4. If bot counter-offers, react based on your ${persona.negotiationStyle} style
5. Don't go below ₹${minimumPrice}
6. Use objections like: ${persona.commonObjections.slice(0, 2).join(", ")} when appropriate

Respond in JSON:
{
  "response": "Your response in appropriate language",
  "newPrice": number | null (if you're quoting or changing price),
  "intent": "greeting" | "quoting" | "rejecting_offer" | "counter_offering" | "accepting" | "objecting" | "ending_call" | "asking_details"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at role-playing Indian cab vendors. Respond naturally in the appropriate language mix. Always respond with valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7, // Higher temperature for more natural variation
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response content");
    }

    const result = JSON.parse(content);
    return {
      response: result.response,
      newPrice: result.newPrice,
      intent: result.intent,
    };
  } catch (error) {
    console.error("[synthetic-vendor] Generation error:", error);
    // Fallback response
    return {
      response: context.currentState.quotedPrice
        ? "Haan ji, bataiye"
        : `${firstOfferPrice} lagega sir`,
      newPrice: context.currentState.quotedPrice ? null : firstOfferPrice,
      intent: context.currentState.quotedPrice ? "greeting" : "quoting",
    };
  }
}

// Create a synthetic vendor for testing
export function createSyntheticVendor(
  personaId: string,
  tripDetails: VendorSimulatorContext["tripDetails"],
  marketPrice: VendorSimulatorContext["marketPrice"]
): VendorSimulatorContext {
  const persona = getPersonaTemplate(personaId) || PERSONA_TEMPLATES[0];

  return {
    persona,
    tripDetails,
    marketPrice,
    currentState: {
      quotedPrice: null,
      currentOffer: null,
      negotiationRound: 0,
      objectionsUsed: [],
      mood: "neutral",
    },
  };
}

// Update vendor state after a turn
export function updateVendorState(
  context: VendorSimulatorContext,
  vendorResponse: { response: string; newPrice: number | null; intent: string }
): VendorSimulatorContext {
  const newState = { ...context.currentState };

  if (vendorResponse.newPrice !== null) {
    if (newState.quotedPrice === null) {
      newState.quotedPrice = vendorResponse.newPrice;
    } else {
      newState.currentOffer = vendorResponse.newPrice;
      newState.negotiationRound++;
    }
  }

  // Update mood based on intent
  if (vendorResponse.intent === "rejecting_offer") {
    newState.mood = "negative";
  } else if (vendorResponse.intent === "accepting") {
    newState.mood = "positive";
  } else if (vendorResponse.intent === "objecting") {
    newState.mood = context.persona.negotiationStyle === "aggressive" ? "frustrated" : "negative";
  }

  return {
    ...context,
    currentState: newState,
  };
}

// Generate a batch of synthetic vendors with varied personas
export function generateSyntheticVendorBatch(
  tripDetails: VendorSimulatorContext["tripDetails"],
  marketPrice: VendorSimulatorContext["marketPrice"],
  count: number = 10
): VendorSimulatorContext[] {
  const vendors: VendorSimulatorContext[] = [];

  // Distribution: 20% firm, 30% flexible, 20% anchor_high, 15% aggressive, 15% friendly
  const distribution = [
    { personaId: "firm_professional", count: Math.ceil(count * 0.2) },
    { personaId: "flexible_friendly", count: Math.ceil(count * 0.3) },
    { personaId: "anchor_high_haggler", count: Math.ceil(count * 0.2) },
    { personaId: "aggressive_reluctant", count: Math.ceil(count * 0.15) },
    { personaId: "whatsapp_redirector", count: Math.ceil(count * 0.15) },
  ];

  for (const { personaId, count: personaCount } of distribution) {
    for (let i = 0; i < personaCount && vendors.length < count; i++) {
      vendors.push(createSyntheticVendor(personaId, tripDetails, marketPrice));
    }
  }

  return vendors;
}

// Simulate a complete call with the negotiation bot
export async function simulateCall(
  context: VendorSimulatorContext,
  botMessages: string[] // Pre-defined bot messages for testing
): Promise<SimulatedCallResult> {
  const conversation: ConversationTurn[] = [];
  let currentContext = context;
  let timestamp = 0;

  for (const botMessage of botMessages) {
    // Add bot turn
    conversation.push({
      speaker: "bot",
      text: botMessage,
      timestamp,
    });
    timestamp += 3; // 3 seconds for bot message

    // Generate vendor response
    const vendorResponse = await generateVendorResponse(
      currentContext,
      botMessage,
      conversation
    );

    // Add vendor turn
    conversation.push({
      speaker: "vendor",
      text: vendorResponse.response,
      intent: vendorResponse.intent,
      timestamp,
    });
    timestamp += 4; // 4 seconds for vendor response

    // Update context
    currentContext = updateVendorState(currentContext, vendorResponse);

    // Check if call should end
    if (
      vendorResponse.intent === "ending_call" ||
      vendorResponse.intent === "accepting" ||
      currentContext.currentState.negotiationRound > 5
    ) {
      break;
    }
  }

  // Calculate outcome
  const quotedPrice = currentContext.currentState.quotedPrice;
  const finalPrice = currentContext.currentState.currentOffer || quotedPrice;
  const priceReduced = quotedPrice !== null && finalPrice !== null && finalPrice < quotedPrice;
  const priceReductionPercent = quotedPrice && finalPrice && priceReduced
    ? Math.round(((quotedPrice - finalPrice) / quotedPrice) * 100)
    : null;

  return {
    persona: currentContext.persona,
    conversation,
    outcome: {
      quoteObtained: quotedPrice !== null,
      firstOffer: quotedPrice,
      finalPrice,
      priceReduced,
      priceReductionPercent,
      negotiationRounds: currentContext.currentState.negotiationRound,
      callDuration: timestamp,
      endedBy: "bot",
      endReason: quotedPrice ? "negotiation_complete" : "no_quote_obtained",
    },
    evalMetrics: {
      quoteObtainedRate: quotedPrice !== null ? 1 : 0,
      negotiationSuccess: priceReduced ? 1 : 0,
      priceReductionPercent,
      conversationNaturalness: 75, // Placeholder - could be evaluated by another LLM
    },
  };
}

// Run evaluation batch
export async function runEvalBatch(
  vendors: VendorSimulatorContext[],
  botScript: string[] // Standard bot script for all vendors
): Promise<{
  results: SimulatedCallResult[];
  aggregateMetrics: {
    totalCalls: number;
    quoteObtainedRate: number;
    negotiationSuccessRate: number;
    avgPriceReduction: number;
    avgCallDuration: number;
    avgNegotiationRounds: number;
    byPersona: Record<string, {
      calls: number;
      quoteRate: number;
      successRate: number;
      avgReduction: number;
    }>;
  };
}> {
  const results: SimulatedCallResult[] = [];

  for (const vendor of vendors) {
    try {
      const result = await simulateCall(vendor, botScript);
      results.push(result);
      console.log(`[eval] Simulated call with ${vendor.persona.name}: ${result.outcome.quoteObtained ? "Quote obtained" : "No quote"}`);
    } catch (error) {
      console.error(`[eval] Failed to simulate call:`, error);
    }
  }

  // Calculate aggregate metrics
  const quoteObtained = results.filter(r => r.outcome.quoteObtained).length;
  const negotiationSuccess = results.filter(r => r.outcome.priceReduced).length;
  const priceReductions = results
    .filter(r => r.outcome.priceReductionPercent !== null)
    .map(r => r.outcome.priceReductionPercent!);
  const totalDuration = results.reduce((sum, r) => sum + r.outcome.callDuration, 0);
  const totalRounds = results.reduce((sum, r) => sum + r.outcome.negotiationRounds, 0);

  // Group by persona
  const byPersona: Record<string, SimulatedCallResult[]> = {};
  for (const result of results) {
    const personaId = result.persona.id;
    if (!byPersona[personaId]) {
      byPersona[personaId] = [];
    }
    byPersona[personaId].push(result);
  }

  const byPersonaMetrics: Record<string, {
    calls: number;
    quoteRate: number;
    successRate: number;
    avgReduction: number;
  }> = {};

  for (const [personaId, personaResults] of Object.entries(byPersona)) {
    const quotes = personaResults.filter(r => r.outcome.quoteObtained).length;
    const successes = personaResults.filter(r => r.outcome.priceReduced).length;
    const reductions = personaResults
      .filter(r => r.outcome.priceReductionPercent !== null)
      .map(r => r.outcome.priceReductionPercent!);

    byPersonaMetrics[personaId] = {
      calls: personaResults.length,
      quoteRate: Math.round((quotes / personaResults.length) * 100),
      successRate: Math.round((successes / personaResults.length) * 100),
      avgReduction: reductions.length > 0
        ? Math.round(reductions.reduce((a, b) => a + b, 0) / reductions.length)
        : 0,
    };
  }

  return {
    results,
    aggregateMetrics: {
      totalCalls: results.length,
      quoteObtainedRate: Math.round((quoteObtained / results.length) * 100),
      negotiationSuccessRate: Math.round((negotiationSuccess / results.length) * 100),
      avgPriceReduction: priceReductions.length > 0
        ? Math.round(priceReductions.reduce((a, b) => a + b, 0) / priceReductions.length)
        : 0,
      avgCallDuration: Math.round(totalDuration / results.length),
      avgNegotiationRounds: Math.round((totalRounds / results.length) * 10) / 10,
      byPersona: byPersonaMetrics,
    },
  };
}
