/**
 * Vendor Persona Types and Extraction
 *
 * Phase 1: Extract vendor personas from real call transcripts
 * Phase 2: Use personas to create synthetic vendors for eval
 */

// Vendor Negotiation Style
export type NegotiationStyle =
  | "firm"           // Holds price firmly, rarely budges
  | "flexible"       // Willing to negotiate, gives discounts
  | "anchor_high"    // Starts very high, expects haggling
  | "aggressive"     // Pushes back hard, may get frustrated
  | "friendly"       // Accommodating, builds rapport
  | "professional";  // Business-like, moderate negotiation

// Communication Style
export type CommunicationStyle =
  | "terse"          // Short, to-the-point answers
  | "chatty"         // Lots of extra info, stories
  | "formal"         // Professional language
  | "casual"         // Informal, friendly
  | "impatient";     // Wants quick resolution

// Language Mix
export type LanguageMix =
  | "pure_hindi"     // Only Hindi
  | "pure_english"   // Only English
  | "hinglish"       // Mix of Hindi and English
  | "regional_mix";  // Includes regional language

// Objection Types
export type ObjectionType =
  | "price_too_low"        // "Itna kam mein nahi hoga"
  | "distance_too_far"     // "Bahut door hai"
  | "timing_issue"         // "Is time available nahi hai"
  | "vehicle_unavailable"  // "Gaadi available nahi hai"
  | "toll_extra"           // "Toll alag lagega"
  | "waiting_charge"       // "Waiting charge extra"
  | "fuel_hike"            // "Petrol bahut mehenga hai"
  | "demand_high"          // "Bahut demand hai aaj"
  | "minimum_fare"         // "Minimum itna lagega"
  | "ask_whatsapp";        // "WhatsApp pe details bhejo"

// How vendor typically closes deals
export type DealClosingBehavior =
  | "accepts_quickly"      // Agrees to reasonable counter-offers
  | "needs_convincing"     // Requires multiple rounds
  | "final_offer"          // Gives one final price, take it or leave
  | "asks_callback"        // Wants customer to call back
  | "offers_alternative";  // Suggests different vehicle/time

// Extracted Vendor Persona
export interface VendorPersona {
  id: string;
  name: string;
  description: string;

  // Core traits
  negotiationStyle: NegotiationStyle;
  communicationStyle: CommunicationStyle;
  languageMix: LanguageMix;

  // Price behavior
  priceFlexibility: number;        // 0-100: how much they'll reduce
  typicalFirstOfferMarkup: number; // % above fair price they start at
  minimumAcceptableDiscount: number; // % below their first offer they'll go

  // Objection patterns
  commonObjections: ObjectionType[];
  objectionFrequency: "low" | "medium" | "high";

  // Deal closing
  dealClosingBehavior: DealClosingBehavior;
  averageRoundsToClose: number; // Typical negotiation rounds

  // Response patterns
  responsePatterns: {
    greeting: string[];           // How they answer calls
    priceQuote: string[];         // How they state prices
    rejection: string[];          // How they reject low offers
    acceptance: string[];         // How they accept deals
    farewell: string[];           // How they end calls
  };

  // Derived from real data
  sourceCallIds: string[];        // Call IDs used to derive this persona
  confidence: "high" | "medium" | "low";
  createdAt: Date;
}

// Persona extraction result from a single call
export interface PersonaExtractionResult {
  callId: string;
  vendorName: string;

  // Extracted traits
  negotiationStyle: NegotiationStyle;
  communicationStyle: CommunicationStyle;
  languageMix: LanguageMix;

  // Price data
  firstOffer: number | null;
  finalPrice: number | null;
  priceReductionPercent: number | null;

  // Objections used
  objectionsUsed: ObjectionType[];

  // Deal closing
  dealClosingBehavior: DealClosingBehavior;
  negotiationRounds: number;

  // Sample phrases (for pattern extraction)
  samplePhrases: {
    category: "greeting" | "priceQuote" | "rejection" | "acceptance" | "farewell" | "objection";
    phrase: string;
    hindi: boolean;
  }[];

  // Quality score
  extractionConfidence: number; // 0-100
}

// Predefined persona templates (can be refined with real data)
export const PERSONA_TEMPLATES: VendorPersona[] = [
  {
    id: "firm_professional",
    name: "Firm Professional",
    description: "Business-like vendor who quotes fair prices and rarely negotiates",
    negotiationStyle: "firm",
    communicationStyle: "formal",
    languageMix: "hinglish",
    priceFlexibility: 10,
    typicalFirstOfferMarkup: 10,
    minimumAcceptableDiscount: 5,
    commonObjections: ["fuel_hike", "demand_high"],
    objectionFrequency: "low",
    dealClosingBehavior: "final_offer",
    averageRoundsToClose: 2,
    responsePatterns: {
      greeting: ["Hello, haan boliye", "Ji haan, bataiye"],
      priceQuote: ["Sir, {{price}} rupaye lagenge", "{{price}} hoga"],
      rejection: ["Nahi sir, itna kam mein nahi hoga", "Yeh rate nahi possible hai"],
      acceptance: ["Theek hai sir, done", "Okay, confirm hai"],
      farewell: ["Ji theek hai, thank you", "Okay bye"],
    },
    sourceCallIds: [],
    confidence: "medium",
    createdAt: new Date(),
  },
  {
    id: "flexible_friendly",
    name: "Flexible Friendly",
    description: "Accommodating vendor who builds rapport and gives discounts",
    negotiationStyle: "flexible",
    communicationStyle: "chatty",
    languageMix: "hinglish",
    priceFlexibility: 25,
    typicalFirstOfferMarkup: 20,
    minimumAcceptableDiscount: 15,
    commonObjections: ["toll_extra", "waiting_charge"],
    objectionFrequency: "medium",
    dealClosingBehavior: "accepts_quickly",
    averageRoundsToClose: 3,
    responsePatterns: {
      greeting: ["Haan ji, boliye!", "Hello madam, kaise help kar sakta hoon?"],
      priceQuote: ["Dekhiye normally {{price}} lete hain, aapke liye thoda adjust kar denge", "{{price}} lagega, but negotiate kar sakte hain"],
      rejection: ["Madam thoda zyada kam hai, thoda upar aa jaiye", "Itna kam mein loss ho jayega"],
      acceptance: ["Chal theek hai, aapke liye kar dete hain", "Done madam, confirm"],
      farewell: ["Thank you madam, safe journey!", "Theek hai ji, phir baat karte hain"],
    },
    sourceCallIds: [],
    confidence: "medium",
    createdAt: new Date(),
  },
  {
    id: "anchor_high_haggler",
    name: "Anchor High Haggler",
    description: "Starts with inflated prices expecting negotiation",
    negotiationStyle: "anchor_high",
    communicationStyle: "casual",
    languageMix: "pure_hindi",
    priceFlexibility: 35,
    typicalFirstOfferMarkup: 40,
    minimumAcceptableDiscount: 25,
    commonObjections: ["price_too_low", "minimum_fare", "fuel_hike"],
    objectionFrequency: "high",
    dealClosingBehavior: "needs_convincing",
    averageRoundsToClose: 4,
    responsePatterns: {
      greeting: ["Haan bolo", "Ji boliye"],
      priceQuote: ["{{price}} lagega", "Kam se kam {{price}}"],
      rejection: ["Bhai itna kam mein kaise hoga", "Yeh to bahut kam hai", "Petrol ka rate dekha hai aapne?"],
      acceptance: ["Accha chal theek hai", "Chal bhai kar lete hain"],
      farewell: ["Theek hai bhai", "Chal bye"],
    },
    sourceCallIds: [],
    confidence: "medium",
    createdAt: new Date(),
  },
  {
    id: "aggressive_reluctant",
    name: "Aggressive Reluctant",
    description: "Pushes back hard, may show frustration, difficult to negotiate",
    negotiationStyle: "aggressive",
    communicationStyle: "impatient",
    languageMix: "pure_hindi",
    priceFlexibility: 5,
    typicalFirstOfferMarkup: 15,
    minimumAcceptableDiscount: 3,
    commonObjections: ["price_too_low", "demand_high", "distance_too_far"],
    objectionFrequency: "high",
    dealClosingBehavior: "final_offer",
    averageRoundsToClose: 2,
    responsePatterns: {
      greeting: ["Haan", "Boliye jaldi"],
      priceQuote: ["{{price}} final hai", "{{price}}, kam nahi hoga"],
      rejection: ["Nahi hoga", "Time waste mat karo", "Itna kam mein koi nahi jayega"],
      acceptance: ["Chal theek hai", "Okay"],
      farewell: ["Bye", "Theek hai"],
    },
    sourceCallIds: [],
    confidence: "medium",
    createdAt: new Date(),
  },
  {
    id: "whatsapp_redirector",
    name: "WhatsApp Redirector",
    description: "Prefers communication via WhatsApp, may avoid phone negotiation",
    negotiationStyle: "professional",
    communicationStyle: "terse",
    languageMix: "hinglish",
    priceFlexibility: 15,
    typicalFirstOfferMarkup: 15,
    minimumAcceptableDiscount: 10,
    commonObjections: ["ask_whatsapp", "vehicle_unavailable"],
    objectionFrequency: "medium",
    dealClosingBehavior: "asks_callback",
    averageRoundsToClose: 2,
    responsePatterns: {
      greeting: ["Hello", "Ji haan"],
      priceQuote: ["Approx {{price}} hoga", "{{price}} ke around"],
      rejection: ["Details WhatsApp pe bhejo", "Abhi busy hoon, WhatsApp karo"],
      acceptance: ["WhatsApp pe confirm kar dena", "Theek hai, details bhej dena"],
      farewell: ["WhatsApp karna", "Bye, message karna"],
    },
    sourceCallIds: [],
    confidence: "medium",
    createdAt: new Date(),
  },
];

// Get persona template by ID
export function getPersonaTemplate(id: string): VendorPersona | undefined {
  return PERSONA_TEMPLATES.find(p => p.id === id);
}

// Get all persona templates
export function getAllPersonaTemplates(): VendorPersona[] {
  return PERSONA_TEMPLATES;
}

// Cluster extraction results into personas
export function clusterIntoPersonas(
  extractions: PersonaExtractionResult[],
  existingTemplates: VendorPersona[] = PERSONA_TEMPLATES
): VendorPersona[] {
  // Group by negotiation style
  const byStyle: Record<NegotiationStyle, PersonaExtractionResult[]> = {
    firm: [],
    flexible: [],
    anchor_high: [],
    aggressive: [],
    friendly: [],
    professional: [],
  };

  for (const extraction of extractions) {
    byStyle[extraction.negotiationStyle].push(extraction);
  }

  const refinedPersonas: VendorPersona[] = [];

  for (const [style, results] of Object.entries(byStyle)) {
    if (results.length === 0) continue;

    // Find matching template
    const template = existingTemplates.find(t => t.negotiationStyle === style);
    if (!template) continue;

    // Calculate averages from real data
    const priceReductions = results
      .map(r => r.priceReductionPercent)
      .filter((p): p is number => p !== null);

    const avgPriceReduction = priceReductions.length > 0
      ? priceReductions.reduce((a, b) => a + b, 0) / priceReductions.length
      : template.priceFlexibility;

    const avgRounds = results.length > 0
      ? results.reduce((a, b) => a + b.negotiationRounds, 0) / results.length
      : template.averageRoundsToClose;

    // Collect all objections used
    const allObjections = results.flatMap(r => r.objectionsUsed);
    const objectionCounts = allObjections.reduce((acc, obj) => {
      acc[obj] = (acc[obj] || 0) + 1;
      return acc;
    }, {} as Record<ObjectionType, number>);

    const topObjections = Object.entries(objectionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([obj]) => obj as ObjectionType);

    // Collect sample phrases
    const phrasesByCategory: Record<string, string[]> = {
      greeting: [],
      priceQuote: [],
      rejection: [],
      acceptance: [],
      farewell: [],
    };

    for (const result of results) {
      for (const phrase of result.samplePhrases) {
        if (phrasesByCategory[phrase.category]) {
          phrasesByCategory[phrase.category].push(phrase.phrase);
        }
      }
    }

    // Create refined persona
    refinedPersonas.push({
      ...template,
      id: `${template.id}_refined`,
      priceFlexibility: Math.round(avgPriceReduction),
      averageRoundsToClose: Math.round(avgRounds),
      commonObjections: topObjections.length > 0 ? topObjections : template.commonObjections,
      responsePatterns: {
        greeting: phrasesByCategory.greeting.length > 0
          ? [...new Set(phrasesByCategory.greeting)].slice(0, 3)
          : template.responsePatterns.greeting,
        priceQuote: phrasesByCategory.priceQuote.length > 0
          ? [...new Set(phrasesByCategory.priceQuote)].slice(0, 3)
          : template.responsePatterns.priceQuote,
        rejection: phrasesByCategory.rejection.length > 0
          ? [...new Set(phrasesByCategory.rejection)].slice(0, 3)
          : template.responsePatterns.rejection,
        acceptance: phrasesByCategory.acceptance.length > 0
          ? [...new Set(phrasesByCategory.acceptance)].slice(0, 3)
          : template.responsePatterns.acceptance,
        farewell: phrasesByCategory.farewell.length > 0
          ? [...new Set(phrasesByCategory.farewell)].slice(0, 3)
          : template.responsePatterns.farewell,
      },
      sourceCallIds: results.map(r => r.callId),
      confidence: results.length >= 5 ? "high" : results.length >= 2 ? "medium" : "low",
      createdAt: new Date(),
    });
  }

  return refinedPersonas;
}
