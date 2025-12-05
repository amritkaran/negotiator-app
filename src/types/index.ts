// Core types for the Negotiator app

export interface UserRequirement {
  service: string; // e.g., "cab", "plumber", "caterer"
  from?: string; // origin location
  to?: string; // destination location
  date?: string; // when needed
  time?: string; // preferred time
  passengers?: number; // for cabs
  vehicleType?: string; // e.g., "sedan", "suv", "auto"
  budget?: number; // max budget
  additionalDetails?: string;
  userLocation?: {
    lat: number;
    lng: number;
  };
  // New mandatory fields for cab bookings
  tripType?: "one-way" | "round-trip"; // one-way or up-and-down
  waitingTime?: number; // waiting time in minutes (for round trips)
  tollPreference?: "ok" | "avoid" | "no-preference"; // whether user is ok with toll roads
  specialInstructions?: string; // any special instructions for the vendor
  preferredVendors?: string[]; // vendor names to prioritize (call first)
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
