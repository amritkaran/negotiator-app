import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import {
  NegotiatorGraphState,
  createInitialState,
  createAgentEvent,
  AgentEvent,
  AgentType,
  SupportedLanguage,
  HumanInterruptState,
  HITLCacheEntry,
  ResearchResult,
  VerificationResult,
  CallAnalysisResult,
  SafetyCheckResult,
  PromptEnhancement,
  NegotiationCallState,
  CallDecisionState,
} from "./types";
import { Business, UserRequirement } from "@/types";

// Import all agents
import { researchAgent } from "./research/agent";
import { negotiatorAgent } from "./negotiator/agent";
import { learningAgent } from "./learning/agent";
import { verificationAgent } from "./verification/agent";
import {
  checkCacheForQuestion,
  createCacheHitEvent,
  incrementCacheUsage,
} from "./negotiator/human-interrupt";

// Define the state annotation for LangGraph
const GraphStateAnnotation = Annotation.Root({
  sessionId: Annotation<string>({
    reducer: (_, b) => b,
    default: () => "",
  }),
  startedAt: Annotation<Date>({
    reducer: (_, b) => b,
    default: () => new Date(),
  }),
  currentAgent: Annotation<AgentType>({
    reducer: (_, b) => b,
    default: () => "intake",
  }),
  previousAgents: Annotation<AgentType[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  agentEvents: Annotation<AgentEvent[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  requirements: Annotation<UserRequirement | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  conversationHistory: Annotation<Array<{ role: "user" | "assistant"; content: string; timestamp: Date }>>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  businesses: Annotation<Business[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  research: Annotation<ResearchResult | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  negotiation: Annotation<{
    currentVendorIndex: number;
    lowestPriceSoFar: number | null;
    bestVendorSoFar: string | null;
    calls: NegotiationCallState[];
    totalCallsMade: number;
  }>({
    reducer: (_, b) => b,
    default: () => ({
      currentVendorIndex: 0,
      lowestPriceSoFar: null,
      bestVendorSoFar: null,
      calls: [],
      totalCallsMade: 0,
    }),
  }),
  humanInterrupt: Annotation<HumanInterruptState>({
    reducer: (_, b) => b,
    default: () => ({
      active: false,
      interruptId: null,
      reason: null,
      vendorQuestion: null,
      context: null,
      requestedAt: null,
      response: null,
      respondedAt: null,
    }),
  }),
  hitlResponseCache: Annotation<HITLCacheEntry[]>({
    reducer: (current, update) => {
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
    },
    default: () => [],
  }),
  callDecision: Annotation<CallDecisionState>({
    reducer: (_, b) => b,
    default: () => ({
      awaitingDecision: false,
      lastCallSummary: null,
      vendorsRemaining: 0,
      currentBestPrice: null,
      currentBestVendor: null,
      userDecision: null,
    }),
  }),
  currentLanguage: Annotation<SupportedLanguage>({
    reducer: (_, b) => b,
    default: () => "kn",
  }),
  defaultLanguage: Annotation<SupportedLanguage>({
    reducer: (_, b) => b,
    default: () => "kn",
  }),
  learning: Annotation<{
    sessionLearnings: string[];
    callAnalyses: CallAnalysisResult[];
    safetyChecks: SafetyCheckResult[];
    currentPromptEnhancement: PromptEnhancement | null;
  }>({
    reducer: (_, b) => b,
    default: () => ({
      sessionLearnings: [],
      callAnalyses: [],
      safetyChecks: [],
      currentPromptEnhancement: null,
    }),
  }),
  verification: Annotation<VerificationResult | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  bestDeal: Annotation<{
    vendor: Business;
    price: number;
    details: string;
    verificationStatus: "pending" | "verified" | "discrepancy" | "skipped";
  } | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  errors: Annotation<Array<{ agent: AgentType; error: string; timestamp: Date; recoverable: boolean }>>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  shouldContinue: Annotation<boolean>({
    reducer: (_, b) => b,
    default: () => true,
  }),
  skipVerification: Annotation<boolean>({
    reducer: (_, b) => b,
    default: () => false,
  }),
});

// Type for graph state from the annotation
type GraphState = typeof GraphStateAnnotation.State;

// Intake agent (simplified - actual requirements gathering happens via chat API)
async function intakeAgent(
  state: GraphState
): Promise<Partial<GraphState>> {
  const events: AgentEvent[] = [
    createAgentEvent(
      "agent_started",
      "intake",
      "Intake agent started - gathering requirements..."
    ),
  ];

  // Check if requirements are complete
  if (state.requirements?.isComplete) {
    events.push(
      createAgentEvent(
        "agent_completed",
        "intake",
        `Requirements complete: ${state.requirements.service} from ${state.requirements.from} to ${state.requirements.to}`,
        { requirements: state.requirements }
      )
    );
    return {
      agentEvents: events,
      currentAgent: "intake",
      previousAgents: [...state.previousAgents, "intake"],
    };
  }

  events.push(
    createAgentEvent(
      "agent_started",
      "intake",
      "Waiting for user to complete requirements..."
    )
  );

  return {
    agentEvents: events,
    currentAgent: "intake",
    shouldContinue: false, // Pause until requirements are complete
  };
}

// Business search node (uses existing google-maps.ts)
async function businessSearchAgent(
  state: GraphState
): Promise<Partial<GraphState>> {
  const events: AgentEvent[] = [
    createAgentEvent(
      "agent_started",
      "intake",
      "Searching for nearby service providers...",
      { location: state.requirements?.from, service: state.requirements?.service }
    ),
  ];

  // Import business search function
  const { searchNearbyBusinesses, geocodeAddress } = await import("../google-maps");

  if (!state.requirements?.from) {
    events.push(
      createAgentEvent(
        "agent_error",
        "intake",
        "Cannot search - no location specified"
      )
    );
    return {
      agentEvents: events,
      errors: [
        {
          agent: "intake",
          error: "No location specified",
          timestamp: new Date(),
          recoverable: false,
        },
      ],
    };
  }

  try {
    // Geocode the location
    const location = await geocodeAddress(state.requirements.from);
    if (!location) {
      throw new Error(`Could not geocode: ${state.requirements.from}`);
    }

    // Search for businesses
    const businesses = await searchNearbyBusinesses(
      state.requirements.service || "cab",
      location,
      5 // 5km radius
    );

    events.push(
      createAgentEvent(
        "agent_completed",
        "intake",
        `Found ${businesses.length} service providers near ${state.requirements.from}`,
        { businessCount: businesses.length }
      )
    );

    return {
      agentEvents: events,
      businesses,
    };
  } catch (error) {
    events.push(
      createAgentEvent(
        "agent_error",
        "intake",
        `Business search failed: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    return {
      agentEvents: events,
      errors: [
        {
          agent: "intake",
          error: error instanceof Error ? error.message : "Business search failed",
          timestamp: new Date(),
          recoverable: true,
        },
      ],
    };
  }
}

// Wrapper functions to adapt agents to GraphState type
async function researchAgentWrapper(state: GraphState): Promise<Partial<GraphState>> {
  return researchAgent(state as NegotiatorGraphState) as Promise<Partial<GraphState>>;
}

async function negotiatorAgentWrapper(state: GraphState): Promise<Partial<GraphState>> {
  return negotiatorAgent(state as NegotiatorGraphState) as Promise<Partial<GraphState>>;
}

async function learningAgentWrapper(state: GraphState): Promise<Partial<GraphState>> {
  return learningAgent(state as NegotiatorGraphState) as Promise<Partial<GraphState>>;
}

async function verificationAgentWrapper(state: GraphState): Promise<Partial<GraphState>> {
  return verificationAgent(state as NegotiatorGraphState) as Promise<Partial<GraphState>>;
}

// Routing functions
function shouldContinueAfterIntake(state: GraphState): string {
  if (!state.requirements?.isComplete) {
    return "wait_for_input";
  }
  if (state.businesses.length === 0) {
    return "search_businesses";
  }
  return "research";
}

function shouldContinueAfterSearch(state: GraphState): string {
  if (state.businesses.length === 0) {
    return "__end__";
  }
  return "research";
}

function shouldContinueAfterResearch(state: GraphState): string {
  if (state.errors.some((e) => !e.recoverable)) {
    return "__end__";
  }
  return "negotiator";
}

function shouldContinueAfterNegotiator(state: GraphState): string {
  // Check for call decision pause (one call at a time flow)
  if (state.callDecision?.awaitingDecision) {
    return "wait_for_call_decision";
  }
  // Check for human interrupt
  if (state.humanInterrupt.active && !state.humanInterrupt.response) {
    return "wait_for_human";
  }
  return "learning";
}

function shouldContinueAfterLearning(state: GraphState): string {
  if (!state.bestDeal) {
    return "__end__";
  }
  if (state.skipVerification) {
    return "__end__";
  }
  return "verification";
}

function shouldContinueAfterVerification(_state: GraphState): string {
  return "__end__";
}

// Wait nodes (for human input or external triggers)
async function waitForInputNode(
  state: GraphState
): Promise<Partial<GraphState>> {
  return {
    agentEvents: [
      createAgentEvent(
        "state_update",
        "intake",
        "Waiting for user input to continue..."
      ),
    ],
    shouldContinue: false,
  };
}

async function waitForHumanNode(
  state: GraphState
): Promise<Partial<GraphState>> {
  const question = state.humanInterrupt.vendorQuestion || "";

  // Check if we have a cached response for this type of question
  const cacheResult = checkCacheForQuestion(state as NegotiatorGraphState, question);

  if (cacheResult.found && cacheResult.response) {
    // Use cached response instead of asking user again
    return {
      agentEvents: [
        createCacheHitEvent(
          question,
          cacheResult.response,
          cacheResult.cacheEntry?.originalQuestion || question
        ),
      ],
      humanInterrupt: {
        ...state.humanInterrupt,
        response: cacheResult.response,
        respondedAt: new Date(),
      },
      // Update cache with incremented usage count
      hitlResponseCache: cacheResult.cacheEntry ? [cacheResult.cacheEntry] : [],
      shouldContinue: true, // Continue execution with cached response
    };
  }

  // No cached response - pause and ask user
  return {
    agentEvents: [
      createAgentEvent(
        "human_interrupt_requested",
        "negotiator.human_interrupt",
        `Waiting for human response to: ${state.humanInterrupt.vendorQuestion}`,
        {
          interruptId: state.humanInterrupt.interruptId,
          question: state.humanInterrupt.vendorQuestion,
        }
      ),
    ],
    shouldContinue: false,
  };
}

// Wait for user's call decision (one call at a time flow)
async function waitForCallDecisionNode(
  state: GraphState
): Promise<Partial<GraphState>> {
  const summary = state.callDecision?.lastCallSummary;
  const vendorsRemaining = state.callDecision?.vendorsRemaining || 0;
  const currentBestPrice = state.callDecision?.currentBestPrice;
  const currentBestVendor = state.callDecision?.currentBestVendor;

  return {
    agentEvents: [
      createAgentEvent(
        "awaiting_call_decision",
        "negotiator",
        `Call completed with ${summary?.vendorName || "vendor"}. ${vendorsRemaining} more vendor${vendorsRemaining !== 1 ? "s" : ""} available. Waiting for your decision...`,
        {
          callSummary: summary,
          vendorsRemaining,
          currentBestPrice,
          currentBestVendor,
        }
      ),
    ],
    shouldContinue: false,
  };
}

// Create the graph
export function createNegotiatorGraph() {
  // Define the graph with state annotation
  // Use 'as any' to work around strict TypeScript checking on node names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = new StateGraph(GraphStateAnnotation) as any;

  // Add nodes - using unique names to avoid conflicts with state attributes
  graph.addNode("intake_node", intakeAgent);
  graph.addNode("search_businesses_node", businessSearchAgent);
  graph.addNode("research_node", researchAgentWrapper);
  graph.addNode("negotiator_node", negotiatorAgentWrapper);
  graph.addNode("learning_node", learningAgentWrapper);
  graph.addNode("verification_node", verificationAgentWrapper);
  graph.addNode("wait_for_input_node", waitForInputNode);
  graph.addNode("wait_for_human_node", waitForHumanNode);
  graph.addNode("wait_for_call_decision_node", waitForCallDecisionNode);

  // Add edges
  graph.addEdge(START, "intake_node");

  graph.addConditionalEdges("intake_node", shouldContinueAfterIntake, {
    wait_for_input: "wait_for_input_node",
    search_businesses: "search_businesses_node",
    research: "research_node",
  });

  graph.addConditionalEdges("search_businesses_node", shouldContinueAfterSearch, {
    research: "research_node",
    __end__: END,
  });

  graph.addConditionalEdges("research_node", shouldContinueAfterResearch, {
    negotiator: "negotiator_node",
    __end__: END,
  });

  graph.addConditionalEdges("negotiator_node", shouldContinueAfterNegotiator, {
    wait_for_call_decision: "wait_for_call_decision_node",
    wait_for_human: "wait_for_human_node",
    learning: "learning_node",
  });

  graph.addConditionalEdges("learning_node", shouldContinueAfterLearning, {
    verification: "verification_node",
    __end__: END,
  });

  graph.addConditionalEdges("verification_node", shouldContinueAfterVerification, {
    __end__: END,
  });

  // Wait nodes go back to their triggering nodes when resumed
  graph.addEdge("wait_for_input_node", "intake_node");
  graph.addEdge("wait_for_human_node", "negotiator_node");
  // Call decision wait node: when user says "continue", go back to negotiator; handled by API resume logic
  graph.addEdge("wait_for_call_decision_node", "negotiator_node");

  return graph.compile();
}

// Helper to run the graph with streaming events
export async function* runNegotiatorGraph(
  initialState: Partial<NegotiatorGraphState>,
  config?: RunnableConfig
): AsyncGenerator<{
  node: string;
  state: Partial<NegotiatorGraphState>;
  events: AgentEvent[];
}> {
  const graph = createNegotiatorGraph();

  const fullInitialState = {
    ...createInitialState(initialState.sessionId || `session-${Date.now()}`),
    ...initialState,
  };

  // Stream the graph execution
  const stream = await graph.stream(fullInitialState, {
    ...config,
    streamMode: "updates",
  });

  for await (const update of stream) {
    for (const [node, state] of Object.entries(update)) {
      const partialState = state as Partial<NegotiatorGraphState>;
      yield {
        node,
        state: partialState,
        events: (partialState.agentEvents || []) as AgentEvent[],
      };
    }
  }
}

// Export the graph instance
export const negotiatorGraph = createNegotiatorGraph();

// Export types
export type { NegotiatorGraphState } from "./types";
