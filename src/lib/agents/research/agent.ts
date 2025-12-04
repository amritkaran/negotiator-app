import {
  NegotiatorGraphState,
  createAgentEvent
} from "../types";
import { priceIntelAgent } from "./price-intel";
import { reviewAnalyzerAgent } from "./review-analyzer";
import { vendorRankerAgent } from "./vendor-ranker";

// Main Research Agent - orchestrates all sub-agents
export async function researchAgent(
  state: NegotiatorGraphState
): Promise<Partial<NegotiatorGraphState>> {
  const events = [
    createAgentEvent(
      "agent_started",
      "research",
      "Starting comprehensive research phase...",
      {
        service: state.requirements?.service,
        from: state.requirements?.from,
        to: state.requirements?.to,
        vendorCount: state.businesses.length,
      }
    ),
  ];

  // Validate prerequisites
  if (!state.requirements) {
    events.push(
      createAgentEvent(
        "agent_error",
        "research",
        "Cannot start research - requirements not gathered"
      )
    );
    return {
      agentEvents: events,
      currentAgent: "research",
      errors: [
        {
          agent: "research",
          error: "Requirements not gathered",
          timestamp: new Date(),
          recoverable: false,
        },
      ],
    };
  }

  if (state.businesses.length === 0) {
    events.push(
      createAgentEvent(
        "agent_error",
        "research",
        "Cannot start research - no vendors found"
      )
    );
    return {
      agentEvents: events,
      currentAgent: "research",
      errors: [
        {
          agent: "research",
          error: "No vendors found",
          timestamp: new Date(),
          recoverable: false,
        },
      ],
    };
  }

  let currentState = { ...state, agentEvents: events };

  // Step 1: Price Intelligence
  events.push(
    createAgentEvent(
      "handoff",
      "research",
      "Handing off to Price Intelligence sub-agent",
      { subAgent: "research.price_intel" }
    )
  );

  const priceIntelResult = await priceIntelAgent(currentState);
  currentState = {
    ...currentState,
    ...priceIntelResult,
    agentEvents: [...currentState.agentEvents, ...(priceIntelResult.agentEvents || [])],
  };

  // Step 2: Review Analysis (parallel with price intel if needed, but sequential for now)
  events.push(
    createAgentEvent(
      "handoff",
      "research",
      "Handing off to Review Analyzer sub-agent",
      { subAgent: "research.review_analyzer" }
    )
  );

  const reviewAnalysisResult = await reviewAnalyzerAgent(currentState);
  currentState = {
    ...currentState,
    ...reviewAnalysisResult,
    agentEvents: [...currentState.agentEvents, ...(reviewAnalysisResult.agentEvents || [])],
    research: {
      ...currentState.research,
      ...reviewAnalysisResult.research,
    } as NegotiatorGraphState["research"],
  };

  // Step 3: Vendor Ranking (depends on price intel and review analysis)
  events.push(
    createAgentEvent(
      "handoff",
      "research",
      "Handing off to Vendor Ranker sub-agent",
      { subAgent: "research.vendor_ranker" }
    )
  );

  const vendorRankingResult = await vendorRankerAgent(currentState);
  currentState = {
    ...currentState,
    ...vendorRankingResult,
    agentEvents: [...currentState.agentEvents, ...(vendorRankingResult.agentEvents || [])],
    research: {
      ...currentState.research,
      ...vendorRankingResult.research,
    } as NegotiatorGraphState["research"],
  };

  // Complete research phase
  const researchSummary = {
    priceIntel: currentState.research?.priceIntel
      ? `Baseline: ₹${currentState.research.priceIntel.baselinePrice.low} - ₹${currentState.research.priceIntel.baselinePrice.high}`
      : "Not available",
    reviewsAnalyzed: currentState.research?.reviewAnalysis?.length || 0,
    topVendor: currentState.research?.vendorRanking?.rankedVendors[0]?.business.name || "None",
    topScore: currentState.research?.vendorRanking?.rankedVendors[0]?.score || 0,
  };

  const completionEvent = createAgentEvent(
    "agent_completed",
    "research",
    `Research complete. ${researchSummary.priceIntel}. Top vendor: ${researchSummary.topVendor} (Score: ${researchSummary.topScore})`,
    researchSummary
  );

  return {
    agentEvents: [...currentState.agentEvents, completionEvent],
    currentAgent: "research",
    previousAgents: [...state.previousAgents, "research"],
    research: currentState.research,
  };
}

// Export sub-agents for individual use if needed
export { priceIntelAgent } from "./price-intel";
export { reviewAnalyzerAgent } from "./review-analyzer";
export { vendorRankerAgent } from "./vendor-ranker";
