import { ChatOpenAI } from "@langchain/openai";
import {
  NegotiatorGraphState,
  HumanInterruptState,
  HITLCacheEntry,
  createAgentEvent,
  AgentEvent
} from "../types";
import { v4 as uuidv4 } from "uuid";

// Question categories for cache matching
const QUESTION_CATEGORIES = {
  address: [/address/i, /location/i, /pickup.*point/i, /exact.*place/i, /where.*exactly/i, /building/i, /floor/i, /gate/i, /entrance/i, /landmark/i],
  contact: [/contact.*(number|details)/i, /phone/i, /mobile/i, /call.*back/i],
  name: [/what.*your.*name/i, /who.*am.*i.*speaking/i, /customer.*name/i],
  preferences: [/child.*seat/i, /luggage/i, /ac/i, /music/i, /special.*(requirement|request)/i, /prefer/i],
  payment: [/pay/i, /advance/i, /upfront/i, /cash/i, /online/i, /payment.*(method|mode)/i],
  timing: [/exact.*time/i, /how.*long.*(wait|waiting)/i, /can.*(wait|hold)/i],
  confirmation: [/confirm.*(booking|reservation)/i, /want.*to.*book.*now/i, /shall.*i.*confirm/i],
};

// Normalize question to a category pattern for cache matching
export function normalizeQuestionToPattern(question: string): string {
  const questionLower = question.toLowerCase();

  for (const [category, patterns] of Object.entries(QUESTION_CATEGORIES)) {
    for (const pattern of patterns) {
      if (pattern.test(questionLower)) {
        return category;
      }
    }
  }

  // For unrecognized questions, create a simplified pattern
  // Remove vendor-specific words and numbers, keep key words
  const simplified = questionLower
    .replace(/[0-9]+/g, '')
    .replace(/\b(please|kindly|can|could|would|will|do|does|is|are|the|a|an|your|my|our|their)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `generic:${simplified.substring(0, 50)}`;
}

// Find cached response for a question
export function findCachedResponse(
  question: string,
  cache: HITLCacheEntry[]
): HITLCacheEntry | null {
  const pattern = normalizeQuestionToPattern(question);

  // First try exact pattern match
  const exactMatch = cache.find(entry => entry.questionPattern === pattern);
  if (exactMatch) {
    return exactMatch;
  }

  // For category-based patterns, match on category
  if (!pattern.startsWith('generic:')) {
    return cache.find(entry => entry.questionPattern === pattern) || null;
  }

  return null;
}

// Create a cache entry from a HITL response
export function createCacheEntry(
  question: string,
  response: string
): HITLCacheEntry {
  return {
    questionPattern: normalizeQuestionToPattern(question),
    originalQuestion: question,
    response,
    answeredAt: new Date(),
    usedCount: 1,
  };
}

// Update cache entry when reused
export function incrementCacheUsage(entry: HITLCacheEntry): HITLCacheEntry {
  return {
    ...entry,
    usedCount: entry.usedCount + 1,
  };
}

// Create event for cache hit (using previously answered question)
export function createCacheHitEvent(
  question: string,
  cachedResponse: string,
  originalQuestion: string
): AgentEvent {
  return createAgentEvent(
    "human_interrupt_resolved",
    "negotiator.human_interrupt",
    `Using cached response for similar question (previously asked: "${originalQuestion}")`,
    {
      currentQuestion: question,
      originalQuestion,
      cachedResponse,
      fromCache: true,
    }
  );
}

// Patterns that indicate questions the agent cannot answer
const UNANSWERABLE_PATTERNS = [
  // Address related
  /what.*(address|location|pickup.*point|exact.*place)/i,
  /where.*exactly/i,
  /which.*(building|floor|gate|entrance)/i,
  /landmark/i,

  // Personal details
  /what.*your.*name/i,
  /who.*am.*i.*speaking/i,
  /contact.*(number|details)/i,

  // Specific preferences
  /(do you|will you).*(need|want|require).*(child.*seat|luggage|ac|music)/i,
  /any.*special.*(requirement|request)/i,

  // Payment related
  /(can you|will you).*(pay|advance|upfront|cash|online)/i,
  /payment.*(method|mode)/i,

  // Timing related
  /exact.*time/i,
  /how.*long.*(wait|waiting)/i,
  /can.*(wait|hold)/i,

  // Confirmation
  /confirm.*(booking|reservation)/i,
  /want.*to.*book.*now/i,
  /shall.*i.*confirm/i,
];

// Questions that the agent should NOT interrupt for (can handle itself)
const HANDLEABLE_PATTERNS = [
  /what.*price/i,
  /how.*much/i,
  /rate/i,
  /discount/i,
  /available/i,
  /when.*pick/i,
  /what.*car/i,
  /vehicle.*type/i,
];

// Detect if vendor asked a question that needs human input
export function detectUnanswerableQuestion(
  vendorMessage: string
): {
  needsHumanInput: boolean;
  question: string | null;
  reason: string | null;
} {
  // Check if it's a question we can handle
  if (HANDLEABLE_PATTERNS.some(pattern => pattern.test(vendorMessage))) {
    return {
      needsHumanInput: false,
      question: null,
      reason: null,
    };
  }

  // Check for unanswerable patterns
  for (const pattern of UNANSWERABLE_PATTERNS) {
    if (pattern.test(vendorMessage)) {
      return {
        needsHumanInput: true,
        question: vendorMessage,
        reason: "Vendor asked for specific details that require user input",
      };
    }
  }

  // Check for general question marks with context that might need human input
  if (vendorMessage.includes("?")) {
    // Use simple heuristics for other questions
    const questionLower = vendorMessage.toLowerCase();
    if (
      questionLower.includes("you") ||
      questionLower.includes("your") ||
      questionLower.includes("want") ||
      questionLower.includes("need") ||
      questionLower.includes("prefer")
    ) {
      return {
        needsHumanInput: true,
        question: vendorMessage,
        reason: "Vendor asked a preference question",
      };
    }
  }

  return {
    needsHumanInput: false,
    question: null,
    reason: null,
  };
}

// Use LLM to analyze if vendor question needs human input
export async function analyzeQuestionWithLLM(
  vendorMessage: string,
  conversationContext: string
): Promise<{
  needsHumanInput: boolean;
  question: string | null;
  reason: string | null;
  suggestedResponse: string | null;
}> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.3,
  });

  const prompt = `Analyze this vendor message during a cab/service booking negotiation call.

Conversation context:
${conversationContext}

Vendor's message: "${vendorMessage}"

Determine:
1. Is the vendor asking a question that requires specific user information that the AI agent doesn't have?
   - Things like: exact address, personal contact, specific preferences, payment confirmation, booking confirmation
2. Or is this something the agent can handle itself?
   - Things like: price negotiation, availability check, vehicle type info, timing discussion

Respond in JSON:
{
  "needsHumanInput": boolean,
  "question": "the specific question if needs human input, or null",
  "reason": "why human input is needed, or null",
  "suggestedResponse": "if agent can handle, suggest what to say; if human needed, how to politely pause"
}`;

  try {
    const response = await model.invoke(prompt);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        needsHumanInput: result.needsHumanInput || false,
        question: result.question || null,
        reason: result.reason || null,
        suggestedResponse: result.suggestedResponse || null,
      };
    }
  } catch (error) {
    console.error("LLM question analysis error:", error);
  }

  // Default: try pattern-based detection
  const patternResult = detectUnanswerableQuestion(vendorMessage);
  return {
    ...patternResult,
    suggestedResponse: patternResult.needsHumanInput
      ? "One moment please, let me check."
      : null,
  };
}

// Create human interrupt state
export function createHumanInterrupt(
  question: string,
  reason: string,
  context: string
): HumanInterruptState {
  return {
    active: true,
    interruptId: uuidv4(),
    reason,
    vendorQuestion: question,
    context,
    requestedAt: new Date(),
    response: null,
    respondedAt: null,
  };
}

// Create event for human interrupt request
export function createHumanInterruptRequestEvent(
  question: string,
  reason: string,
  interruptId: string
): AgentEvent {
  return createAgentEvent(
    "human_interrupt_requested",
    "negotiator.human_interrupt",
    `Pausing for human input: ${reason}`,
    {
      interruptId,
      question,
      reason,
      waitingForResponse: true,
    }
  );
}

// Create event for human interrupt resolution
export function createHumanInterruptResolvedEvent(
  interruptId: string,
  response: string
): AgentEvent {
  return createAgentEvent(
    "human_interrupt_resolved",
    "negotiator.human_interrupt",
    `Human response received, resuming negotiation`,
    {
      interruptId,
      response,
    }
  );
}

// Generate response incorporating human input
export async function generateResponseWithHumanInput(
  originalQuestion: string,
  humanResponse: string,
  language: string,
  context: string
): Promise<string> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.5,
  });

  const languageInstructions: Record<string, string> = {
    kn: "Respond in Kannada (ಕನ್ನಡ)",
    hi: "Respond in Hindi (हिंदी)",
    te: "Respond in Telugu (తెలుగు)",
    en: "Respond in English",
  };

  const prompt = `Generate a natural response for a negotiation call.

The vendor asked: "${originalQuestion}"
The user provided this answer: "${humanResponse}"

Context: ${context}

${languageInstructions[language] || languageInstructions.en}

Generate a natural, conversational response that:
1. Answers the vendor's question using the user's input
2. Continues the negotiation flow
3. Sounds natural and polite

Respond with just the response text, no JSON or formatting.`;

  try {
    const response = await model.invoke(prompt);
    return typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  } catch (error) {
    console.error("Response generation error:", error);
    return humanResponse; // Fallback to direct response
  }
}

// Phrases to use when pausing for human input
export const PAUSE_PHRASES: Record<string, string> = {
  kn: "ಒಂದು ನಿಮಿಷ ಹೋಲ್ಡ್ ಮಾಡಿ, ನಾನು ಚೆಕ್ ಮಾಡಿ ಹೇಳ್ತೀನಿ.",
  hi: "एक मिनट होल्ड कीजिए, मैं चेक करके बताता हूं.",
  te: "ఒక నిమిషం ఆగండి, నేను చెక్ చేసి చెప్తాను.",
  en: "One moment please, let me check on that.",
};

// Check if state indicates waiting for human input
export function isWaitingForHumanInput(state: NegotiatorGraphState): boolean {
  return state.humanInterrupt.active && state.humanInterrupt.response === null;
}

// Resolve human interrupt with response and cache the answer
export function resolveHumanInterrupt(
  state: NegotiatorGraphState,
  response: string
): Partial<NegotiatorGraphState> {
  if (!state.humanInterrupt.active) {
    return {};
  }

  const question = state.humanInterrupt.vendorQuestion || "";

  // Create cache entry for this response
  const cacheEntry = createCacheEntry(question, response);

  return {
    humanInterrupt: {
      ...state.humanInterrupt,
      response,
      respondedAt: new Date(),
    },
    // Add to cache so same question won't be asked again
    hitlResponseCache: [cacheEntry],
    agentEvents: [
      createHumanInterruptResolvedEvent(
        state.humanInterrupt.interruptId || "",
        response
      ),
    ],
  };
}

// Check if question can be answered from cache, returns cached response or null
export function checkCacheForQuestion(
  state: NegotiatorGraphState,
  question: string
): { found: boolean; response: string | null; cacheEntry: HITLCacheEntry | null } {
  const cachedEntry = findCachedResponse(question, state.hitlResponseCache);

  if (cachedEntry) {
    return {
      found: true,
      response: cachedEntry.response,
      cacheEntry: incrementCacheUsage(cachedEntry),
    };
  }

  return {
    found: false,
    response: null,
    cacheEntry: null,
  };
}
