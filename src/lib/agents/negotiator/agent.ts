import { ChatOpenAI } from "@langchain/openai";
import {
  NegotiatorGraphState,
  NegotiationCallState,
  SupportedLanguage,
  createAgentEvent,
  RankedVendor,
  CallDecisionState
} from "../types";
import { Business, UserRequirement } from "@/types";
import {
  LANGUAGE_PHRASES,
  TRANSCRIBER_LANGUAGE_CODES,
  getLanguagePromptAdditions,
  checkLanguageSwitch,
  createLanguageSwitchEvent,
  getLanguageName
} from "./language-switcher";
import {
  analyzeQuestionWithLLM,
  createHumanInterrupt,
  createHumanInterruptRequestEvent,
  PAUSE_PHRASES,
  isWaitingForHumanInput
} from "./human-interrupt";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = "https://api.vapi.ai";

// Generate negotiation prompt with research data and learnings
function generateNegotiationPrompt(
  requirements: UserRequirement,
  business: Business,
  rankedVendor: RankedVendor | undefined,
  language: SupportedLanguage,
  lowestPriceSoFar: number | null,
  promptEnhancements: string | null
): string {
  const phrases = LANGUAGE_PHRASES[language];
  const langAdditions = getLanguagePromptAdditions(language);

  // Get price range from research
  const priceLow = rankedVendor?.estimatedPriceRange.low || 0;
  const priceHigh = rankedVendor?.estimatedPriceRange.high || 0;
  const isFirstVendor = !lowestPriceSoFar;
  const benchmark = lowestPriceSoFar;

  // Research-based insights
  const researchInsights = rankedVendor
    ? `
## Vendor Context
- Market price range: ₹${priceLow} - ₹${priceHigh}
- Vendor ranking: #${rankedVendor.ranking}
${rankedVendor.strengths.length > 0 ? `- Known for: ${rankedVendor.strengths.join(", ")}` : ""}
`
    : "";

  // Build negotiation strategy based on whether we have a benchmark
  const negotiationStrategy = isFirstVendor
    ? `## NEGOTIATION STRATEGY (First Vendor - No Benchmark Yet)

When vendor quotes a price:

A) If price is ABOVE ₹${priceHigh} (above market range):
   - Say: "That's a bit higher than I expected. My budget is around ₹${priceHigh}. Can you work with that?"
   - If they counter, evaluate their new price

B) If price is BETWEEN ₹${priceLow} and ₹${priceHigh} (within market range):
   - Say: "I was hoping for something around ₹${priceLow}. Is that possible?"
   - This is a fair range, so one counter is enough

C) If price is BELOW ₹${priceLow} (below market - great deal!):
   - Say: "That sounds reasonable. Is this your final price, or can you do any better?"
   - Mention: "I'm looking for a long-term arrangement, so I'd appreciate your best rate."
   - Don't push too hard - this is already a good price`
    : `## NEGOTIATION STRATEGY (Subsequent Vendor - Benchmark: ₹${benchmark})

You already have a quote of ₹${benchmark} from another vendor. Use this as leverage.

When vendor quotes a price:

A) If price is ABOVE ₹${benchmark} (above your benchmark):
   - Say: "I've already received a quote of ₹${benchmark} from another provider. My maximum budget is ₹${benchmark}. Can you match or beat that?"
   - If they can't go lower, thank them politely and end

B) If price is AT or BELOW ₹${benchmark} (matches or beats benchmark):
   - Say: "That's competitive. Is this your final price? I'm looking for a long-term relationship and would appreciate your absolute best rate."
   - If they offer even lower, great! If not, this is still a good deal.`;

  // Learning enhancements
  const learningSection = promptEnhancements
    ? `
## LEARNINGS FROM PREVIOUS CALLS
${promptEnhancements}
`
    : "";

  return `You are a courteous assistant calling ${business.name} on behalf of a customer to book a ${requirements.service}. Your goal is to get the BEST PRICE while treating the vendor respectfully.

${langAdditions}

## BOOKING DETAILS
- Service: ${requirements.service}
- From: ${requirements.from}
- To: ${requirements.to}
- Date: ${requirements.date}
- Time: ${requirements.time}
${requirements.passengers ? `- Passengers: ${requirements.passengers}` : ""}
${requirements.vehicleType ? `- Vehicle preference: ${requirements.vehicleType}` : ""}

## PRICING CONTEXT
- Market rate range: ₹${priceLow} - ₹${priceHigh}
${benchmark ? `- Current benchmark (best quote so far): ₹${benchmark}` : "- This is the FIRST vendor call - no benchmark yet"}
${researchInsights}

${negotiationStrategy}
${learningSection}

## CONVERSATION FLOW

**1. GREETING** (be warm):
- Greet: "${phrases.greeting}"
- Confirm they can help with your route and date

**2. GET PRICE FIRST**:
- Ask: "${phrases.askPrice}"
- WAIT for their quote - NEVER reveal your budget first!

**3. NEGOTIATE** (follow strategy above based on their quote)

**4. CLOSING** (be gracious):
- Thank them: "${phrases.thankYou}"
- Say you'll confirm: "${phrases.willCallBack}"

## LANGUAGE
- Start in ${getLanguageName(language)}
- If vendor responds in a different language, switch to match them
- Be natural and conversational

## QUESTIONS YOU CAN'T ANSWER
If the vendor asks about: exact pickup address, customer's contact number, special preferences (child seat, etc.), payment details, or booking confirmation - say "${PAUSE_PHRASES[language]}" and wait for input.

## CRITICAL RULES - NEVER BREAK THESE
- NEVER reveal your budget FIRST - always get vendor's quote first
- If asked "what's your budget?" - deflect: "What's your usual rate for this trip?" / "ನಿಮ್ಮ ಸಾಮಾನ್ಯ ದರ ಏನು?" / "आपका सामान्य रेट क्या है?"
- One counter-offer is usually enough - don't haggle aggressively
- Don't commit to booking - always say you'll call back to confirm

Keep the call under 3 minutes. Collect: final price, vehicle type, any extra charges.
End courteously regardless of outcome.`;
}

// Make outbound call via Vapi
async function makeVapiCall(
  business: Business,
  requirements: UserRequirement,
  prompt: string,
  language: SupportedLanguage,
  firstMessage: string
): Promise<{ callId: string; status: string }> {
  // Format phone number for India
  let phoneNumber = business.phone.replace(/\s/g, "").replace(/-/g, "");
  if (!phoneNumber.startsWith("+")) {
    if (phoneNumber.startsWith("0")) {
      phoneNumber = "+91" + phoneNumber.slice(1);
    } else if (!phoneNumber.startsWith("91")) {
      phoneNumber = "+91" + phoneNumber;
    } else {
      phoneNumber = "+" + phoneNumber;
    }
  }

  const response = await fetch(`${VAPI_BASE_URL}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: {
        number: phoneNumber,
        name: business.name,
      },
      assistant: {
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: prompt,
            },
          ],
        },
        voice: {
          provider: "11labs",
          voiceId: "21m00Tcm4TlvDq8ikWAM",
          model: "eleven_multilingual_v2", // Multilingual model for language switching
        },
        firstMessage: firstMessage,
        transcriber: {
          provider: "deepgram",
          model: "nova-3",
          language: "multi",
        },
        endCallFunctionEnabled: true,
        endCallMessage: LANGUAGE_PHRASES[language].thankYou + ", " + LANGUAGE_PHRASES[language].willCallBack,
        maxDurationSeconds: 180,
      },
      metadata: {
        businessId: business.id,
        businessName: business.name,
        service: requirements.service,
        language,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vapi API error: ${error}`);
  }

  const data = await response.json();
  return {
    callId: data.id,
    status: data.status,
  };
}

// Get call status from Vapi
async function getCallStatus(callId: string): Promise<{
  status: string;
  transcript?: string;
  endedAt?: string;
  summary?: string;
}> {
  const response = await fetch(`${VAPI_BASE_URL}/call/${callId}`, {
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get call status: ${response.statusText}`);
  }

  return response.json();
}

// Extract quote from transcript with baseline-aware validation
async function extractQuoteFromTranscript(
  transcript: string,
  businessName: string,
  baselinePrice?: { low: number; mid: number; high: number } | null
): Promise<{
  price: number | null;
  notes: string;
  priceConfidence: "high" | "medium" | "low";
  priceSuspicious: boolean;
}> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.3,
  });

  // Include baseline context to help LLM identify correct price
  const baselineContext = baselinePrice
    ? `\nExpected price range: ₹${baselinePrice.low} - ₹${baselinePrice.high} (mid: ₹${baselinePrice.mid}). Be skeptical of prices far outside this range - they may be distances, times, or other numbers.`
    : "";

  const prompt = `Extract the quoted price and important details from this call transcript.
${baselineContext}

Transcript:
${transcript}

IMPORTANT: Look for clear price quotes from the vendor (e.g., "Rs 800", "₹900", "eight hundred rupees", "price is 1200").
Do NOT confuse prices with:
- Distance values (e.g., "100 km")
- Time values (e.g., "30 minutes")
- Percentages or discounts
- Phone numbers or IDs

Respond in JSON:
{
  "price": number or null,
  "priceConfidence": "high" | "medium" | "low",
  "vehicleType": "vehicle type or null",
  "additionalCharges": "any extra charges or null",
  "availability": "confirmed/not available/unclear",
  "notes": "other important info"
}`;

  try {
    const response = await model.invoke(prompt);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);

      // Validate extracted price against baseline
      let priceSuspicious = false;
      if (result.price && baselinePrice) {
        const minPlausible = baselinePrice.low * 0.3;
        const maxPlausible = baselinePrice.high * 2.0;
        if (result.price < minPlausible || result.price > maxPlausible) {
          console.warn(`[extractQuoteFromTranscript] Suspicious price ₹${result.price} for ${businessName} (baseline: ₹${baselinePrice.low}-${baselinePrice.high})`);
          priceSuspicious = true;
        }
      }

      return {
        price: result.price,
        notes: [
          result.vehicleType && `Vehicle: ${result.vehicleType}`,
          result.additionalCharges && `Extra: ${result.additionalCharges}`,
          result.availability && `Availability: ${result.availability}`,
          result.notes,
        ]
          .filter(Boolean)
          .join(". "),
        priceConfidence: result.priceConfidence || "medium",
        priceSuspicious,
      };
    }
  } catch (error) {
    console.error("Quote extraction error:", error);
  }

  return { price: null, notes: "", priceConfidence: "low", priceSuspicious: false };
}

// Main Negotiator Agent function
export async function negotiatorAgent(
  state: NegotiatorGraphState
): Promise<Partial<NegotiatorGraphState>> {
  const events = [
    createAgentEvent(
      "agent_started",
      "negotiator",
      "Starting negotiation phase...",
      {
        vendorCount: state.research?.vendorRanking?.rankedVendors?.length || state.businesses.length,
        language: state.currentLanguage,
      }
    ),
  ];

  // Check if waiting for human input
  if (isWaitingForHumanInput(state)) {
    events.push(
      createAgentEvent(
        "agent_started",
        "negotiator",
        "Waiting for human input before continuing...",
        { interruptId: state.humanInterrupt.interruptId }
      )
    );
    return {
      agentEvents: events,
      currentAgent: "negotiator.human_interrupt",
    };
  }

  // Validate prerequisites
  if (!state.requirements) {
    events.push(
      createAgentEvent(
        "agent_error",
        "negotiator",
        "Cannot start negotiation - requirements not gathered"
      )
    );
    return {
      agentEvents: events,
      currentAgent: "negotiator",
      errors: [
        {
          agent: "negotiator",
          error: "Requirements not gathered",
          timestamp: new Date(),
          recoverable: false,
        },
      ],
    };
  }

  // Get ranked vendors or fallback to businesses
  const vendorsToCall = state.research?.vendorRanking?.rankedVendors ||
    state.businesses.map((b, i) => ({
      business: b,
      score: 50,
      ranking: i + 1,
      strengths: [],
      weaknesses: [],
      negotiationStrategy: "Standard negotiation",
      estimatedPriceRange: { low: 0, high: 0 },
    }));

  if (vendorsToCall.length === 0) {
    events.push(
      createAgentEvent(
        "agent_error",
        "negotiator",
        "No vendors to call"
      )
    );
    return {
      agentEvents: events,
      currentAgent: "negotiator",
      errors: [
        {
          agent: "negotiator",
          error: "No vendors to call",
          timestamp: new Date(),
          recoverable: false,
        },
      ],
    };
  }

  const calls: NegotiationCallState[] = [...state.negotiation.calls];
  let lowestPrice = state.negotiation.lowestPriceSoFar;
  let bestVendor = state.negotiation.bestVendorSoFar;
  let currentLanguage = state.currentLanguage;
  const promptEnhancements = state.learning.currentPromptEnhancement?.promptAdditions || null;

  // Start from where we left off
  const startIndex = state.negotiation.currentVendorIndex;

  // Call vendors sequentially (up to 1 for testing with actual calls)
  const maxCalls = Math.min(1, vendorsToCall.length);

  for (let i = startIndex; i < maxCalls; i++) {
    const rankedVendor = vendorsToCall[i];
    const business = rankedVendor.business;

    events.push(
      createAgentEvent(
        "call_started",
        "negotiator.calling",
        `Calling ${business.name} (#${rankedVendor.ranking})...`,
        {
          businessId: business.id,
          businessName: business.name,
          ranking: rankedVendor.ranking,
          strategy: rankedVendor.negotiationStrategy,
        }
      )
    );

    // Initialize call state
    const callState: NegotiationCallState = {
      callId: "",
      businessId: business.id,
      businessName: business.name,
      status: "calling",
      startedAt: new Date(),
      endedAt: null,
      language: currentLanguage,
      languageSwitches: [],
      transcript: null,
      quotedPrice: null,
      negotiatedPrice: null,
      humanInterrupts: [],
      result: null,
    };

    try {
      // Generate prompt with all context
      const prompt = generateNegotiationPrompt(
        state.requirements,
        business,
        rankedVendor,
        currentLanguage,
        lowestPrice,
        promptEnhancements
      );

      // Generate first message
      const phrases = LANGUAGE_PHRASES[currentLanguage];
      const firstMessage = `${phrases.greeting}! ${state.requirements.from} ${currentLanguage === "kn" ? "ಇಂದ" : currentLanguage === "hi" ? "से" : "from"} ${state.requirements.to} ${currentLanguage === "kn" ? "ಗೆ" : currentLanguage === "hi" ? "तक" : "to"} ${state.requirements.date} ${currentLanguage === "kn" ? "ರಂದು" : currentLanguage === "hi" ? "को" : "on"} ${state.requirements.service} ${currentLanguage === "kn" ? "ಬೇಕು" : currentLanguage === "hi" ? "चाहिए" : "needed"}. ${phrases.askPrice}`;

      // Make the call
      const { callId, status } = await makeVapiCall(
        business,
        state.requirements,
        prompt,
        currentLanguage,
        firstMessage
      );

      callState.callId = callId;
      callState.status = "in_progress";

      events.push(
        createAgentEvent(
          "call_progress",
          "negotiator.calling",
          `Call initiated to ${business.name}, waiting for completion...`,
          { callId, status }
        )
      );

      // Wait for call completion
      let callComplete = false;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max

      while (!callComplete && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;

        const callStatus = await getCallStatus(callId);

        if (
          callStatus.status === "ended" ||
          callStatus.status === "completed" ||
          callStatus.status === "failed" ||
          callStatus.status === "busy" ||
          callStatus.status === "no-answer"
        ) {
          callComplete = true;
          callState.status = callStatus.status === "ended" || callStatus.status === "completed"
            ? "completed"
            : "failed";
          callState.endedAt = new Date();
          callState.transcript = callStatus.transcript || null;

          if (callState.transcript) {
            // Extract quote with baseline-aware validation
            const baselinePrice = state.research?.priceIntel?.baselinePrice || null;
            const quoteInfo = await extractQuoteFromTranscript(
              callState.transcript,
              business.name,
              baselinePrice
            );

            // Only accept price if not suspicious, or if no better option
            if (quoteInfo.priceSuspicious) {
              console.warn(`[negotiator] Suspicious price ₹${quoteInfo.price} from ${business.name} - marking for verification`);
              events.push(
                createAgentEvent(
                  "price_verification_needed",
                  "negotiator.calling",
                  `⚠️ Suspicious price ₹${quoteInfo.price} from ${business.name}. Expected range: ₹${baselinePrice?.low}-${baselinePrice?.high}. Will verify in learning phase.`,
                  {
                    callId,
                    extractedPrice: quoteInfo.price,
                    baselinePrice,
                    priceConfidence: quoteInfo.priceConfidence,
                  }
                )
              );
              // Store the suspicious price but flag it
              callState.quotedPrice = quoteInfo.price;
              callState.negotiatedPrice = quoteInfo.price;
              // Don't update lowest price benchmark with suspicious values
            } else {
              callState.quotedPrice = quoteInfo.price;
              callState.negotiatedPrice = quoteInfo.price;

              // Update benchmark only with non-suspicious prices
              if (quoteInfo.price && (!lowestPrice || quoteInfo.price < lowestPrice)) {
                lowestPrice = quoteInfo.price;
                bestVendor = business.id;
              }
            }

            // Check for language switches in transcript
            // (This would be more sophisticated in a real implementation)
          }

          events.push(
            createAgentEvent(
              "call_ended",
              "negotiator.calling",
              `Call to ${business.name} ${callState.status}. ${callState.quotedPrice ? `Quote: ₹${callState.quotedPrice}` : "No quote obtained"}`,
              {
                callId,
                status: callState.status,
                quotedPrice: callState.quotedPrice,
                duration: callState.endedAt && callState.startedAt
                  ? Math.round((callState.endedAt.getTime() - callState.startedAt.getTime()) / 1000)
                  : null,
              }
            )
          );
        }
      }

      if (!callComplete) {
        callState.status = "failed";
        events.push(
          createAgentEvent(
            "agent_error",
            "negotiator.calling",
            `Call to ${business.name} timed out`
          )
        );
      }
    } catch (error) {
      callState.status = "failed";
      events.push(
        createAgentEvent(
          "agent_error",
          "negotiator.calling",
          `Call to ${business.name} failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }

    calls.push(callState);
  }

  // Determine best deal so far
  const completedCalls = calls.filter((c) => c.status === "completed" && c.quotedPrice);
  let bestDeal = null;

  if (completedCalls.length > 0) {
    const bestCall = completedCalls.reduce((best, current) =>
      (current.quotedPrice || Infinity) < (best.quotedPrice || Infinity) ? current : best
    );

    const bestBusiness = state.businesses.find((b) => b.id === bestCall.businessId);
    if (bestBusiness && bestCall.quotedPrice) {
      bestDeal = {
        vendor: bestBusiness,
        price: bestCall.quotedPrice,
        details: `Negotiated price from ${bestBusiness.name}`,
        verificationStatus: "pending" as const,
      };
    }
  }

  // Get the last call for summary
  const lastCall = calls[calls.length - 1];
  const vendorsRemaining = vendorsToCall.length - (startIndex + 1);
  const hasMoreVendors = vendorsRemaining > 0;

  // Create call summary for user
  const callSummary = lastCall ? {
    vendorName: lastCall.businessName,
    vendorPhone: state.businesses.find(b => b.id === lastCall.businessId)?.phone || "",
    quotedPrice: lastCall.quotedPrice,
    negotiatedPrice: lastCall.negotiatedPrice,
    callDuration: lastCall.startedAt && lastCall.endedAt
      ? Math.round((lastCall.endedAt.getTime() - lastCall.startedAt.getTime()) / 1000)
      : 0,
    outcome: lastCall.status === "completed" ? "success" as const : "failed" as const,
    highlights: [
      lastCall.quotedPrice ? `Quoted price: ₹${lastCall.quotedPrice}` : "No price quoted",
      lastCall.status === "completed" ? "Call successful" : "Call did not complete",
    ].filter(Boolean),
  } : null;

  // Add call summary event
  if (callSummary) {
    events.push(
      createAgentEvent(
        "call_summary",
        "negotiator",
        `Call to ${callSummary.vendorName} completed. ${callSummary.quotedPrice ? `Price: ₹${callSummary.quotedPrice}` : "No quote obtained"}`,
        {
          callSummary,
          vendorsRemaining,
          currentBestPrice: lowestPrice,
          currentBestVendor: bestVendor,
        }
      )
    );
  }

  // If there are more vendors, pause and ask user for decision
  if (hasMoreVendors) {
    events.push(
      createAgentEvent(
        "awaiting_call_decision",
        "negotiator",
        `${vendorsRemaining} more vendor${vendorsRemaining > 1 ? 's' : ''} available to call. Would you like to continue?`,
        {
          vendorsRemaining,
          currentBestPrice: lowestPrice,
          currentBestVendor: bestVendor,
          nextVendor: vendorsToCall[startIndex + 1]?.business.name,
        }
      )
    );

    // Create call decision state
    const callDecision: CallDecisionState = {
      awaitingDecision: true,
      lastCallSummary: callSummary,
      vendorsRemaining,
      currentBestPrice: lowestPrice,
      currentBestVendor: bestVendor,
      userDecision: null,
    };

    return {
      agentEvents: events,
      currentAgent: "negotiator",
      previousAgents: [...state.previousAgents, "negotiator"],
      currentLanguage,
      negotiation: {
        currentVendorIndex: startIndex + 1, // Ready to call next vendor
        lowestPriceSoFar: lowestPrice,
        bestVendorSoFar: bestVendor,
        calls,
        totalCallsMade: calls.length,
      },
      callDecision,
      bestDeal,
      shouldContinue: false, // Pause for user decision
    };
  }

  // No more vendors - negotiation complete
  events.push(
    createAgentEvent(
      "agent_completed",
      "negotiator",
      bestDeal
        ? `Negotiation complete. Best deal: ${bestDeal.vendor.name} at ₹${bestDeal.price}`
        : "Negotiation complete. No successful quotes obtained.",
      {
        totalCalls: calls.length,
        successfulCalls: completedCalls.length,
        lowestPrice,
        bestVendor,
      }
    )
  );

  // Reset call decision state since we're done
  const callDecisionComplete: CallDecisionState = {
    awaitingDecision: false,
    lastCallSummary: callSummary,
    vendorsRemaining: 0,
    currentBestPrice: lowestPrice,
    currentBestVendor: bestVendor,
    userDecision: null,
  };

  return {
    agentEvents: events,
    currentAgent: "negotiator",
    previousAgents: [...state.previousAgents, "negotiator"],
    currentLanguage,
    negotiation: {
      currentVendorIndex: vendorsToCall.length, // All done
      lowestPriceSoFar: lowestPrice,
      bestVendorSoFar: bestVendor,
      calls,
      totalCallsMade: calls.length,
    },
    callDecision: callDecisionComplete,
    bestDeal,
  };
}

// Export sub-modules
export * from "./language-switcher";
export * from "./human-interrupt";
