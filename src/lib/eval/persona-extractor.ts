/**
 * Persona Extractor - Extract vendor personas from call transcripts
 *
 * Uses LLM to analyze transcripts and extract behavioral patterns
 */

import {
  VendorPersona,
  PersonaExtractionResult,
  NegotiationStyle,
  CommunicationStyle,
  LanguageMix,
  ObjectionType,
  DealClosingBehavior,
  clusterIntoPersonas,
  PERSONA_TEMPLATES,
} from "./vendor-persona";
import { CallHistoryRecord } from "../call-history";

// Extract persona traits from a single call transcript
export async function extractPersonaFromTranscript(
  call: CallHistoryRecord
): Promise<PersonaExtractionResult | null> {
  if (!call.transcript) {
    return null;
  }

  // Use OpenAI for extraction
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Analyze this cab booking negotiation call transcript and extract the VENDOR's behavioral patterns.

TRANSCRIPT:
${call.transcript}

CALL METADATA:
- Vendor: ${call.vendorName}
- Quoted Price: ${call.quotedPrice ? `₹${call.quotedPrice}` : "Not obtained"}
- Negotiated Price: ${call.negotiatedPrice ? `₹${call.negotiatedPrice}` : "Same as quoted"}
- Call Status: ${call.status}

Analyze the VENDOR (not the bot) and extract:

1. NEGOTIATION STYLE - How does the vendor handle price discussions?
   - "firm": Holds price firmly, rarely budges
   - "flexible": Willing to negotiate, gives discounts
   - "anchor_high": Starts very high, expects haggling
   - "aggressive": Pushes back hard, may get frustrated
   - "friendly": Accommodating, builds rapport
   - "professional": Business-like, moderate negotiation

2. COMMUNICATION STYLE - How does the vendor communicate?
   - "terse": Short, to-the-point answers
   - "chatty": Lots of extra info, stories
   - "formal": Professional language
   - "casual": Informal, friendly
   - "impatient": Wants quick resolution

3. LANGUAGE MIX - What language does the vendor use?
   - "pure_hindi": Only Hindi
   - "pure_english": Only English
   - "hinglish": Mix of Hindi and English
   - "regional_mix": Includes regional language

4. OBJECTIONS USED - What objections did the vendor raise?
   - "price_too_low": "Itna kam mein nahi hoga"
   - "distance_too_far": "Bahut door hai"
   - "timing_issue": "Is time available nahi hai"
   - "vehicle_unavailable": "Gaadi available nahi hai"
   - "toll_extra": "Toll alag lagega"
   - "waiting_charge": "Waiting charge extra"
   - "fuel_hike": "Petrol bahut mehenga hai"
   - "demand_high": "Bahut demand hai aaj"
   - "minimum_fare": "Minimum itna lagega"
   - "ask_whatsapp": "WhatsApp pe details bhejo"

5. DEAL CLOSING BEHAVIOR - How does the vendor close deals?
   - "accepts_quickly": Agrees to reasonable counter-offers
   - "needs_convincing": Requires multiple rounds
   - "final_offer": Gives one final price, take it or leave
   - "asks_callback": Wants customer to call back
   - "offers_alternative": Suggests different vehicle/time

6. SAMPLE PHRASES - Extract actual phrases the vendor used (in original language):
   - Greeting: How they answered the call
   - Price Quote: How they stated their price
   - Rejection: How they rejected low offers (if any)
   - Acceptance: How they accepted the deal (if any)
   - Farewell: How they ended the call
   - Objection: Any objection phrases used

Respond in JSON format:
{
  "negotiationStyle": "firm" | "flexible" | "anchor_high" | "aggressive" | "friendly" | "professional",
  "communicationStyle": "terse" | "chatty" | "formal" | "casual" | "impatient",
  "languageMix": "pure_hindi" | "pure_english" | "hinglish" | "regional_mix",
  "firstOffer": number | null (vendor's first price mention),
  "finalPrice": number | null (final agreed price, if any),
  "objectionsUsed": ["objection_type", ...],
  "dealClosingBehavior": "accepts_quickly" | "needs_convincing" | "final_offer" | "asks_callback" | "offers_alternative",
  "negotiationRounds": number (how many back-and-forth price discussions),
  "samplePhrases": [
    {"category": "greeting" | "priceQuote" | "rejection" | "acceptance" | "farewell" | "objection", "phrase": "actual phrase", "hindi": true/false}
  ],
  "extractionConfidence": number (0-100, how confident you are in this analysis)
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing negotiation transcripts and extracting behavioral patterns. Always respond with valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return null;
    }

    const result = JSON.parse(content);

    // Calculate price reduction if we have the data
    let priceReductionPercent: number | null = null;
    if (result.firstOffer && result.finalPrice && result.firstOffer > result.finalPrice) {
      priceReductionPercent = Math.round(
        ((result.firstOffer - result.finalPrice) / result.firstOffer) * 100
      );
    }

    return {
      callId: call.callId,
      vendorName: call.vendorName,
      negotiationStyle: result.negotiationStyle as NegotiationStyle,
      communicationStyle: result.communicationStyle as CommunicationStyle,
      languageMix: result.languageMix as LanguageMix,
      firstOffer: result.firstOffer,
      finalPrice: result.finalPrice,
      priceReductionPercent,
      objectionsUsed: result.objectionsUsed as ObjectionType[],
      dealClosingBehavior: result.dealClosingBehavior as DealClosingBehavior,
      negotiationRounds: result.negotiationRounds || 1,
      samplePhrases: result.samplePhrases || [],
      extractionConfidence: result.extractionConfidence || 50,
    };
  } catch (error) {
    console.error("[persona-extractor] Extraction error:", error);
    return null;
  }
}

// Extract personas from multiple calls
export async function extractPersonasFromCalls(
  calls: CallHistoryRecord[]
): Promise<{
  extractions: PersonaExtractionResult[];
  personas: VendorPersona[];
  stats: {
    totalCalls: number;
    successfulExtractions: number;
    avgConfidence: number;
    personasGenerated: number;
  };
}> {
  const extractions: PersonaExtractionResult[] = [];
  let totalConfidence = 0;

  // Filter calls with transcripts
  const callsWithTranscripts = calls.filter(c => c.transcript && c.transcript.length > 100);

  console.log(`[persona-extractor] Processing ${callsWithTranscripts.length} calls with transcripts`);

  for (const call of callsWithTranscripts) {
    try {
      const extraction = await extractPersonaFromTranscript(call);
      if (extraction) {
        extractions.push(extraction);
        totalConfidence += extraction.extractionConfidence;
        console.log(`[persona-extractor] Extracted persona from ${call.vendorName}: ${extraction.negotiationStyle}`);
      }
    } catch (error) {
      console.error(`[persona-extractor] Failed to extract from ${call.vendorName}:`, error);
    }
  }

  // Cluster extractions into personas
  const personas = clusterIntoPersonas(extractions, PERSONA_TEMPLATES);

  return {
    extractions,
    personas,
    stats: {
      totalCalls: calls.length,
      successfulExtractions: extractions.length,
      avgConfidence: extractions.length > 0
        ? Math.round(totalConfidence / extractions.length)
        : 0,
      personasGenerated: personas.length,
    },
  };
}

// Analyze persona distribution from extractions
export function analyzePersonaDistribution(
  extractions: PersonaExtractionResult[]
): {
  byNegotiationStyle: Record<NegotiationStyle, number>;
  byCommunicationStyle: Record<CommunicationStyle, number>;
  byLanguageMix: Record<LanguageMix, number>;
  avgPriceReduction: number;
  avgNegotiationRounds: number;
  commonObjections: { objection: ObjectionType; count: number }[];
} {
  const byNegotiationStyle: Record<NegotiationStyle, number> = {
    firm: 0,
    flexible: 0,
    anchor_high: 0,
    aggressive: 0,
    friendly: 0,
    professional: 0,
  };

  const byCommunicationStyle: Record<CommunicationStyle, number> = {
    terse: 0,
    chatty: 0,
    formal: 0,
    casual: 0,
    impatient: 0,
  };

  const byLanguageMix: Record<LanguageMix, number> = {
    pure_hindi: 0,
    pure_english: 0,
    hinglish: 0,
    regional_mix: 0,
  };

  const objectionCounts: Record<ObjectionType, number> = {} as Record<ObjectionType, number>;
  const priceReductions: number[] = [];
  let totalRounds = 0;

  for (const extraction of extractions) {
    byNegotiationStyle[extraction.negotiationStyle]++;
    byCommunicationStyle[extraction.communicationStyle]++;
    byLanguageMix[extraction.languageMix]++;

    if (extraction.priceReductionPercent !== null) {
      priceReductions.push(extraction.priceReductionPercent);
    }

    totalRounds += extraction.negotiationRounds;

    for (const objection of extraction.objectionsUsed) {
      objectionCounts[objection] = (objectionCounts[objection] || 0) + 1;
    }
  }

  const commonObjections = Object.entries(objectionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([objection, count]) => ({
      objection: objection as ObjectionType,
      count,
    }));

  return {
    byNegotiationStyle,
    byCommunicationStyle,
    byLanguageMix,
    avgPriceReduction: priceReductions.length > 0
      ? Math.round(priceReductions.reduce((a, b) => a + b, 0) / priceReductions.length)
      : 0,
    avgNegotiationRounds: extractions.length > 0
      ? Math.round((totalRounds / extractions.length) * 10) / 10
      : 0,
    commonObjections,
  };
}
