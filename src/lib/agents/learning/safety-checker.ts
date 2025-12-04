import { ChatOpenAI } from "@langchain/openai";
import {
  NegotiatorGraphState,
  SafetyCheckResult,
  NegotiationCallState,
  createAgentEvent
} from "../types";

// Safety and toxicity patterns to check
const TOXICITY_PATTERNS = {
  agent: [
    /threat/i,
    /insult/i,
    /rude/i,
    /aggressive/i,
    /shout/i,
    /demand/i,
    /force/i,
    /must.*accept/i,
    /no.*choice/i,
  ],
  vendor: [
    /abuse/i,
    /swear/i,
    /threat/i,
    /harassment/i,
    /discriminat/i,
  ],
};

// Cultural sensitivity patterns
const CULTURAL_SENSITIVITY_PATTERNS = [
  /caste/i,
  /religion/i,
  /personal.*question/i,
  /inappropriate/i,
];

// Check a single call for safety issues
async function checkCallSafety(
  call: NegotiationCallState
): Promise<SafetyCheckResult> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.2,
  });

  const prompt = `Analyze this negotiation call transcript for safety and toxicity issues.

Business: ${call.businessName}
Language: ${call.language}

Transcript:
${call.transcript || "No transcript available"}

Check for:
1. Toxicity or inappropriate language (from either party)
2. Aggressive or threatening behavior
3. Cultural insensitivity
4. Harassment or discrimination
5. Unprofessional conduct
6. Safety concerns

For the AI agent specifically, check:
- Was the agent too pushy or aggressive?
- Did the agent respect boundaries?
- Was the agent culturally appropriate?
- Did the agent handle rejection gracefully?

For the vendor, check:
- Any abusive language?
- Threats or intimidation?
- Inappropriate behavior?

Respond in JSON:
{
  "safetyScore": number (0-100, higher is safer),
  "toxicityDetected": boolean,
  "agentIssues": ["issue1", "issue2"],
  "vendorIssues": ["issue1", "issue2"],
  "culturalIssues": ["issue1", "issue2"],
  "overallIssues": ["combined issues"],
  "recommendations": ["how to improve"]
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
        callId: call.callId,
        safetyScore: result.safetyScore || 100,
        toxicityDetected: result.toxicityDetected || false,
        issues: [
          ...(result.overallIssues || []),
          ...(result.culturalIssues || []),
        ],
        agentIssues: result.agentIssues || [],
        vendorIssues: result.vendorIssues || [],
        recommendations: result.recommendations || [],
      };
    }
  } catch (error) {
    console.error("Safety check error:", error);
  }

  // Quick pattern-based check as fallback
  const transcript = call.transcript || "";
  let safetyScore = 100;
  const agentIssues: string[] = [];
  const vendorIssues: string[] = [];

  // Check agent patterns
  for (const pattern of TOXICITY_PATTERNS.agent) {
    if (pattern.test(transcript)) {
      safetyScore -= 10;
      agentIssues.push(`Potential issue detected: ${pattern.source}`);
    }
  }

  // Check vendor patterns
  for (const pattern of TOXICITY_PATTERNS.vendor) {
    if (pattern.test(transcript)) {
      safetyScore -= 5;
      vendorIssues.push(`Vendor issue detected: ${pattern.source}`);
    }
  }

  // Check cultural patterns
  for (const pattern of CULTURAL_SENSITIVITY_PATTERNS) {
    if (pattern.test(transcript)) {
      safetyScore -= 5;
      agentIssues.push(`Cultural sensitivity issue: ${pattern.source}`);
    }
  }

  return {
    callId: call.callId,
    safetyScore: Math.max(0, safetyScore),
    toxicityDetected: safetyScore < 70,
    issues: [],
    agentIssues,
    vendorIssues,
    recommendations: safetyScore < 90
      ? ["Review call transcript for improvement opportunities"]
      : [],
  };
}

// Main Safety Checker function
export async function safetyCheckerAgent(
  state: NegotiatorGraphState
): Promise<Partial<NegotiatorGraphState>> {
  const events = [
    createAgentEvent(
      "sub_agent_started",
      "learning.safety_checker",
      `Checking ${state.negotiation.calls.length} calls for safety and toxicity...`
    ),
  ];

  const safetyChecks: SafetyCheckResult[] = [];
  let overallSafe = true;
  let criticalIssues: string[] = [];

  // Check each call
  for (const call of state.negotiation.calls) {
    if (!call.transcript) {
      continue;
    }

    events.push(
      createAgentEvent(
        "sub_agent_started",
        "learning.safety_checker",
        `Safety checking call to ${call.businessName}...`
      )
    );

    const check = await checkCallSafety(call);
    safetyChecks.push(check);

    if (check.toxicityDetected) {
      overallSafe = false;
      criticalIssues.push(`Toxicity in call to ${call.businessName}`);
    }

    const statusEmoji = check.safetyScore >= 90 ? "✅" : check.safetyScore >= 70 ? "⚠️" : "❌";

    events.push(
      createAgentEvent(
        "learning_insight",
        "learning.safety_checker",
        `${statusEmoji} ${call.businessName}: Safety score ${check.safetyScore}%. ${check.recommendations[0] || "No issues."}`,
        {
          callId: call.callId,
          safetyScore: check.safetyScore,
          toxicityDetected: check.toxicityDetected,
          agentIssues: check.agentIssues.length,
          vendorIssues: check.vendorIssues.length,
        }
      )
    );
  }

  // Calculate average safety score
  const avgSafetyScore = safetyChecks.length > 0
    ? Math.round(safetyChecks.reduce((sum, c) => sum + c.safetyScore, 0) / safetyChecks.length)
    : 100;

  // Aggregate recommendations
  const allRecommendations = [...new Set(safetyChecks.flatMap((c) => c.recommendations))];

  events.push(
    createAgentEvent(
      "sub_agent_completed",
      "learning.safety_checker",
      `Safety check complete. Average score: ${avgSafetyScore}%. ${overallSafe ? "No critical issues." : `Critical: ${criticalIssues.join(", ")}`}`,
      {
        callsChecked: safetyChecks.length,
        avgSafetyScore,
        overallSafe,
        criticalIssues,
        recommendations: allRecommendations.slice(0, 3),
      }
    )
  );

  return {
    agentEvents: events,
    learning: {
      ...state.learning,
      safetyChecks,
      sessionLearnings: [
        ...state.learning.sessionLearnings,
        ...allRecommendations.slice(0, 2),
      ],
    },
  };
}
