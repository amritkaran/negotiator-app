import {
  NegotiatorGraphState,
  createAgentEvent
} from "../types";
import { callAnalyzerAgent } from "./call-analyzer";
import { safetyCheckerAgent } from "./safety-checker";
import { promptEnhancerAgent } from "./prompt-enhancer";

// Main Learning Agent - orchestrates all learning sub-agents
export async function learningAgent(
  state: NegotiatorGraphState
): Promise<Partial<NegotiatorGraphState>> {
  const events = [
    createAgentEvent(
      "agent_started",
      "learning",
      "Starting learning phase - analyzing calls and generating improvements...",
      {
        callsToAnalyze: state.negotiation.calls.length,
        hasExistingLearnings: state.learning.sessionLearnings.length > 0,
      }
    ),
  ];

  // Check if there are calls to analyze
  if (state.negotiation.calls.length === 0) {
    events.push(
      createAgentEvent(
        "agent_completed",
        "learning",
        "No calls to analyze - skipping learning phase"
      )
    );
    return {
      agentEvents: events,
      currentAgent: "learning",
      previousAgents: [...state.previousAgents, "learning"],
    };
  }

  let currentState = { ...state, agentEvents: events };

  // Step 1: Call Analysis
  events.push(
    createAgentEvent(
      "handoff",
      "learning",
      "Handing off to Call Analyzer sub-agent",
      { subAgent: "learning.call_analyzer" }
    )
  );

  const callAnalysisResult = await callAnalyzerAgent(currentState);
  currentState = {
    ...currentState,
    ...callAnalysisResult,
    agentEvents: [...currentState.agentEvents, ...(callAnalysisResult.agentEvents || [])],
    learning: {
      ...currentState.learning,
      ...callAnalysisResult.learning,
    },
  };

  // Step 2: Safety Check
  events.push(
    createAgentEvent(
      "handoff",
      "learning",
      "Handing off to Safety Checker sub-agent",
      { subAgent: "learning.safety_checker" }
    )
  );

  const safetyCheckResult = await safetyCheckerAgent(currentState);
  currentState = {
    ...currentState,
    ...safetyCheckResult,
    agentEvents: [...currentState.agentEvents, ...(safetyCheckResult.agentEvents || [])],
    learning: {
      ...currentState.learning,
      ...safetyCheckResult.learning,
    },
  };

  // Step 3: Prompt Enhancement
  events.push(
    createAgentEvent(
      "handoff",
      "learning",
      "Handing off to Prompt Enhancer sub-agent",
      { subAgent: "learning.prompt_enhancer" }
    )
  );

  const promptEnhancementResult = await promptEnhancerAgent(currentState);
  currentState = {
    ...currentState,
    ...promptEnhancementResult,
    agentEvents: [...currentState.agentEvents, ...(promptEnhancementResult.agentEvents || [])],
    learning: {
      ...currentState.learning,
      ...promptEnhancementResult.learning,
    },
  };

  // Generate summary
  const summary = {
    callsAnalyzed: currentState.learning.callAnalyses.length,
    avgEffectiveness: currentState.learning.callAnalyses.length > 0
      ? Math.round(
          currentState.learning.callAnalyses.reduce((s, a) => s + a.effectiveness, 0) /
          currentState.learning.callAnalyses.length
        )
      : 0,
    avgSafetyScore: currentState.learning.safetyChecks.length > 0
      ? Math.round(
          currentState.learning.safetyChecks.reduce((s, c) => s + c.safetyScore, 0) /
          currentState.learning.safetyChecks.length
        )
      : 100,
    promptVersion: currentState.learning.currentPromptEnhancement?.version || 0,
    totalLearnings: currentState.learning.sessionLearnings.length,
  };

  const completionEvent = createAgentEvent(
    "agent_completed",
    "learning",
    `Learning complete. Effectiveness: ${summary.avgEffectiveness}%, Safety: ${summary.avgSafetyScore}%, Prompt v${summary.promptVersion}`,
    summary
  );

  return {
    agentEvents: [...currentState.agentEvents, completionEvent],
    currentAgent: "learning",
    previousAgents: [...state.previousAgents, "learning"],
    learning: currentState.learning,
  };
}

// Export sub-agents
export { callAnalyzerAgent } from "./call-analyzer";
export { safetyCheckerAgent } from "./safety-checker";
export { promptEnhancerAgent } from "./prompt-enhancer";
