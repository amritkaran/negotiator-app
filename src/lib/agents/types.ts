import { Business, UserRequirement, CallResult } from "@/types";

// Agent Types
export type AgentType =
  | "intake"
  | "research"
  | "research.price_intel"
  | "research.review_analyzer"
  | "research.vendor_ranker"
  | "negotiator"
  | "negotiator.calling"
  | "negotiator.human_interrupt"
  | "learning"
  | "learning.call_analyzer"
  | "learning.safety_checker"
  | "learning.prompt_enhancer"
  | "verification";

export type SupportedLanguage = "kn" | "hi" | "en" | "te";

// Event Types for Frontend Streaming
export type AgentEventType =
  | "agent_started"
  | "agent_completed"
  | "agent_error"
  | "handoff"
  | "sub_agent_started"
  | "sub_agent_completed"
  | "human_interrupt_requested"
  | "human_interrupt_resolved"
  | "language_switched"
  | "call_started"
  | "call_progress"
  | "call_ended"
  | "call_summary"
  | "awaiting_call_decision"
  | "learning_insight"
  | "prompt_enhanced"
  | "verification_started"
  | "verification_completed"
  | "state_update"
  | "price_verification_needed"
  | "price_corrected";

export interface AgentEvent {
  id: string;
  timestamp: Date;
  type: AgentEventType;
  agent: AgentType;
  message: string;
  data?: Record<string, unknown>;
}

// Price Intelligence Results
export interface PriceIntelResult {
  estimatedDistance: number; // km
  estimatedDuration: number; // minutes
  baselinePrice: {
    low: number;
    mid: number;
    high: number;
  };
  factors: string[];
  dataSource: string;
  confidence: "high" | "medium" | "low";
  webSearchSources?: string[]; // Sources used from web search (Perplexity)
}

// Review Analysis Results
export interface ReviewAnalysisResult {
  businessId: string;
  businessName: string;
  rating: number;
  reviewCount: number;
  sentiment: "positive" | "neutral" | "negative";
  pricePerception: "cheap" | "fair" | "expensive" | "unknown";
  professionalism: "high" | "medium" | "low";
  redFlags: string[];
  positives: string[];
  negotiationLeverage: string[];
  sampleReviews: string[];
}

// Vendor Ranking Results
export interface VendorRankingResult {
  rankedVendors: RankedVendor[];
  rankingCriteria: string[];
}

export interface RankedVendor {
  business: Business;
  score: number;
  ranking: number;
  strengths: string[];
  weaknesses: string[];
  negotiationStrategy: string;
  estimatedPriceRange: {
    low: number;
    high: number;
  };
}

// Research Results
export interface ResearchResult {
  priceIntel: PriceIntelResult | null;
  reviewAnalysis: ReviewAnalysisResult[];
  vendorRanking: VendorRankingResult | null;
  completedAt: Date;
}

// Human Interrupt State
export interface HumanInterruptState {
  active: boolean;
  interruptId: string | null;
  reason: string | null;
  vendorQuestion: string | null;
  context: string | null;
  requestedAt: Date | null;
  response: string | null;
  respondedAt: Date | null;
}

// Call Decision State - for "one call at a time" flow
export interface CallDecisionState {
  awaitingDecision: boolean;
  lastCallSummary: {
    vendorName: string;
    vendorPhone: string;
    quotedPrice: number | null;
    negotiatedPrice: number | null;
    callDuration: number; // seconds
    outcome: "success" | "failed" | "no_answer" | "busy";
    highlights: string[];
  } | null;
  vendorsRemaining: number;
  currentBestPrice: number | null;
  currentBestVendor: string | null;
  userDecision: "continue" | "stop" | null;
}

// HITL Response Cache Entry - stores previously answered questions
export interface HITLCacheEntry {
  questionPattern: string; // Normalized question pattern for matching
  originalQuestion: string; // The original question asked
  response: string; // User's response
  answeredAt: Date;
  usedCount: number; // How many times this cached response has been used
}

// Call State
export interface NegotiationCallState {
  callId: string;
  businessId: string;
  businessName: string;
  status: "pending" | "calling" | "in_progress" | "completed" | "failed";
  startedAt: Date | null;
  endedAt: Date | null;
  language: SupportedLanguage;
  languageSwitches: Array<{
    from: SupportedLanguage;
    to: SupportedLanguage;
    reason: string;
    timestamp: Date;
  }>;
  transcript: string | null;
  quotedPrice: number | null;
  negotiatedPrice: number | null;
  humanInterrupts: Array<{
    question: string;
    response: string;
    timestamp: Date;
  }>;
  result: CallResult | null;
}

// Vendor Experience Analysis
export interface VendorExperienceResult {
  score: number; // 0-100, where 100 = excellent experience
  repetitionsRequired: number; // How many times vendor had to repeat themselves
  misunderstandings: string[]; // Things the bot misunderstood or ignored
  frustrationIndicators: string[]; // Signs of vendor frustration observed
  redundantQuestions: string[]; // Questions already answered that bot asked again
  positiveInteractions: string[]; // Things the bot did well from vendor's perspective
  suggestions: string[]; // Specific improvements to reduce vendor frustration
}

// Learning Results
export interface CallAnalysisResult {
  callId: string;
  effectiveness: number; // 0-100
  successfulTactics: string[];
  failedTactics: string[];
  vendorPersonality: "aggressive" | "flexible" | "professional" | "difficult" | "friendly";
  lessonsLearned: string[];
  objectionsFaced: Array<{
    objection: string;
    response: string;
    outcome: "successful" | "failed";
  }>;
  vendorExperience?: VendorExperienceResult; // Vendor UX analysis
}

export interface SafetyCheckResult {
  callId: string;
  safetyScore: number; // 0-100
  toxicityDetected: boolean;
  issues: string[];
  agentIssues: string[];
  vendorIssues: string[];
  recommendations: string[];
}

export interface PromptEnhancement {
  version: number;
  createdAt: Date;
  basedOnCallIds: string[];
  effectivePhrases: string[];
  avoidPhrases: string[];
  objectionHandlers: Record<string, string>;
  culturalNotes: string[];
  languageSpecificTips: Record<SupportedLanguage, string[]>;
  promptAdditions: string;
}

export interface LearningResult {
  callAnalysis: CallAnalysisResult | null;
  safetyCheck: SafetyCheckResult | null;
  promptEnhancement: PromptEnhancement | null;
}

// Verification Results
export interface VerificationResult {
  callId: string;
  verified: boolean;
  verificationCallId: string | null;
  discrepancies: Array<{
    field: string;
    negotiated: string;
    confirmed: string;
    severity: "minor" | "major" | "critical";
  }>;
  finalConfirmation: {
    price: number;
    pickupTime: string;
    pickupDate: string;
    vehicle: string;
    driverContact: string | null;
    paymentTerms: string | null;
  } | null;
  vendorConfirmed: boolean;
  notes: string;
}

// Main State Schema for LangGraph
export interface NegotiatorGraphState {
  // Session Info
  sessionId: string;
  startedAt: Date;

  // Current Agent Tracking
  currentAgent: AgentType;
  previousAgents: AgentType[];
  agentEvents: AgentEvent[];

  // User Requirements
  requirements: UserRequirement | null;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>;

  // Businesses Found
  businesses: Business[];

  // Research Results
  research: ResearchResult | null;

  // Negotiation State
  negotiation: {
    currentVendorIndex: number;
    lowestPriceSoFar: number | null;
    bestVendorSoFar: string | null;
    calls: NegotiationCallState[];
    totalCallsMade: number;
  };

  // Human-in-the-Loop
  humanInterrupt: HumanInterruptState;
  hitlResponseCache: HITLCacheEntry[]; // Cache of previously answered HITL questions

  // Call Decision - for "one call at a time" flow
  callDecision: CallDecisionState;

  // Language
  currentLanguage: SupportedLanguage;
  defaultLanguage: SupportedLanguage;

  // Learning
  learning: {
    sessionLearnings: string[];
    callAnalyses: CallAnalysisResult[];
    safetyChecks: SafetyCheckResult[];
    currentPromptEnhancement: PromptEnhancement | null;
  };

  // Verification
  verification: VerificationResult | null;

  // Final Result
  bestDeal: {
    vendor: Business;
    price: number;
    details: string;
    verificationStatus: "pending" | "verified" | "discrepancy" | "skipped";
  } | null;

  // Error Handling
  errors: Array<{
    agent: AgentType;
    error: string;
    timestamp: Date;
    recoverable: boolean;
  }>;

  // Flow Control
  shouldContinue: boolean;
  skipVerification: boolean;
}

// Initial State Factory
export function createInitialState(sessionId: string): NegotiatorGraphState {
  return {
    sessionId,
    startedAt: new Date(),
    currentAgent: "intake",
    previousAgents: [],
    agentEvents: [],
    requirements: null,
    conversationHistory: [],
    businesses: [],
    research: null,
    negotiation: {
      currentVendorIndex: 0,
      lowestPriceSoFar: null,
      bestVendorSoFar: null,
      calls: [],
      totalCallsMade: 0,
    },
    humanInterrupt: {
      active: false,
      interruptId: null,
      reason: null,
      vendorQuestion: null,
      context: null,
      requestedAt: null,
      response: null,
      respondedAt: null,
    },
    hitlResponseCache: [],
    callDecision: {
      awaitingDecision: false,
      lastCallSummary: null,
      vendorsRemaining: 0,
      currentBestPrice: null,
      currentBestVendor: null,
      userDecision: null,
    },
    currentLanguage: "kn",
    defaultLanguage: "kn",
    learning: {
      sessionLearnings: [],
      callAnalyses: [],
      safetyChecks: [],
      currentPromptEnhancement: null,
    },
    verification: null,
    bestDeal: null,
    errors: [],
    shouldContinue: true,
    skipVerification: false,
  };
}

// Helper to create agent events
export function createAgentEvent(
  type: AgentEventType,
  agent: AgentType,
  message: string,
  data?: Record<string, unknown>
): AgentEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    type,
    agent,
    message,
    data,
  };
}

// State annotation for LangGraph
export const graphStateChannels = {
  sessionId: { default: () => "" },
  startedAt: { default: () => new Date() },
  currentAgent: { default: () => "intake" as AgentType },
  previousAgents: { default: () => [] as AgentType[] },
  agentEvents: {
    default: () => [] as AgentEvent[],
    reducer: (current: AgentEvent[], update: AgentEvent[]) => [...current, ...update]
  },
  requirements: { default: () => null },
  conversationHistory: {
    default: () => [],
    reducer: (current: Array<{role: "user" | "assistant"; content: string; timestamp: Date}>, update: Array<{role: "user" | "assistant"; content: string; timestamp: Date}>) => [...current, ...update]
  },
  businesses: { default: () => [] as Business[] },
  research: { default: () => null },
  negotiation: {
    default: () => ({
      currentVendorIndex: 0,
      lowestPriceSoFar: null,
      bestVendorSoFar: null,
      calls: [],
      totalCallsMade: 0,
    })
  },
  humanInterrupt: {
    default: () => ({
      active: false,
      interruptId: null,
      reason: null,
      vendorQuestion: null,
      context: null,
      requestedAt: null,
      response: null,
      respondedAt: null,
    })
  },
  hitlResponseCache: {
    default: () => [] as HITLCacheEntry[],
    reducer: (current: HITLCacheEntry[], update: HITLCacheEntry[]) => {
      // Merge caches, updating existing entries if same questionPattern
      const merged = [...current];
      for (const newEntry of update) {
        const existingIndex = merged.findIndex(e => e.questionPattern === newEntry.questionPattern);
        if (existingIndex >= 0) {
          merged[existingIndex] = newEntry;
        } else {
          merged.push(newEntry);
        }
      }
      return merged;
    }
  },
  callDecision: {
    default: () => ({
      awaitingDecision: false,
      lastCallSummary: null,
      vendorsRemaining: 0,
      currentBestPrice: null,
      currentBestVendor: null,
      userDecision: null,
    })
  },
  currentLanguage: { default: () => "kn" as SupportedLanguage },
  defaultLanguage: { default: () => "kn" as SupportedLanguage },
  learning: {
    default: () => ({
      sessionLearnings: [],
      callAnalyses: [],
      safetyChecks: [],
      currentPromptEnhancement: null,
    })
  },
  verification: { default: () => null },
  bestDeal: { default: () => null },
  errors: {
    default: () => [],
    reducer: (current: Array<{agent: AgentType; error: string; timestamp: Date; recoverable: boolean}>, update: Array<{agent: AgentType; error: string; timestamp: Date; recoverable: boolean}>) => [...current, ...update]
  },
  shouldContinue: { default: () => true },
  skipVerification: { default: () => false },
};
