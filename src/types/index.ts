// Core types for the Negotiator app

// Negotiator persona type
export type NegotiatorPersona = "preet";

export interface NegotiatorPersonaConfig {
  id: NegotiatorPersona;
  name: string;
  description: string;
  style: string;
}

export const NEGOTIATOR_PERSONAS: Record<NegotiatorPersona, NegotiatorPersonaConfig> = {
  preet: {
    id: "preet",
    name: "Preet",
    description: "Independent Woman",
    style: "Professional negotiator who negotiates once if prices seem high",
  },
};

export interface UserRequirement {
  service: string; // e.g., "cab", "caterer", "photographer"

  // Common fields across all services
  date?: string; // when needed
  time?: string; // preferred time
  budget?: number; // max budget
  additionalDetails?: string;
  preferredVendors?: string[]; // vendor names to prioritize (call first)

  // Location (used by cab, caterer, photographer)
  from?: string; // origin/pickup location
  to?: string; // destination location
  userLocation?: {
    lat: number;
    lng: number;
  };

  // Cab-specific fields (kept for backward compatibility)
  passengers?: number;
  vehicleType?: string; // e.g., "sedan", "suv", "auto"
  tripType?: "one-way" | "round-trip";
  waitingTime?: number; // waiting time in minutes (for round trips)
  tollPreference?: "ok" | "avoid" | "no-preference";
  specialInstructions?: string;

  // Dynamic service-specific fields
  // Caterer: eventType, guestCount, mealTime, cuisineType, foodType, venueAddress, serviceType, menuPreferences, dietaryRestrictions
  // Photographer: shootType, duration, location, photoVideo, deliverables, teamSize, style, specialRequirements
  serviceFields?: Record<string, unknown>;

  // Custom speech phrases - Bot will say EXACTLY what user types here
  // These override the default location/date/time formatting
  speechPhrases?: {
    pickupPhrase?: string;   // e.g., "Koramangala se" - how to say pickup location
    dropPhrase?: string;     // e.g., "Airport tak" - how to say drop location
    datePhrase?: string;     // e.g., "bees December ko" - how to say the date
    timePhrase?: string;     // e.g., "subah aath baje" - how to say the time
  };

  // Status
  isComplete: boolean;
  missingFields: string[];
}

export interface Business {
  id: string;
  name: string;
  phone: string;
  address: string;
  rating: number;
  reviewCount: number;
  distance: number; // in km
  placeId: string;
  types: string[];
}

export interface CallResult {
  businessId: string;
  businessName: string;
  phone: string;
  status: "completed" | "no_answer" | "busy" | "rejected" | "failed";
  quotedPrice?: number;
  notes?: string;
  transcript?: string;
  duration?: number; // in seconds
  callId?: string;
  recordingUrl?: string; // VAPI call recording URL
  endedReason?: string; // VAPI detailed reason (e.g., "customer-ended-call", "voicemail", "assistant-ended-call")
}

export interface Quote {
  business: Business;
  price: number;
  notes: string;
  isRecommended: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: {
    stage?: AppStage;
    businesses?: Business[];
    callResults?: CallResult[];
    quotes?: Quote[];
  };
}

export type AppStage =
  | "gathering_requirements"
  | "searching_businesses"
  | "planning_calls"
  | "making_calls"
  | "presenting_results";

export interface AppState {
  stage: AppStage;
  messages: ChatMessage[];
  requirements: UserRequirement | null;
  businesses: Business[];
  callResults: CallResult[];
  isProcessing: boolean;
}
