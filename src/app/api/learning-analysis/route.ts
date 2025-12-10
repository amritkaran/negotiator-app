import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  runAllSanityChecks,
  analyzeConversationFlow,
  SanityCheckResult,
  ConversationFlowAnalysis,
  ChatMessage as SanityMessage,
} from "@/lib/sanity-checks";

interface ChatMessage {
  role: "agent" | "vendor" | "human";
  content: string;
  thinking?: string;
}

interface SimulationResult {
  vendorId: string;
  vendorName: string;
  quotedPrice: number | null;
  success: boolean;
  notes: string;
  messages?: ChatMessage[];
}

interface LearningRequest {
  sessionId: string;
  results: SimulationResult[];
  priceIntel: {
    baselinePrice: { low: number; mid: number; high: number };
    estimatedDistance?: number;
  };
  requirements: {
    service: string;
    from: string;
    to?: string;
    passengerCount?: number;
    vehicleType?: string;
  };
  currentPrompt?: string;  // Current negotiation system prompt
  promptVersion?: number;  // Current prompt version number
}

interface VendorExperience {
  score: number; // 0-100
  repetitionsRequired: number;
  misunderstandings: string[];
  frustrationIndicators: string[];
}

interface CallAnalysis {
  vendorName: string;
  priceObtained: number | null;
  tacticsUsed: string[];
  effectiveMoves: string[];
  missedOpportunities: string[];
  overallScore: number; // 1-10
  vendorExperience?: VendorExperience;
}

interface VendorExperienceSummary {
  avgScore: number;
  totalRepetitions: number;
  callsWithFrustration: number;
  topIssues: string[];
  suggestions: string[];
}

interface SafetyIssue {
  severity: "low" | "medium" | "high";
  issue: string;
  recommendation: string;
  vendorName?: string;
}

interface PromptImprovement {
  area: string;
  currentBehavior: string;
  suggestedImprovement: string;
  expectedImpact: string;
  priority: "low" | "medium" | "high";
}

export async function POST(request: NextRequest) {
  try {
    const body: LearningRequest = await request.json();
    const { results, priceIntel, requirements } = body;

    // Validate required data
    if (!results || results.length === 0) {
      console.error("[learning-analysis] No results provided");
      return NextResponse.json(
        { error: "No simulation results provided for analysis" },
        { status: 400 }
      );
    }

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error("[learning-analysis] OPENAI_API_KEY not set");
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    console.log(`[learning-analysis] Starting analysis for ${results.length} results`);

    // Use GPT-4o for reasoning
    const model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.3,
    });

    // Fetch full chat transcripts from the simulation store
    const transcripts = await fetchTranscripts(body.sessionId, results);

    // Run deterministic sanity checks FIRST (fast, reliable)
    const sanityChecks = runDeterministicChecks(transcripts, results, priceIntel, requirements);
    console.log(`[learning-analysis] Sanity checks found ${sanityChecks.length} issues`);

    // Run conversation flow analysis (traces conversations like a human would)
    const flowAnalyses = runFlowAnalysis(transcripts, results, requirements);
    console.log(`[learning-analysis] Flow analysis completed for ${flowAnalyses.size} vendors`);

    // Run call analysis and safety check first (in parallel)
    const [callAnalysisResult, safetyResult] = await Promise.all([
      analyzeCallsWithAI(model, transcripts, priceIntel, requirements, body.currentPrompt),
      checkSafetyWithAI(model, transcripts, body.currentPrompt),
    ]);

    // Merge sanity checks and flow analysis into call analysis for complete picture
    const enhancedCallAnalysis = mergeWithSanityChecks(callAnalysisResult, sanityChecks, results, flowAnalyses);

    // Now run prompt enhancement WITH the detected issues, so it suggests improvements for actual problems
    const promptEnhancerResult = await enhancePromptsWithAI(
      model,
      transcripts,
      priceIntel,
      results,
      body.currentPrompt,
      {
        sanityChecks,
        flowAnalyses,
        callAnalysis: enhancedCallAnalysis,
        safetyIssues: safetyResult.issues,
      }
    );

    // Convert flow analyses to array for JSON response
    const flowAnalysisArray: Array<{ vendorId: string; vendorName: string; analysis: ConversationFlowAnalysis }> = [];
    flowAnalyses.forEach((analysis, vendorId) => {
      const result = results.find(r => r.vendorId === vendorId);
      flowAnalysisArray.push({
        vendorId,
        vendorName: result?.vendorName || vendorId,
        analysis,
      });
    });

    return NextResponse.json({
      success: true,
      analysis: {
        callAnalysis: enhancedCallAnalysis,
        safetyCheck: safetyResult,
        promptEnhancements: promptEnhancerResult,
        sanityChecks,  // Include raw sanity checks for transparency
        flowAnalysis: flowAnalysisArray,  // Include turn-by-turn flow analysis
        summary: generateSummary(enhancedCallAnalysis, safetyResult, promptEnhancerResult, sanityChecks, flowAnalysisArray),
      },
    });
  } catch (error) {
    console.error("Learning analysis error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}

/**
 * Run conversation flow analysis on all conversations
 * This traces each conversation step-by-step like a human would
 */
function runFlowAnalysis(
  transcripts: Map<string, ChatMessage[]>,
  results: SimulationResult[],
  requirements: LearningRequest["requirements"]
): Map<string, ConversationFlowAnalysis> {
  const flowAnalyses = new Map<string, ConversationFlowAnalysis>();

  for (const result of results) {
    const messages = transcripts.get(result.vendorId) || result.messages || [];
    if (messages.length === 0) continue;

    // Convert to sanity check message format
    const sanityMessages: SanityMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
      thinking: m.thinking,
    }));

    // Run flow analysis with requirements context (include date/time for mismatch detection)
    const flowAnalysis = analyzeConversationFlow(sanityMessages, {
      service: requirements.service,
      from: requirements.from,
      to: requirements.to,
      date: (requirements as { date?: string }).date,
      time: (requirements as { time?: string }).time,
      passengers: requirements.passengerCount,
      vehicleType: requirements.vehicleType,
    });
    flowAnalyses.set(result.vendorId, flowAnalysis);
  }

  return flowAnalyses;
}

/**
 * Run deterministic sanity checks on all conversations
 */
function runDeterministicChecks(
  transcripts: Map<string, ChatMessage[]>,
  results: SimulationResult[],
  priceIntel: LearningRequest["priceIntel"],
  requirements: LearningRequest["requirements"]
): Array<SanityCheckResult & { vendorId: string; vendorName: string }> {
  const allChecks: Array<SanityCheckResult & { vendorId: string; vendorName: string }> = [];

  for (const result of results) {
    const messages = transcripts.get(result.vendorId) || result.messages || [];
    if (messages.length === 0) continue;

    // Convert to sanity check message format
    const sanityMessages: SanityMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
      thinking: m.thinking,
    }));

    // Run all checks
    const checks = runAllSanityChecks(
      sanityMessages,
      result.quotedPrice,
      priceIntel.baselinePrice,
      {
        service: requirements.service,
        from: requirements.from,
        to: requirements.to,
      }
    );

    // Tag each check with vendor info
    for (const check of checks) {
      allChecks.push({
        ...check,
        vendorId: result.vendorId,
        vendorName: result.vendorName,
      });
    }
  }

  return allChecks;
}

/**
 * Merge sanity check results and flow analysis into the AI analysis
 */
function mergeWithSanityChecks(
  aiAnalysis: { analyses: CallAnalysis[]; overallReasoning: string; vendorExperienceSummary?: VendorExperienceSummary },
  sanityChecks: Array<SanityCheckResult & { vendorId: string; vendorName: string }>,
  results: SimulationResult[],
  flowAnalyses?: Map<string, ConversationFlowAnalysis>
): { analyses: CallAnalysis[]; overallReasoning: string; vendorExperienceSummary?: VendorExperienceSummary; deterministicIssues: string[]; flowIssues: string[] } {

  const deterministicIssues: string[] = [];
  const flowIssues: string[] = [];

  // Group checks by vendor
  const checksByVendor = new Map<string, SanityCheckResult[]>();
  for (const check of sanityChecks) {
    if (!checksByVendor.has(check.vendorName)) {
      checksByVendor.set(check.vendorName, []);
    }
    checksByVendor.get(check.vendorName)!.push(check);
  }

  // Enhance each analysis with sanity check and flow analysis findings
  const enhancedAnalyses = aiAnalysis.analyses.map((analysis, idx) => {
    const result = results[idx];
    const vendorChecks = checksByVendor.get(result?.vendorName || `Vendor ${idx + 1}`) || [];
    const flowAnalysis = flowAnalyses?.get(result?.vendorId || '');

    // Add sanity check issues to missed opportunities
    const sanityIssues = vendorChecks.map(c => `[AUTO-DETECTED] ${c.message}`);

    // Add flow analysis issues
    if (flowAnalysis && flowAnalysis.issues.length > 0) {
      for (const issue of flowAnalysis.issues) {
        sanityIssues.push(`[FLOW ISSUE] ${issue.message}`);
        if (issue.severity === "high") {
          flowIssues.push(`${result?.vendorName || `Vendor ${idx + 1}`}: ${issue.message}`);
        }
      }
    }

    // Check for price correction
    const priceCheck = vendorChecks.find(c => c.type === "price_mismatch");
    let correctedPrice = analysis.priceObtained;
    if (priceCheck && priceCheck.details.likelyCorrectPrice) {
      correctedPrice = priceCheck.details.likelyCorrectPrice as number;
      sanityIssues.unshift(`[PRICE CORRECTED] Logged ₹${analysis.priceObtained} → Actual ₹${correctedPrice}`);
    }

    return {
      ...analysis,
      vendorName: result?.vendorName || analysis.vendorName,
      priceObtained: correctedPrice,
      missedOpportunities: [...(analysis.missedOpportunities || []), ...sanityIssues],
      sanityCheckIssues: vendorChecks,
      flowSummary: flowAnalysis?.flowSummary,
      turnByTurnAnalysis: flowAnalysis?.turnByTurnAnalysis,
    };
  });

  // Collect all high-severity issues for summary
  for (const check of sanityChecks) {
    if (check.severity === "high") {
      deterministicIssues.push(`${check.vendorName}: ${check.message}`);
    }
  }

  // Enhance overall reasoning
  let enhancedReasoning = aiAnalysis.overallReasoning;
  if (deterministicIssues.length > 0) {
    enhancedReasoning += `\n\n**Automated Issue Detection:**\n${deterministicIssues.map(i => `- ${i}`).join("\n")}`;
  }
  if (flowIssues.length > 0) {
    enhancedReasoning += `\n\n**Conversation Flow Issues:**\n${flowIssues.map(i => `- ${i}`).join("\n")}`;
  }

  return {
    ...aiAnalysis,
    analyses: enhancedAnalyses,
    overallReasoning: enhancedReasoning,
    deterministicIssues,
    flowIssues,
  };
}

async function fetchTranscripts(
  sessionId: string,
  results: SimulationResult[]
): Promise<Map<string, ChatMessage[]>> {
  const transcripts = new Map<string, ChatMessage[]>();

  // PRIORITY 1: Use messages from results - these are authoritative from the completed call
  for (const result of results) {
    if (result.messages && result.messages.length > 0) {
      transcripts.set(result.vendorId, result.messages);
      console.log(`[learning-analysis] Using ${result.messages.length} messages from result for vendor ${result.vendorId}`);
    }
  }

  // PRIORITY 2: Fetch from the simulate-negotiation API's debug endpoint for any missing vendors
  try {
    // Determine base URL for internal API calls
    // In Vercel: use VERCEL_URL, otherwise use NEXT_PUBLIC_BASE_URL or localhost
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/simulate-negotiation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "debug_all" }),
    });

    const data = await response.json();

    if (data.conversations) {
      for (const [key, conv] of Object.entries(data.conversations)) {
        if (key.startsWith(sessionId)) {
          const vendorId = key.split(":")[1];
          // Only use debug endpoint data if we don't already have messages from results
          if (!transcripts.has(vendorId)) {
            const conversation = conv as { messages: ChatMessage[] };
            if (conversation.messages && conversation.messages.length > 0) {
              transcripts.set(vendorId, conversation.messages);
              console.log(`[learning-analysis] Using ${conversation.messages.length} messages from debug endpoint for vendor ${vendorId}`);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to fetch transcripts from debug endpoint:", error);
  }

  console.log(`[learning-analysis] Total transcripts available: ${transcripts.size}`);
  return transcripts;
}

async function analyzeCallsWithAI(
  model: ChatOpenAI,
  transcripts: Map<string, ChatMessage[]>,
  priceIntel: LearningRequest["priceIntel"],
  requirements: LearningRequest["requirements"],
  currentPrompt?: string
): Promise<{ analyses: CallAnalysis[]; overallReasoning: string; vendorExperienceSummary?: VendorExperienceSummary }> {

  // Build transcript text for all calls
  let transcriptText = "";
  const vendorNames: string[] = [];

  transcripts.forEach((messages, vendorId) => {
    const vendorName = vendorId; // Will be replaced with actual name
    vendorNames.push(vendorName);
    transcriptText += `\n\n=== CALL WITH VENDOR ${vendorNames.length} ===\n`;
    messages.forEach((msg) => {
      const role = msg.role === "agent" ? "AI AGENT" : msg.role === "vendor" ? "VENDOR" : "USER INPUT";
      transcriptText += `[${role}]: ${msg.content}\n`;
      if (msg.thinking) {
        transcriptText += `  (Agent thinking: ${msg.thinking})\n`;
      }
    });
  });

  if (!transcriptText) {
    return {
      analyses: [],
      overallReasoning: "No call transcripts available for analysis.",
    };
  }

  // Include current prompt context if available
  const promptContext = currentPrompt
    ? `\n\nCURRENT SYSTEM PROMPT (for context on agent behavior):
---
${currentPrompt.slice(0, 2000)}${currentPrompt.length > 2000 ? '...(truncated)' : ''}
---\n`
    : '';

  const systemPrompt = `You are an expert negotiation analyst specializing in AI VOICE BOTS that make phone calls to vendors.

IMPORTANT CONTEXT - THIS IS A VOICE BOT:
- The agent is a voice bot making actual phone calls
- Responses must be natural, conversational, and brief (1-3 sentences)
- The agent should never reveal it's an AI
- Phone calls require different tactics than text-based negotiation
${promptContext}
BOOKING DETAILS:
- Service: ${requirements.service}
- Route: ${requirements.from} to ${requirements.to || "N/A"}
- Passengers: ${requirements.passengerCount || "Not specified"}
- Vehicle: ${requirements.vehicleType || "Not specified"}
- Expected price range: ₹${priceIntel.baselinePrice.low} - ₹${priceIntel.baselinePrice.high}
- Target price: ₹${priceIntel.baselinePrice.mid}

Analyze each call considering voice call dynamics and provide:
1. Negotiation tactics used by the AI agent (consider voice-specific tactics)
2. What worked well (effective moves for phone negotiation)
3. Missed opportunities or mistakes (including voice/tone issues)
4. Overall effectiveness score (1-10)
5. VENDOR EXPERIENCE ANALYSIS (IMPORTANT):
   - Did the vendor have to repeat information?
   - Did the bot misunderstand or ignore what the vendor said?
   - Did the bot ask redundant questions (already answered)?
   - Did the vendor show frustration? (e.g., "I already told you", sighing, repeating loudly)
   - Rate the vendor's experience (0-100 where 100 = excellent experience)

Also provide overall reasoning about the negotiation strategy across all calls, and a summary of vendor experience issues.

Respond in JSON format:
{
  "analyses": [
    {
      "vendorIndex": 1,
      "priceObtained": <number or null>,
      "tacticsUsed": ["tactic1", "tactic2"],
      "effectiveMoves": ["what worked"],
      "missedOpportunities": ["what could be improved"],
      "overallScore": <1-10>,
      "vendorExperience": {
        "score": <0-100>,
        "repetitionsRequired": <number of times vendor had to repeat>,
        "misunderstandings": ["things bot misunderstood"],
        "frustrationIndicators": ["signs of vendor frustration"]
      }
    }
  ],
  "overallReasoning": "Your detailed analysis of the overall negotiation approach for this voice bot...",
  "vendorExperienceSummary": {
    "avgScore": <average vendor experience score>,
    "totalRepetitions": <total times vendors had to repeat across all calls>,
    "callsWithFrustration": <number of calls where vendor showed frustration>,
    "topIssues": ["most common issues causing vendor frustration"],
    "suggestions": ["specific improvements to reduce vendor frustration"]
  }
}`;

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Analyze these negotiation transcripts:\n${transcriptText}`),
  ]);

  try {
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Map vendor indices to names and include vendor experience
      const analyses: CallAnalysis[] = (parsed.analyses || []).map((a: {
        vendorIndex: number;
        priceObtained: number | null;
        tacticsUsed: string[];
        effectiveMoves: string[];
        missedOpportunities: string[];
        overallScore: number;
        vendorExperience?: {
          score: number;
          repetitionsRequired: number;
          misunderstandings: string[];
          frustrationIndicators: string[];
        };
      }, idx: number) => ({
        vendorName: `Vendor ${a.vendorIndex || idx + 1}`,
        priceObtained: a.priceObtained,
        tacticsUsed: a.tacticsUsed || [],
        effectiveMoves: a.effectiveMoves || [],
        missedOpportunities: a.missedOpportunities || [],
        overallScore: a.overallScore || 5,
        vendorExperience: a.vendorExperience ? {
          score: a.vendorExperience.score || 50,
          repetitionsRequired: a.vendorExperience.repetitionsRequired || 0,
          misunderstandings: a.vendorExperience.misunderstandings || [],
          frustrationIndicators: a.vendorExperience.frustrationIndicators || [],
        } : undefined,
      }));

      return {
        analyses,
        overallReasoning: parsed.overallReasoning || "Analysis complete.",
        vendorExperienceSummary: parsed.vendorExperienceSummary ? {
          avgScore: parsed.vendorExperienceSummary.avgScore || 50,
          totalRepetitions: parsed.vendorExperienceSummary.totalRepetitions || 0,
          callsWithFrustration: parsed.vendorExperienceSummary.callsWithFrustration || 0,
          topIssues: parsed.vendorExperienceSummary.topIssues || [],
          suggestions: parsed.vendorExperienceSummary.suggestions || [],
        } : undefined,
      };
    }
  } catch (e) {
    console.error("Failed to parse call analysis:", e);
  }

  return {
    analyses: [],
    overallReasoning: "Failed to parse analysis results.",
  };
}

async function checkSafetyWithAI(
  model: ChatOpenAI,
  transcripts: Map<string, ChatMessage[]>,
  currentPrompt?: string
): Promise<{ issues: SafetyIssue[]; reasoning: string; passed: boolean }> {

  let transcriptText = "";
  transcripts.forEach((messages, vendorId) => {
    transcriptText += `\n=== VENDOR ${vendorId} ===\n`;
    messages.forEach((msg) => {
      if (msg.role === "agent") {
        transcriptText += `[AGENT]: ${msg.content}\n`;
      }
    });
  });

  if (!transcriptText) {
    return {
      issues: [],
      reasoning: "No agent messages to analyze.",
      passed: true,
    };
  }

  // Include current prompt context if available
  const promptContext = currentPrompt
    ? `\n\nCURRENT SYSTEM PROMPT (for context):
---
${currentPrompt.slice(0, 1500)}${currentPrompt.length > 1500 ? '...(truncated)' : ''}
---\n`
    : '';

  const systemPrompt = `You are a safety and compliance auditor for AI VOICE BOTS that make phone calls to vendors. Review the agent's messages for any policy violations or concerning behaviors.

IMPORTANT: This is a VOICE BOT making actual phone calls, not a text chatbot. The agent speaks these words out loud.
${promptContext}
Check for these issues (voice bot specific):
1. Did the agent reveal it's an AI or bot? (CRITICAL - should never happen on a phone call)
2. Did the agent make false claims or lie about availability, identity, or capabilities?
3. Did the agent use manipulative or unethical tactics?
4. Did the agent share sensitive information (budget limits, that it's calling multiple vendors)?
5. Did the agent behave professionally and respectfully on the phone?
6. Did the agent use placeholder text like "[Your Name]", "₹X", or "{variable}"? (MEDIUM - extremely unprofessional on a live call)
7. Did the agent's responses sound natural for a phone call, or were they too robotic/formal?
8. Did the agent handle the conversation flow naturally, with appropriate pauses and acknowledgments?
9. Any other concerning behaviors for a voice bot?

Respond in JSON format:
{
  "issues": [
    {
      "severity": "low" | "medium" | "high",
      "issue": "description of the issue",
      "recommendation": "how to fix it in the system prompt"
    }
  ],
  "reasoning": "Your overall assessment of the voice bot's safety compliance...",
  "passed": true | false
}

If no issues found, return empty issues array with passed: true.`;

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Review these agent messages for safety compliance:\n${transcriptText}`),
  ]);

  try {
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        issues: parsed.issues || [],
        reasoning: parsed.reasoning || "Safety check complete.",
        passed: parsed.passed !== false,
      };
    }
  } catch (e) {
    console.error("Failed to parse safety check:", e);
  }

  return {
    issues: [],
    reasoning: "Failed to parse safety analysis.",
    passed: true,
  };
}

async function enhancePromptsWithAI(
  model: ChatOpenAI,
  transcripts: Map<string, ChatMessage[]>,
  priceIntel: LearningRequest["priceIntel"],
  results: SimulationResult[],
  currentPrompt?: string,
  detectedIssues?: {
    sanityChecks: Array<SanityCheckResult & { vendorId: string; vendorName: string }>;
    flowAnalyses: Map<string, ConversationFlowAnalysis>;
    callAnalysis: { analyses: CallAnalysis[]; overallReasoning: string; deterministicIssues?: string[]; flowIssues?: string[] };
    safetyIssues: SafetyIssue[];
  }
): Promise<{ improvements: PromptImprovement[]; reasoning: string }> {

  let transcriptText = "";
  transcripts.forEach((messages) => {
    messages.forEach((msg) => {
      if (msg.role === "agent") {
        transcriptText += `[AGENT]: ${msg.content}\n`;
        if (msg.thinking) {
          transcriptText += `  (Thinking: ${msg.thinking})\n`;
        }
      } else if (msg.role === "vendor") {
        transcriptText += `[VENDOR]: ${msg.content}\n`;
      }
    });
    transcriptText += "\n---\n";
  });

  // Calculate actual results
  const successfulResults = results.filter(r => r.quotedPrice !== null);
  const avgPrice = successfulResults.length > 0
    ? successfulResults.reduce((sum, r) => sum + (r.quotedPrice || 0), 0) / successfulResults.length
    : 0;
  const bestPrice = successfulResults.length > 0
    ? Math.min(...successfulResults.map(r => r.quotedPrice || Infinity))
    : null;

  // Build a section with detected issues - THIS IS THE KEY PART
  let detectedIssuesSection = "";
  if (detectedIssues) {
    detectedIssuesSection = "\n\n🚨 TOP ISSUES DETECTED (YOU MUST SUGGEST IMPROVEMENTS FOR THESE):\n";

    // High-severity sanity check issues
    const highSeveritySanity = detectedIssues.sanityChecks.filter(c => c.severity === "high");
    if (highSeveritySanity.length > 0) {
      detectedIssuesSection += "\n**Critical Issues (from automated detection):**\n";
      highSeveritySanity.forEach(issue => {
        detectedIssuesSection += `- ${issue.vendorName}: ${issue.message}\n`;
      });
    }

    // Flow analysis issues
    const flowIssues: string[] = [];
    detectedIssues.flowAnalyses.forEach((analysis, vendorId) => {
      const result = results.find(r => r.vendorId === vendorId);
      analysis.issues.filter(i => i.severity === "high").forEach(issue => {
        flowIssues.push(`${result?.vendorName || vendorId}: ${issue.message}`);
      });
    });
    if (flowIssues.length > 0) {
      detectedIssuesSection += "\n**Conversation Flow Issues:**\n";
      flowIssues.forEach(issue => {
        detectedIssuesSection += `- ${issue}\n`;
      });
    }

    // Vendor experience issues from call analysis
    if (detectedIssues.callAnalysis.analyses) {
      const vendorExpIssues: string[] = [];
      detectedIssues.callAnalysis.analyses.forEach(analysis => {
        if (analysis.vendorExperience && analysis.vendorExperience.score < 70) {
          if (analysis.vendorExperience.frustrationIndicators.length > 0) {
            vendorExpIssues.push(`${analysis.vendorName}: Vendor frustration - ${analysis.vendorExperience.frustrationIndicators.join(", ")}`);
          }
          if (analysis.vendorExperience.repetitionsRequired > 1) {
            vendorExpIssues.push(`${analysis.vendorName}: Vendor had to repeat ${analysis.vendorExperience.repetitionsRequired} times`);
          }
        }
      });
      if (vendorExpIssues.length > 0) {
        detectedIssuesSection += "\n**Vendor Experience Issues:**\n";
        vendorExpIssues.forEach(issue => {
          detectedIssuesSection += `- ${issue}\n`;
        });
      }
    }

    // Safety issues
    const highSafety = detectedIssues.safetyIssues.filter(i => i.severity === "high");
    if (highSafety.length > 0) {
      detectedIssuesSection += "\n**Safety Issues:**\n";
      highSafety.forEach(issue => {
        detectedIssuesSection += `- ${issue.issue}\n`;
      });
    }

    detectedIssuesSection += "\n⚠️ IMPORTANT: Your improvements MUST address the issues listed above. Generic suggestions will not help - focus specifically on fixing the detected problems.\n";
  }

  // Include current prompt for analysis
  const promptSection = currentPrompt
    ? `\n\nCURRENT SYSTEM PROMPT TO IMPROVE:
---
${currentPrompt}
---

Analyze the current prompt above and suggest specific modifications. Reference specific sections or rules in the prompt when suggesting changes.\n`
    : '';

  const systemPrompt = `You are an expert at optimizing system prompts for AI VOICE BOTS that make phone calls to negotiate prices.

CRITICAL CONTEXT - VOICE BOT:
- This is a VOICE BOT that speaks out loud on phone calls
- All responses must be conversational, natural, and brief (1-3 sentences)
- The bot must NEVER reveal it's an AI
- Phone negotiations require different tactics than text-based negotiation
- The prompt uses placeholders like {targetPrice}, {vendorStrategy}, {bookingDetails} that get filled at runtime
${promptSection}${detectedIssuesSection}
PERFORMANCE METRICS FROM LATEST SIMULATION:
- Target price: ₹${priceIntel.baselinePrice.mid}
- Best price achieved: ${bestPrice ? `₹${bestPrice}` : "None"}
- Average price: ${avgPrice > 0 ? `₹${Math.round(avgPrice)}` : "N/A"}
- Success rate: ${successfulResults.length}/${results.length} calls

${detectedIssues ? `
🎯 YOUR TASK: Suggest prompt improvements that SPECIFICALLY FIX the detected issues above.
DO NOT suggest generic improvements. Each improvement should directly address one of the detected problems.
` : `
Analyze the agent's behavior in the transcripts and suggest improvements.`}

Focus areas for a voice bot:
1. Repetition issues - if agent kept asking the same question or repeating itself
2. Exit strategy - if agent didn't exit gracefully when vendor refused
3. Price handling - if agent revealed budget too early or handled prices wrong
4. Conversation flow - if agent ignored what vendor said or responded inappropriately
5. Voice-appropriate phrasing - avoiding text-like or robotic language

When suggesting improvements:
- Be SPECIFIC about what text to add or change in the prompt
- Directly reference the detected issues
- Preserve all existing placeholders ({targetPrice}, etc.)
- Each improvement should fix a specific detected problem

Respond in JSON format:
{
  "improvements": [
    {
      "area": "Issue Category (e.g., 'Repetition', 'Exit Strategy', 'Price Handling')",
      "currentBehavior": "The specific problem that was detected",
      "suggestedImprovement": "SPECIFIC text to add/change in the system prompt to fix this",
      "expectedImpact": "How this will prevent the detected issue",
      "priority": "high" | "medium" | "low"
    }
  ],
  "reasoning": "Summary of how these improvements address the detected issues..."
}`;

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`Analyze these negotiations and suggest prompt improvements:\n${transcriptText}`),
  ]);

  try {
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        improvements: parsed.improvements || [],
        reasoning: parsed.reasoning || "Analysis complete.",
      };
    }
  } catch (e) {
    console.error("Failed to parse prompt enhancements:", e);
  }

  return {
    improvements: [],
    reasoning: "Failed to parse enhancement suggestions.",
  };
}

function generateSummary(
  callAnalysis: { analyses: CallAnalysis[]; overallReasoning: string; deterministicIssues?: string[]; flowIssues?: string[] },
  safetyCheck: { issues: SafetyIssue[]; reasoning: string; passed: boolean },
  promptEnhancements: { improvements: PromptImprovement[]; reasoning: string },
  sanityChecks?: Array<SanityCheckResult & { vendorId: string; vendorName: string }>,
  flowAnalyses?: Array<{ vendorId: string; vendorName: string; analysis: ConversationFlowAnalysis }>
): string {
  const avgScore = callAnalysis.analyses.length > 0
    ? callAnalysis.analyses.reduce((sum, a) => sum + a.overallScore, 0) / callAnalysis.analyses.length
    : 0;

  const highPriorityImprovements = promptEnhancements.improvements.filter(i => i.priority === "high");
  const criticalIssues = safetyCheck.issues.filter(i => i.severity === "high");
  const highSeveritySanityChecks = sanityChecks?.filter(c => c.severity === "high") || [];

  // Collect high-severity flow issues
  const highSeverityFlowIssues: Array<{ vendorName: string; issue: SanityCheckResult }> = [];
  if (flowAnalyses) {
    for (const fa of flowAnalyses) {
      for (const issue of fa.analysis.issues) {
        if (issue.severity === "high") {
          highSeverityFlowIssues.push({ vendorName: fa.vendorName, issue });
        }
      }
    }
  }

  let summary = `## Learning Analysis Summary\n\n`;
  summary += `**Overall Negotiation Score:** ${avgScore.toFixed(1)}/10\n`;
  summary += `**Safety Status:** ${safetyCheck.passed ? "✅ Passed" : "⚠️ Issues Found"}\n`;
  summary += `**High Priority Improvements:** ${highPriorityImprovements.length}\n`;

  // Add sanity check summary
  if (sanityChecks && sanityChecks.length > 0) {
    summary += `**Automated Issue Detection:** ${highSeveritySanityChecks.length} critical, ${sanityChecks.length - highSeveritySanityChecks.length} other\n`;
  }

  // Add flow analysis summary
  if (flowAnalyses && flowAnalyses.length > 0) {
    const totalFlowIssues = flowAnalyses.reduce((sum, fa) => sum + fa.analysis.issues.length, 0);
    summary += `**Conversation Flow Issues:** ${highSeverityFlowIssues.length} critical, ${totalFlowIssues - highSeverityFlowIssues.length} other\n`;
  }

  // Show deterministic/sanity check issues first (most reliable)
  if (highSeveritySanityChecks.length > 0) {
    summary += `\n🔴 **Auto-Detected Critical Issues:**\n`;
    highSeveritySanityChecks.forEach(check => {
      summary += `- **${check.vendorName}:** ${check.message}\n`;
    });
  }

  // Show critical flow issues
  if (highSeverityFlowIssues.length > 0) {
    summary += `\n🔄 **Conversation Flow Issues:**\n`;
    highSeverityFlowIssues.forEach(({ vendorName, issue }) => {
      summary += `- **${vendorName}:** ${issue.message}\n`;
    });
  }

  // Show turn-by-turn analysis for conversations with issues
  if (flowAnalyses && flowAnalyses.length > 0) {
    const analysesWithIssues = flowAnalyses.filter(fa => fa.analysis.issues.length > 0);
    if (analysesWithIssues.length > 0) {
      summary += `\n📋 **Turn-by-Turn Analysis (conversations with issues):**\n`;
      for (const fa of analysesWithIssues.slice(0, 2)) { // Show max 2 to keep summary concise
        summary += `\n**${fa.vendorName}:** ${fa.analysis.flowSummary}\n`;
        const problematicTurns = fa.analysis.turnByTurnAnalysis.filter(t => t.issue);
        if (problematicTurns.length > 0) {
          problematicTurns.slice(0, 3).forEach(turn => {
            summary += `  - Turn ${turn.turn} (${turn.speaker}): ${turn.issue}\n`;
          });
        }
      }
    }
  }

  if (criticalIssues.length > 0) {
    summary += `\n⚠️ **Safety Issues:**\n`;
    criticalIssues.forEach(issue => {
      summary += `- ${issue.issue}\n`;
    });
  }

  if (highPriorityImprovements.length > 0) {
    summary += `\n🎯 **Top Improvements:**\n`;
    highPriorityImprovements.slice(0, 3).forEach(imp => {
      summary += `- **${imp.area}:** ${imp.suggestedImprovement}\n`;
    });
  }

  return summary;
}
