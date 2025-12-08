// Service Configuration System - Hybrid Approach
// Combines vendor personas for natural conversation with structured field requirements

export interface ServiceField {
  name: string;
  displayName: string;
  required: boolean;
  askAs: string; // How the vendor would ask for this field
  type: "text" | "number" | "select" | "date" | "time" | "datetime";
  options?: string[]; // For select fields
  dependsOn?: { field: string; value: string }; // Conditional field
}

export interface ServiceConfig {
  id: string;
  displayName: string;
  icon: string;
  googleSearchTerms: string[]; // Terms to search on Google Maps
  vendorPersona: string; // How the agent should behave
  greeting: string; // Initial greeting when service is detected
  requiredFields: ServiceField[];
  optionalFields: ServiceField[];
  completionMessage: string; // Message when all info is collected
  negotiationContext: string; // Context for the negotiation prompt
  priceExtractionHints: string[]; // Hints for extracting price from transcript
}

// =============================================================================
// CAB SERVICE CONFIG
// =============================================================================
export const CAB_SERVICE: ServiceConfig = {
  id: "cab",
  displayName: "Cab / Taxi",
  icon: "🚕",
  googleSearchTerms: ["taxi", "cab", "travels", "car rental"],

  vendorPersona: `You are a friendly and efficient cab booking agent at a taxi company.
You speak naturally like a real taxi company receptionist would - warm, helpful, and professional.
You understand both English and Hindi, and can respond in Hinglish if the customer uses it.
You ask ONE question at a time and confirm what you understood before moving on.`,

  greeting: "Hello! I can help you book a cab. Where do you need to go?",

  requiredFields: [
    { name: "from", displayName: "Pickup Location", required: true, askAs: "pickup location", type: "text" },
    { name: "to", displayName: "Drop Location", required: true, askAs: "drop location / destination", type: "text" },
    { name: "date", displayName: "Travel Date", required: true, askAs: "date of travel", type: "date" },
    { name: "time", displayName: "Pickup Time", required: true, askAs: "pickup time", type: "time" },
    { name: "tripType", displayName: "Trip Type", required: true, askAs: "one-way or round-trip (up and down)", type: "select", options: ["one-way", "round-trip"] },
    { name: "waitingTime", displayName: "Waiting Time", required: true, askAs: "how long should the driver wait at destination", type: "number", dependsOn: { field: "tripType", value: "round-trip" } },
    { name: "passengers", displayName: "Passengers", required: true, askAs: "number of passengers", type: "number" },
    { name: "tollPreference", displayName: "Toll Preference", required: true, askAs: "okay with toll roads (they may be faster)", type: "select", options: ["ok", "avoid", "no-preference"] },
    { name: "specialInstructions", displayName: "Special Instructions", required: true, askAs: "any special requests for the driver (luggage, AC, elderly passenger, etc.)", type: "text" },
  ],

  optionalFields: [
    { name: "vehicleType", displayName: "Vehicle Type", required: false, askAs: "vehicle preference (sedan, SUV, auto)", type: "select", options: ["sedan", "suv", "auto", "any"] },
    { name: "budget", displayName: "Budget", required: false, askAs: "budget in mind", type: "number" },
    { name: "preferredVendors", displayName: "Preferred Vendors", required: false, askAs: "any specific taxi company you prefer", type: "text" },
  ],

  completionMessage: "Perfect! I have all the details for your cab booking.",

  negotiationContext: `You are negotiating for cab/taxi service.
Key points to negotiate: base fare, toll charges, waiting charges, AC/non-AC rates.
Common extras: toll, parking, night charges, driver allowance for outstation.`,

  priceExtractionHints: [
    "toll", "parking", "waiting charges", "base fare", "per km rate",
    "night charges", "driver allowance", "AC charges"
  ],
};

// =============================================================================
// CATERER SERVICE CONFIG
// =============================================================================
export const CATERER_SERVICE: ServiceConfig = {
  id: "caterer",
  displayName: "Caterer",
  icon: "🍽️",
  googleSearchTerms: ["caterer", "catering service", "party caterer", "event catering", "tiffin service"],

  vendorPersona: `You are a friendly catering service coordinator at a catering company.
You are warm, helpful and understand food preferences well.
You ask about the event details naturally, like a real catering company would.
You understand dietary restrictions and can suggest options.
You ask ONE question at a time and listen carefully.`,

  greeting: "Hello! I can help you arrange catering. What's the occasion?",

  requiredFields: [
    { name: "eventType", displayName: "Event Type", required: true, askAs: "type of event (wedding, birthday, corporate, house party, puja, etc.)", type: "text" },
    { name: "guestCount", displayName: "Number of Guests", required: true, askAs: "how many guests to serve", type: "number" },
    { name: "date", displayName: "Event Date", required: true, askAs: "date of the event", type: "date" },
    { name: "mealTime", displayName: "Meal Time", required: true, askAs: "which meal (breakfast, lunch, dinner, or multiple)", type: "select", options: ["breakfast", "lunch", "dinner", "lunch-dinner", "all-day"] },
    { name: "cuisineType", displayName: "Cuisine Type", required: true, askAs: "cuisine preference (North Indian, South Indian, Chinese, Multi-cuisine)", type: "text" },
    { name: "foodType", displayName: "Veg/Non-Veg", required: true, askAs: "vegetarian, non-vegetarian, or both", type: "select", options: ["veg", "non-veg", "both"] },
    { name: "venueAddress", displayName: "Venue Address", required: true, askAs: "event venue / delivery location", type: "text" },
    { name: "serviceType", displayName: "Service Type", required: true, askAs: "need just food delivery or full service with servers and setup", type: "select", options: ["delivery-only", "full-service", "live-counter"] },
  ],

  optionalFields: [
    { name: "budget", displayName: "Budget per Plate", required: false, askAs: "budget per plate/person", type: "number" },
    { name: "menuPreferences", displayName: "Menu Preferences", required: false, askAs: "any specific dishes you want (starters, main course, desserts)", type: "text" },
    { name: "dietaryRestrictions", displayName: "Dietary Restrictions", required: false, askAs: "any dietary restrictions (Jain, no onion-garlic, allergies)", type: "text" },
    { name: "includeDrinks", displayName: "Include Drinks", required: false, askAs: "need beverages (soft drinks, mocktails, welcome drinks)", type: "select", options: ["yes", "no"] },
    { name: "crockeryNeeded", displayName: "Crockery Needed", required: false, askAs: "need crockery and cutlery or you have your own", type: "select", options: ["yes", "no"] },
    { name: "preferredVendors", displayName: "Preferred Caterers", required: false, askAs: "any specific caterer you prefer", type: "text" },
  ],

  completionMessage: "Wonderful! I have all the details for your catering requirement.",

  negotiationContext: `You are negotiating for catering service.
Key points to negotiate: per plate cost, minimum order quantity, service charges, crockery charges.
Common extras: live counters, welcome drinks, dessert counters, decoration, server charges.
Ask for package deals for the full guest count.`,

  priceExtractionHints: [
    "per plate", "per person", "minimum order", "service charge", "crockery charge",
    "server charge", "live counter", "package deal", "all inclusive"
  ],
};

// =============================================================================
// PHOTOGRAPHER SERVICE CONFIG
// =============================================================================
export const PHOTOGRAPHER_SERVICE: ServiceConfig = {
  id: "photographer",
  displayName: "Photographer",
  icon: "📸",
  googleSearchTerms: ["photographer", "photography studio", "wedding photographer", "event photographer", "photo studio"],

  vendorPersona: `You are a friendly photography studio coordinator.
You understand different types of photography needs - weddings, events, portraits, product shoots.
You ask about the event/shoot details naturally and help understand requirements.
You can suggest packages and ask about preferences professionally.
You ask ONE question at a time.`,

  greeting: "Hello! I can help you find a photographer. What type of shoot do you need?",

  requiredFields: [
    { name: "shootType", displayName: "Type of Shoot", required: true, askAs: "type of photography (wedding, pre-wedding, birthday, corporate event, portrait, product)", type: "text" },
    { name: "date", displayName: "Shoot Date", required: true, askAs: "date of the shoot/event", type: "date" },
    { name: "duration", displayName: "Duration", required: true, askAs: "how many hours of coverage needed", type: "number" },
    { name: "location", displayName: "Location", required: true, askAs: "shoot location / venue address", type: "text" },
    { name: "photoVideo", displayName: "Photo/Video", required: true, askAs: "need photos only, video only, or both", type: "select", options: ["photo-only", "video-only", "photo-video"] },
    { name: "deliverables", displayName: "Deliverables", required: true, askAs: "what you need delivered (soft copies, album, prints, edited video)", type: "text" },
  ],

  optionalFields: [
    { name: "teamSize", displayName: "Team Size", required: false, askAs: "how many photographers/videographers needed", type: "number" },
    { name: "budget", displayName: "Budget", required: false, askAs: "budget range in mind", type: "number" },
    { name: "style", displayName: "Photography Style", required: false, askAs: "preferred style (candid, traditional, cinematic, drone shots)", type: "text" },
    { name: "specialRequirements", displayName: "Special Requirements", required: false, askAs: "any special requirements (drone, same-day edit, photo booth)", type: "text" },
    { name: "preferredVendors", displayName: "Preferred Photographers", required: false, askAs: "any specific photographer/studio you prefer", type: "text" },
  ],

  completionMessage: "Great! I have all the details for your photography requirement.",

  negotiationContext: `You are negotiating for photography service.
Key points to negotiate: hourly rate vs package deal, number of edited photos, album pages, video duration.
Common extras: drone shots, same-day edit, extra photographer, photo booth, travel charges.
Ask about package deals that include album and video.`,

  priceExtractionHints: [
    "per hour", "package", "album", "edited photos", "raw photos", "video editing",
    "drone", "travel charge", "same day edit", "photo booth"
  ],
};

// =============================================================================
// SERVICE REGISTRY
// =============================================================================
export const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  cab: CAB_SERVICE,
  taxi: CAB_SERVICE, // Alias
  caterer: CATERER_SERVICE,
  catering: CATERER_SERVICE, // Alias
  photographer: PHOTOGRAPHER_SERVICE,
  photography: PHOTOGRAPHER_SERVICE, // Alias
};

// Service detection keywords
export const SERVICE_KEYWORDS: Record<string, string[]> = {
  cab: ["cab", "taxi", "car", "ride", "travel", "drop", "pickup", "airport transfer", "outstation"],
  caterer: ["caterer", "catering", "food", "party food", "event food", "tiffin", "cook", "chef"],
  photographer: ["photographer", "photography", "photo", "video", "shoot", "album", "wedding photographer", "cameraman"],
};

/**
 * Detect service type from user message
 */
export function detectServiceType(message: string): string | null {
  const lowerMessage = message.toLowerCase();

  for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        return service;
      }
    }
  }

  return null;
}

/**
 * Get service config by ID or detect from message
 */
export function getServiceConfig(serviceIdOrMessage: string): ServiceConfig | null {
  // Check if it's a known service ID
  if (SERVICE_CONFIGS[serviceIdOrMessage.toLowerCase()]) {
    return SERVICE_CONFIGS[serviceIdOrMessage.toLowerCase()];
  }

  // Try to detect from message
  const detectedService = detectServiceType(serviceIdOrMessage);
  if (detectedService) {
    return SERVICE_CONFIGS[detectedService];
  }

  return null;
}

/**
 * Get list of all available services
 */
export function getAvailableServices(): { id: string; displayName: string; icon: string }[] {
  const seen = new Set<string>();
  const services: { id: string; displayName: string; icon: string }[] = [];

  for (const config of Object.values(SERVICE_CONFIGS)) {
    if (!seen.has(config.id)) {
      seen.add(config.id);
      services.push({
        id: config.id,
        displayName: config.displayName,
        icon: config.icon,
      });
    }
  }

  return services;
}

/**
 * Build the extraction prompt for a specific service
 */
export function buildExtractionPrompt(config: ServiceConfig): string {
  const requiredFieldsList = config.requiredFields
    .map((f) => {
      let desc = `- ${f.displayName} (${f.name}): Ask as "${f.askAs}"`;
      if (f.options) {
        desc += ` [Options: ${f.options.join(", ")}]`;
      }
      if (f.dependsOn) {
        desc += ` [Only if ${f.dependsOn.field} = ${f.dependsOn.value}]`;
      }
      return desc;
    })
    .join("\n");

  const optionalFieldsList = config.optionalFields
    .map((f) => {
      let desc = `- ${f.displayName} (${f.name}): Ask as "${f.askAs}"`;
      if (f.options) {
        desc += ` [Options: ${f.options.join(", ")}]`;
      }
      return desc;
    })
    .join("\n");

  const allFieldNames = [
    ...config.requiredFields.map((f) => f.name),
    ...config.optionalFields.map((f) => f.name),
  ];

  return `${config.vendorPersona}

Your job is to collect all necessary information to provide a ${config.displayName} quote.

REQUIRED FIELDS (must collect ALL of these):
${requiredFieldsList}

OPTIONAL FIELDS (ask if relevant or if customer mentions):
${optionalFieldsList}

IMPORTANT RULES:
1. Ask ONE question at a time - don't overwhelm the customer
2. Be conversational and natural - like a real ${config.displayName.toLowerCase()} vendor would talk
3. Acknowledge what the customer says before asking the next question
4. If customer says "no" or "nothing" for optional fields, that's fine - move on
5. Only mark isComplete=true when ALL required fields are collected
6. Look for any vendor/company names the customer wants to use - add to preferredVendors

RESPONSE FORMAT (JSON):
{
  "extracted": {
    "service": "${config.id}",
    ${allFieldNames.map((f) => `"${f}": "extracted value or null"`).join(",\n    ")},
    "preferredVendors": ["any vendor names mentioned"] or null,
    "additionalDetails": "any other relevant info"
  },
  "isComplete": boolean,
  "missingFields": ["list of missing required fields"],
  "followUpQuestion": "Your next natural question, or null if complete"
}

Be warm, helpful, and professional. Speak like a real ${config.displayName.toLowerCase()} service coordinator would.`;
}
