/**
 * Deterministic Sanity Checks for Negotiation Analysis
 * These are rule-based checks that don't rely on LLM reasoning
 */

export interface ChatMessage {
  role: "agent" | "vendor" | "human";
  content: string;
  thinking?: string;
}

export interface SanityCheckResult {
  type: "price_mismatch" | "illogical_counter" | "requirement_mismatch" | "vendor_frustration" | "flow_issue" | "context_ignored" | "redundant_question";
  severity: "low" | "medium" | "high";
  message: string;
  details: Record<string, unknown>;
}

export interface ConversationFlowAnalysis {
  issues: SanityCheckResult[];
  flowSummary: string;
  turnByTurnAnalysis: Array<{
    turn: number;
    speaker: "agent" | "vendor";
    summary: string;
    issue?: string;
  }>;
}

export interface Requirements {
  service?: string;
  from?: string;
  to?: string;
  date?: string;
  time?: string;
  passengers?: number;
  vehicleType?: string;
}

/**
 * Extract all prices mentioned in a text
 * Returns array of {value, context} for each price found
 */
export function extractAllPrices(text: string): Array<{ value: number; context: string }> {
  const prices: Array<{ value: number; context: string }> = [];
  const lowerText = text.toLowerCase();

  // Helper to add price without duplicates
  const addPrice = (value: number, matchIndex: number, matchLength: number) => {
    if (value >= 100 && value <= 50000) {
      const start = Math.max(0, matchIndex - 30);
      const end = Math.min(text.length, matchIndex + matchLength + 30);
      const context = text.slice(start, end);
      // Avoid duplicates (same value and similar position)
      if (!prices.some(p => p.value === value && Math.abs(text.indexOf(p.context) - start) < 10)) {
        prices.push({ value, context });
      }
    }
  };

  // Pattern 1: ₹X or Rs X or Rs. X (handles 1,200 format)
  const rupeesPattern = /(?:₹|rs\.?\s*)(\d{1,2},\d{3}|\d+)/gi;
  let match;
  while ((match = rupeesPattern.exec(text)) !== null) {
    const value = parseInt(match[1].replace(/,/g, ""), 10);
    addPrice(value, match.index, match[0].length);
  }

  // Pattern 2: X rupees (handles 1,200 format)
  const wordPattern = /(\d{1,2},\d{3}|\d+)\s*(?:rupees?|rs)/gi;
  while ((match = wordPattern.exec(text)) !== null) {
    const value = parseInt(match[1].replace(/,/g, ""), 10);
    addPrice(value, match.index, match[0].length);
  }

  // Pattern 3: "charges are 1,200" or "cost is 1200"
  const phrasePattern = /(?:charges?|cost|price|rate|fare)\s+(?:is|are|will be)?\s*(\d{1,2},\d{3}|\d+)/gi;
  while ((match = phrasePattern.exec(text)) !== null) {
    const value = parseInt(match[1].replace(/,/g, ""), 10);
    addPrice(value, match.index, match[0].length);
  }

  // Pattern 4: Standalone number with comma like "1,200" or "10,000" (looks like price)
  const commaNumberPattern = /\b(\d{1,2},\d{3})\b/g;
  while ((match = commaNumberPattern.exec(text)) !== null) {
    const value = parseInt(match[1].replace(/,/g, ""), 10);
    addPrice(value, match.index, match[0].length);
  }

  // Pattern 5: Standalone 3-4 digit number in price context
  const contextualNumberPattern = /(?:^|[^\d])(\d{3,4})(?:[^\d]|$)/g;
  while ((match = contextualNumberPattern.exec(text)) !== null) {
    const value = parseInt(match[1], 10);
    // Only add if it's a plausible cab price (500-10000 range for standalone numbers)
    if (value >= 500 && value <= 10000) {
      addPrice(value, match.index, match[0].length);
    }
  }

  // Pattern 6: Spelled out numbers (common ones)
  const spelledNumbers: Record<string, number> = {
    "eight hundred": 800, "nine hundred": 900, "one thousand": 1000,
    "eleven hundred": 1100, "twelve hundred": 1200, "thirteen hundred": 1300,
    "fourteen hundred": 1400, "fifteen hundred": 1500, "two thousand": 2000,
  };
  for (const [spelled, value] of Object.entries(spelledNumbers)) {
    const idx = lowerText.indexOf(spelled);
    if (idx !== -1) {
      addPrice(value, idx, spelled.length);
    }
  }

  return prices;
}

/**
 * Check if a price mention is the vendor quoting what the agent said
 * (e.g., "you said 1000" or "another vendor offered 1000")
 */
function isPriceQuotingAgentWords(context: string): boolean {
  const lowerContext = context.toLowerCase();
  const quotePatterns = [
    /you\s+(?:said|mentioned|quoted|offered)/,
    /another\s+vendor\s+(?:said|mentioned|quoted|offered)/,
    /other\s+vendor/,
    /if\s+(?:another|other)/,
    /why\s+(?:are|aren't)\s+you/,
    /you\s+told\s+me/,
  ];
  return quotePatterns.some(p => p.test(lowerContext));
}

/**
 * Verify if the extracted quotedPrice matches what vendor actually said
 */
export function verifyPriceExtraction(
  messages: ChatMessage[],
  extractedPrice: number | null,
  baselinePrice: { low: number; mid: number; high: number }
): SanityCheckResult | null {
  if (!extractedPrice) return null;

  // Collect all vendor price mentions
  const vendorPrices: Array<{ value: number; context: string; isQuotingAgent: boolean }> = [];

  for (const msg of messages) {
    if (msg.role === "vendor") {
      const prices = extractAllPrices(msg.content);
      for (const p of prices) {
        vendorPrices.push({
          ...p,
          isQuotingAgent: isPriceQuotingAgentWords(p.context),
        });
      }
    }
  }

  // Filter out prices where vendor is quoting what agent said
  const actualVendorQuotes = vendorPrices.filter(p => !p.isQuotingAgent);

  // Check if extractedPrice matches any actual vendor quote
  const matchesActualQuote = actualVendorQuotes.some(p => p.value === extractedPrice);

  // Check if extractedPrice matches a "quoting agent" price (likely wrong)
  const matchesQuotedAgentPrice = vendorPrices.some(
    p => p.isQuotingAgent && p.value === extractedPrice
  );

  if (matchesQuotedAgentPrice && !matchesActualQuote) {
    // Find what the actual vendor price was
    const actualPrice = actualVendorQuotes.length > 0
      ? actualVendorQuotes[actualVendorQuotes.length - 1].value  // Last mentioned
      : null;

    return {
      type: "price_mismatch",
      severity: "high",
      message: `Extracted price ₹${extractedPrice} is from vendor quoting agent's words, not vendor's actual offer. Actual vendor quote: ${actualPrice ? `₹${actualPrice}` : "unclear"}`,
      details: {
        extractedPrice,
        actualVendorQuotes: actualVendorQuotes.map(p => p.value),
        quotedAgentPrices: vendorPrices.filter(p => p.isQuotingAgent).map(p => p.value),
        likelyCorrectPrice: actualPrice,
      },
    };
  }

  // Check if price is suspiciously outside range
  if (extractedPrice < baselinePrice.low * 0.3) {
    return {
      type: "price_mismatch",
      severity: "high",
      message: `Extracted price ₹${extractedPrice} is suspiciously low (< 30% of baseline ₹${baselinePrice.low}). Likely extraction error.`,
      details: {
        extractedPrice,
        baselineRange: baselinePrice,
        actualVendorQuotes: actualVendorQuotes.map(p => p.value),
      },
    };
  }

  if (extractedPrice > baselinePrice.high * 3) {
    return {
      type: "price_mismatch",
      severity: "medium",
      message: `Extracted price ₹${extractedPrice} is suspiciously high (> 3x baseline ₹${baselinePrice.high}). May need verification.`,
      details: {
        extractedPrice,
        baselineRange: baselinePrice,
      },
    };
  }

  return null;
}

/**
 * Check for illogical counter-offers
 * e.g., Agent asks for ₹1000, vendor refuses, agent then asks for ₹900 (lower!)
 */
export function checkCounterOfferLogic(messages: ChatMessage[]): SanityCheckResult | null {
  const agentPriceRequests: Array<{ price: number; index: number }> = [];
  const vendorRefusals: number[] = [];  // Indices of refusal messages

  // Track agent price requests and vendor refusals
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "agent") {
      const prices = extractAllPrices(msg.content);
      // Look for price requests (agent asking for a price)
      const isAsking = /can you|could you|is there any way|hoping|do around|work towards|budget/i.test(msg.content);
      if (isAsking && prices.length > 0) {
        agentPriceRequests.push({ price: prices[0].value, index: i });
      }
    }

    if (msg.role === "vendor") {
      const lowerContent = msg.content.toLowerCase();
      const isRefusal = /cannot|can't|no|not possible|sorry|afraid|unable/i.test(lowerContent);
      if (isRefusal) {
        vendorRefusals.push(i);
      }
    }
  }

  // Check for pattern: Agent asks X, vendor refuses, agent asks Y < X
  for (let i = 0; i < agentPriceRequests.length - 1; i++) {
    const firstRequest = agentPriceRequests[i];
    const secondRequest = agentPriceRequests[i + 1];

    // Check if there was a refusal between these requests
    const refusalBetween = vendorRefusals.some(
      r => r > firstRequest.index && r < secondRequest.index
    );

    if (refusalBetween && secondRequest.price < firstRequest.price) {
      return {
        type: "illogical_counter",
        severity: "high",
        message: `Illogical negotiation: Agent asked for ₹${firstRequest.price}, vendor refused, then agent asked for LOWER ₹${secondRequest.price}. Should ask higher or same, not lower.`,
        details: {
          firstRequest: firstRequest.price,
          secondRequest: secondRequest.price,
          difference: firstRequest.price - secondRequest.price,
        },
      };
    }
  }

  return null;
}

/**
 * Check if vendor's offer matches customer requirements
 */
export function checkRequirementsMatch(
  messages: ChatMessage[],
  requirements: Requirements
): SanityCheckResult | null {
  const issues: string[] = [];
  const vendorMessages = messages.filter(m => m.role === "vendor").map(m => m.content.toLowerCase()).join(" ");

  // Check time mismatch
  if (requirements.time) {
    const reqTime = requirements.time.toLowerCase();

    // Common time patterns
    const timeMismatchPatterns = [
      { pattern: /don'?t have.*availability|not available|no availability/i, issue: "Vendor indicated no availability" },
      { pattern: /(\d{1,2})\s*(?:am|pm)/gi, extractTime: true },
    ];

    // Check for explicit unavailability
    if (/don'?t have|not available|no availability|sorry.*available/i.test(vendorMessages)) {
      // Look for alternative time offered
      const altTimeMatch = vendorMessages.match(/(\d{1,2})\s*(am|pm)/i);
      if (altTimeMatch) {
        const offeredTime = `${altTimeMatch[1]} ${altTimeMatch[2]}`;
        if (!reqTime.includes(altTimeMatch[1])) {
          issues.push(`Customer needs ${requirements.time}, but vendor only has ${offeredTime} available`);
        }
      } else {
        issues.push(`Vendor indicated no availability for requested time (${requirements.time})`);
      }
    }
  }

  // Check vehicle type mismatch
  if (requirements.vehicleType) {
    const reqVehicle = requirements.vehicleType.toLowerCase();
    if (vendorMessages.includes("don't have") && vendorMessages.includes(reqVehicle)) {
      issues.push(`Vendor doesn't have requested vehicle type: ${requirements.vehicleType}`);
    }
  }

  if (issues.length > 0) {
    return {
      type: "requirement_mismatch",
      severity: "medium",
      message: issues.join("; "),
      details: {
        requirements,
        issues,
      },
    };
  }

  return null;
}

/**
 * Detect vendor frustration signals
 */
export function detectVendorFrustration(messages: ChatMessage[]): SanityCheckResult | null {
  const frustrationPatterns = [
    { pattern: /i already told you|already said|already mentioned/i, signal: "Vendor had to repeat themselves" },
    { pattern: /why are you not going with/i, signal: "Vendor frustrated by competitor mention" },
    { pattern: /if .* cannot .* then how can/i, signal: "Vendor pointing out logical inconsistency" },
    { pattern: /what do you want/i, signal: "Vendor confused or frustrated" },
    { pattern: /are you listening/i, signal: "Vendor feels unheard" },
    { pattern: /i just said/i, signal: "Vendor had to repeat" },
    { pattern: /(?:sigh|sighing|\*sigh\*)/i, signal: "Vendor sighing (frustration)" },
  ];

  const frustrationSignals: string[] = [];

  for (const msg of messages) {
    if (msg.role === "vendor") {
      for (const { pattern, signal } of frustrationPatterns) {
        if (pattern.test(msg.content)) {
          frustrationSignals.push(signal);
        }
      }
    }
  }

  if (frustrationSignals.length > 0) {
    return {
      type: "vendor_frustration",
      severity: frustrationSignals.length >= 2 ? "high" : "medium",
      message: `Vendor showed ${frustrationSignals.length} frustration signal(s): ${frustrationSignals.join(", ")}`,
      details: {
        signals: frustrationSignals,
        count: frustrationSignals.length,
      },
    };
  }

  return null;
}

/**
 * Run all sanity checks on a conversation
 */
export function runAllSanityChecks(
  messages: ChatMessage[],
  extractedPrice: number | null,
  baselinePrice: { low: number; mid: number; high: number },
  requirements: Requirements
): SanityCheckResult[] {
  const results: SanityCheckResult[] = [];

  const priceCheck = verifyPriceExtraction(messages, extractedPrice, baselinePrice);
  if (priceCheck) results.push(priceCheck);

  const counterCheck = checkCounterOfferLogic(messages);
  if (counterCheck) results.push(counterCheck);

  const reqCheck = checkRequirementsMatch(messages, requirements);
  if (reqCheck) results.push(reqCheck);

  const frustrationCheck = detectVendorFrustration(messages);
  if (frustrationCheck) results.push(frustrationCheck);

  // Run logical flow analysis
  const flowAnalysis = analyzeConversationFlow(messages, requirements);
  results.push(...flowAnalysis.issues);

  return results;
}

/**
 * Comprehensive logical flow analyzer
 * Traces through conversation step-by-step like a human would
 */
export function analyzeConversationFlow(
  messages: ChatMessage[],
  requirements: Requirements
): ConversationFlowAnalysis {
  const issues: SanityCheckResult[] = [];
  const turnByTurnAnalysis: ConversationFlowAnalysis["turnByTurnAnalysis"] = [];

  // Track conversation state
  const state = {
    vendorConfirmedAvailability: false,
    vendorQuotedPrice: null as number | null,
    agentAskedPrice: false,
    agentAskedAvailability: false,
    vendorAnsweredQuestion: null as string | null,
    lastVendorQuestion: null as string | null,
    informationProvided: new Set<string>(),
    questionsAsked: new Set<string>(),
    vendorOfferedAlternative: null as string | null,
    agentAcceptedAlternative: false,
  };

  // Analyze each turn
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prevMsg = i > 0 ? messages[i - 1] : null;
    const lowerContent = msg.content.toLowerCase();
    let turnIssue: string | undefined;

    if (msg.role === "vendor") {
      // --- VENDOR TURN ANALYSIS ---
      const turnSummary = analyzeVendorTurn(msg, state, lowerContent);

      // Check if vendor asked a question
      if (lowerContent.includes("?") || /which|what|how many|when|where/i.test(lowerContent)) {
        state.lastVendorQuestion = extractQuestion(msg.content);
      }

      // Check if vendor confirmed availability
      if (/yes|available|can do|we have/i.test(lowerContent) && /cab|car|vehicle|service/i.test(lowerContent)) {
        state.vendorConfirmedAvailability = true;
      }

      // Check if vendor offered alternative
      if (/(\d{1,2})\s*(am|pm)/i.test(lowerContent) && /will|would|can|how about/i.test(lowerContent)) {
        const timeMatch = lowerContent.match(/(\d{1,2})\s*(am|pm)/i);
        if (timeMatch) {
          state.vendorOfferedAlternative = `${timeMatch[1]} ${timeMatch[2]}`;
        }
      }

      // Check for price quote
      const prices = extractAllPrices(msg.content);
      const actualPrices = prices.filter(p => !isPriceQuotingAgentWords(p.context));
      if (actualPrices.length > 0) {
        state.vendorQuotedPrice = actualPrices[actualPrices.length - 1].value;
      }

      turnByTurnAnalysis.push({
        turn: i + 1,
        speaker: "vendor",
        summary: turnSummary,
        issue: turnIssue,
      });

    } else if (msg.role === "agent") {
      // --- AGENT TURN ANALYSIS ---

      // Check if agent is responding appropriately to previous vendor message
      if (prevMsg && prevMsg.role === "vendor") {
        const responseIssues = checkAgentResponse(msg, prevMsg, state, requirements);
        if (responseIssues.length > 0) {
          issues.push(...responseIssues);
          turnIssue = responseIssues.map(i => i.message).join("; ");
        }
      }

      // Track what agent asked/said
      if (/price|rate|cost|charge|how much/i.test(lowerContent)) {
        state.agentAskedPrice = true;
      }
      if (/available|availability|can you/i.test(lowerContent)) {
        state.agentAskedAvailability = true;
      }

      // Check for redundant questions
      const redundantCheck = checkRedundantQuestion(msg, state, messages.slice(0, i));
      if (redundantCheck) {
        issues.push(redundantCheck);
        turnIssue = redundantCheck.message;
      }

      // Check if agent acknowledged vendor's alternative
      if (state.vendorOfferedAlternative && !state.agentAcceptedAlternative) {
        if (new RegExp(state.vendorOfferedAlternative, "i").test(lowerContent) || /that works|okay|fine|sure/i.test(lowerContent)) {
          state.agentAcceptedAlternative = true;
        }
      }

      turnByTurnAnalysis.push({
        turn: i + 1,
        speaker: "agent",
        summary: summarizeAgentTurn(msg, state),
        issue: turnIssue,
      });
    }
  }

  // Post-conversation checks
  const postChecks = runPostConversationChecks(state, messages, requirements);
  issues.push(...postChecks);

  // Generate flow summary
  const flowSummary = generateFlowSummary(turnByTurnAnalysis, issues, state);

  return { issues, flowSummary, turnByTurnAnalysis };
}

function analyzeVendorTurn(msg: ChatMessage, state: ReturnType<typeof Object>, lowerContent: string): string {
  if (/hello|hi|yes/i.test(lowerContent) && lowerContent.length < 20) {
    return "Vendor greeted/acknowledged";
  }
  if (/available|can do|yes/i.test(lowerContent)) {
    return "Vendor confirmed availability";
  }
  if (/not available|don't have|sorry/i.test(lowerContent)) {
    return "Vendor indicated unavailability";
  }
  if (/(\d+)\s*(?:rupees?|rs|₹)/i.test(lowerContent)) {
    const prices = extractAllPrices(msg.content);
    if (prices.length > 0) {
      return `Vendor quoted ₹${prices[prices.length - 1].value}`;
    }
  }
  if (/which|what|how many/i.test(lowerContent)) {
    return "Vendor asked clarifying question";
  }
  if (/cannot|can't|no/i.test(lowerContent)) {
    return "Vendor refused/declined";
  }
  return "Vendor responded";
}

function extractQuestion(content: string): string {
  const match = content.match(/[^.!]*\?/);
  return match ? match[0].trim() : content.slice(0, 50);
}

function checkAgentResponse(
  agentMsg: ChatMessage,
  vendorMsg: ChatMessage,
  state: Record<string, unknown>,
  requirements: Requirements
): SanityCheckResult[] {
  const issues: SanityCheckResult[] = [];
  const vendorLower = vendorMsg.content.toLowerCase();
  const agentLower = agentMsg.content.toLowerCase();

  // Check 1: Vendor asked a question, did agent answer it?
  if (vendorLower.includes("?")) {
    const vendorAskedAbout = detectQuestionTopic(vendorLower);

    if (vendorAskedAbout === "vehicle_type") {
      // Vendor asked about vehicle type
      if (!/sedan|suv|hatchback|innova|swift|car|vehicle|small|big/i.test(agentLower)) {
        issues.push({
          type: "context_ignored",
          severity: "medium",
          message: `Vendor asked about vehicle type but agent didn't clearly specify`,
          details: { vendorQuestion: vendorMsg.content, agentResponse: agentMsg.content },
        });
      }
    }

    if (vendorAskedAbout === "passenger_count") {
      if (!/\d|one|two|three|four|five|passenger|person|people/i.test(agentLower)) {
        issues.push({
          type: "context_ignored",
          severity: "medium",
          message: `Vendor asked about passengers but agent didn't answer`,
          details: { vendorQuestion: vendorMsg.content, agentResponse: agentMsg.content },
        });
      }
    }
  }

  // Check 2: Vendor offered alternative time/date - CRITICAL CHECK
  const alternativeTimeMatch = vendorLower.match(/(\d{1,2})\s*(am|pm)/i);
  const vendorIndicatesAlternative = /sorry|only|instead|how about|will that work|available at|availability at/i.test(vendorLower);

  if (alternativeTimeMatch && vendorIndicatesAlternative) {
    const offeredTime = `${alternativeTimeMatch[1]} ${alternativeTimeMatch[2]}`.toLowerCase();
    const requiredTime = (requirements as { time?: string }).time?.toLowerCase() || "";

    // Check if offered time differs from required time
    const timesDiffer = requiredTime && !requiredTime.includes(alternativeTimeMatch[1]);

    if (timesDiffer) {
      // Vendor offered a DIFFERENT time than what user requested
      // Agent should either: (1) ask user, (2) decline, or (3) explicitly confirm the change is okay

      // Check if agent proceeded without acknowledging the mismatch
      const agentAcknowledgedMismatch = /unfortunately|won't work|need.*6|need.*original|check with|let me confirm|different time|can't do/i.test(agentLower);
      const agentAcceptedWithoutAsking = /great|thank you|okay|fine|works|that's fine|sure/i.test(agentLower) && !agentAcknowledgedMismatch;

      if (agentAcceptedWithoutAsking) {
        issues.push({
          type: "flow_issue",
          severity: "high",
          message: `Agent accepted alternative time (${offeredTime}) without consulting user - user requested ${requiredTime}`,
          details: {
            requiredTime: requiredTime,
            offeredTime: offeredTime,
            vendorMessage: vendorMsg.content,
            agentResponse: agentMsg.content,
            issue: "Agent should have asked user or declined when vendor couldn't meet the requested time"
          },
        });
      } else if (!agentAcknowledgedMismatch && !/that|okay|fine|works/i.test(agentLower)) {
        issues.push({
          type: "context_ignored",
          severity: "medium",
          message: `Vendor offered alternative time (${offeredTime}) but agent didn't address the time mismatch`,
          details: { vendorOffer: vendorMsg.content, requiredTime: requiredTime },
        });
      }
    }
  }

  // Also check for date alternatives
  const vendorOffersAlternativeDate = /tomorrow|next day|day after|different date|another day/i.test(vendorLower) && /sorry|only|instead|available/i.test(vendorLower);
  if (vendorOffersAlternativeDate) {
    const agentAcceptedWithoutQuestion = /great|thank you|okay|fine|works|sure/i.test(agentLower);
    const agentQuestioned = /check|confirm|user|customer|let me|won't work|unfortunately/i.test(agentLower);

    if (agentAcceptedWithoutQuestion && !agentQuestioned) {
      issues.push({
        type: "flow_issue",
        severity: "high",
        message: `Agent may have accepted alternative date without consulting user`,
        details: { vendorMessage: vendorMsg.content, agentResponse: agentMsg.content },
      });
    }
  }

  // Check 3: Vendor refused, agent should not repeat same request immediately
  if (/cannot|can't|not possible|afraid|no/i.test(vendorLower)) {
    // Check if agent is repeating the same refused request
    const vendorRefusedPrice = extractAllPrices(vendorMsg.content);
    const agentAsksPrice = extractAllPrices(agentMsg.content);

    // Already handled by checkCounterOfferLogic, but we can add context here
  }

  // Check 4: Vendor pointed out logical issue, agent should acknowledge
  if (/if .* cannot .* then how/i.test(vendorLower) || /why are you not going/i.test(vendorLower)) {
    if (!/understand|sorry|right|fair point|i see/i.test(agentLower)) {
      issues.push({
        type: "flow_issue",
        severity: "medium",
        message: `Vendor pointed out a logical issue but agent didn't acknowledge it gracefully`,
        details: { vendorPoint: vendorMsg.content, agentResponse: agentMsg.content },
      });
    }
  }

  return issues;
}

function detectQuestionTopic(text: string): string | null {
  if (/which.*cab|small.*big|sedan|suv|what.*vehicle|what.*car/i.test(text)) {
    return "vehicle_type";
  }
  if (/how many.*passenger|how many.*people|how many.*person/i.test(text)) {
    return "passenger_count";
  }
  if (/when|what time|which date/i.test(text)) {
    return "timing";
  }
  if (/where|location|address|pickup/i.test(text)) {
    return "location";
  }
  return null;
}

function checkRedundantQuestion(
  agentMsg: ChatMessage,
  state: Record<string, unknown>,
  previousMessages: ChatMessage[]
): SanityCheckResult | null {
  const agentLower = agentMsg.content.toLowerCase();

  // Check if agent asked about price when vendor already quoted
  if (/price|rate|cost|how much/i.test(agentLower) && state.vendorQuotedPrice) {
    // Check if this is asking for a DIFFERENT price (counter) vs redundant ask
    if (!/better|lower|less|reduce|discount|flexibility/i.test(agentLower)) {
      // Agent might be asking for price again redundantly
      const recentVendorQuote = previousMessages
        .filter(m => m.role === "vendor")
        .slice(-3)
        .some(m => extractAllPrices(m.content).length > 0);

      if (recentVendorQuote) {
        return {
          type: "redundant_question",
          severity: "low",
          message: `Agent asked for price after vendor already quoted ₹${state.vendorQuotedPrice}`,
          details: { quotedPrice: state.vendorQuotedPrice },
        };
      }
    }
  }

  // Check if agent asked about availability after vendor confirmed
  if (/available|do you have/i.test(agentLower) && state.vendorConfirmedAvailability) {
    return {
      type: "redundant_question",
      severity: "low",
      message: `Agent asked about availability after vendor already confirmed`,
      details: {},
    };
  }

  return null;
}

function summarizeAgentTurn(msg: ChatMessage, state: Record<string, unknown>): string {
  const lowerContent = msg.content.toLowerCase();

  if (/hello|hi|good/i.test(lowerContent) && lowerContent.length < 100) {
    return "Agent greeted vendor";
  }
  if (/price|rate|cost|how much/i.test(lowerContent) && !/lower|reduce|less/i.test(lowerContent)) {
    return "Agent asked for price";
  }
  if (/lower|reduce|less|₹\d+|budget/i.test(lowerContent)) {
    const prices = extractAllPrices(msg.content);
    if (prices.length > 0) {
      return `Agent counter-offered ₹${prices[0].value}`;
    }
    return "Agent negotiated for lower price";
  }
  if (/thank|call back|confirm|think about/i.test(lowerContent)) {
    return "Agent closing/ending call";
  }
  if (/sedan|suv|vehicle|car/i.test(lowerContent)) {
    return "Agent specified vehicle preference";
  }
  return "Agent responded";
}

function runPostConversationChecks(
  state: Record<string, unknown>,
  messages: ChatMessage[],
  requirements: Requirements
): SanityCheckResult[] {
  const issues: SanityCheckResult[] = [];

  // Check: Did agent accept an alternative that doesn't match requirements?
  if (state.vendorOfferedAlternative && state.agentAcceptedAlternative && requirements.time) {
    const reqTime = requirements.time.toLowerCase();
    const altTime = (state.vendorOfferedAlternative as string).toLowerCase();

    // Simple check: if requirement says "6 am" and alternative is "9 am"
    if (!reqTime.includes(altTime.split(" ")[0])) {
      issues.push({
        type: "requirement_mismatch",
        severity: "medium",
        message: `Agent accepted vendor's alternative time (${state.vendorOfferedAlternative}) without flagging it differs from customer's requirement (${requirements.time})`,
        details: {
          required: requirements.time,
          accepted: state.vendorOfferedAlternative,
        },
      });
    }
  }

  // Check: Conversation ended without getting a clear price
  const lastAgentMsg = [...messages].reverse().find(m => m.role === "agent");
  if (lastAgentMsg && /call back|think about|confirm/i.test(lastAgentMsg.content.toLowerCase())) {
    if (!state.vendorQuotedPrice) {
      issues.push({
        type: "flow_issue",
        severity: "medium",
        message: `Conversation ended without obtaining a clear price quote from vendor`,
        details: {},
      });
    }
  }

  return issues;
}

function generateFlowSummary(
  turns: ConversationFlowAnalysis["turnByTurnAnalysis"],
  issues: SanityCheckResult[],
  state: Record<string, unknown>
): string {
  const totalTurns = turns.length;
  const turnsWithIssues = turns.filter(t => t.issue).length;
  const highSeverityIssues = issues.filter(i => i.severity === "high").length;

  let summary = `Conversation: ${totalTurns} turns`;

  if (turnsWithIssues > 0) {
    summary += `, ${turnsWithIssues} with issues`;
  }

  if (highSeverityIssues > 0) {
    summary += ` (${highSeverityIssues} critical)`;
  }

  if (state.vendorQuotedPrice) {
    summary += `. Final quote: ₹${state.vendorQuotedPrice}`;
  }

  return summary;
}