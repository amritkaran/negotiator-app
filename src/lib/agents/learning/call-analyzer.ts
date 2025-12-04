import { ChatOpenAI } from "@langchain/openai";
import {
  NegotiatorGraphState,
  CallAnalysisResult,
  NegotiationCallState,
  createAgentEvent
} from "../types";

// Check if extracted price is suspiciously different from baseline
function isPriceSuspicious(quotedPrice: number | null, baselinePrice: number | null): { suspicious: boolean; reason: string | null } {
  if (!quotedPrice || !baselinePrice) {
    return { suspicious: false, reason: null };
  }

  // Price is suspiciously low if it's less than 30% of baseline (e.g., 100 when baseline is 800-1000)
  if (quotedPrice < baselinePrice * 0.3) {
    return {
      suspicious: true,
      reason: `Price ₹${quotedPrice} is suspiciously low (less than 30% of baseline ₹${baselinePrice}). Likely a regex extraction error - could be distance, time, or other number.`
    };
  }

  // Price is suspiciously high if it's more than 3x baseline
  if (quotedPrice > baselinePrice * 3) {
    return {
      suspicious: true,
      reason: `Price ₹${quotedPrice} is suspiciously high (more than 3x baseline ₹${baselinePrice}). May need manual verification.`
    };
  }

  return { suspicious: false, reason: null };
}

// Analyze a single call's effectiveness
async function analyzeCall(
  call: NegotiationCallState,
  baselinePrice: number | null
): Promise<CallAnalysisResult & { priceVerificationNeeded?: boolean; priceVerificationReason?: string }> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.3,
  });

  // Check for suspicious price before analysis
  const priceCheck = isPriceSuspicious(call.quotedPrice, baselinePrice);

  const prompt = `Analyze this negotiation call transcript for effectiveness AND vendor experience.

Business: ${call.businessName}
Call Status: ${call.status}
Quoted Price: ${call.quotedPrice ? `₹${call.quotedPrice}` : "Not obtained"}
Baseline Price: ${baselinePrice ? `₹${baselinePrice}` : "Unknown"}
Language: ${call.language}
${priceCheck.suspicious ? `\n⚠️ PRICE ALERT: ${priceCheck.reason}\nPlease carefully verify the actual price mentioned in the transcript. The extracted price may be incorrect.` : ""}

Transcript:
${call.transcript || "No transcript available"}

Analyze TWO aspects:

A. NEGOTIATION EFFECTIVENESS:
1. Overall effectiveness (0-100 score)
2. What negotiation tactics worked well
3. What tactics failed or backfired
4. Vendor's personality type (aggressive, flexible, professional, difficult, friendly)
5. Key lessons learned for future calls
6. Specific objections faced and how they were handled
${priceCheck.suspicious ? "7. IMPORTANT: What is the ACTUAL price the vendor quoted in the transcript? (Look for clear price mentions like 'Rs 800', '₹900', 'eight hundred', etc.)" : ""}

B. VENDOR EXPERIENCE (UX):
Analyze the call from the VENDOR's perspective. A good bot should:
- Understand the vendor on the first try (not make them repeat)
- Respond appropriately to what the vendor said
- Not ask irrelevant or redundant questions
- Be polite and professional
- Not frustrate or confuse the vendor

Look for these issues:
- Did the vendor have to repeat information?
- Did the bot misunderstand or ignore what the vendor said?
- Did the bot ask questions already answered?
- Did the vendor show signs of frustration (sighing, "I already told you", repeating loudly)?
- Did the bot respond to something completely different than what vendor said?

Respond in JSON:
{
  "effectiveness": number (0-100),
  "successfulTactics": ["tactic1", "tactic2"],
  "failedTactics": ["tactic1", "tactic2"],
  "vendorPersonality": "aggressive" | "flexible" | "professional" | "difficult" | "friendly",
  "lessonsLearned": ["lesson1", "lesson2"],
  "objectionsFaced": [
    {"objection": "objection text", "response": "how agent responded", "outcome": "successful" | "failed"}
  ],
  "vendorExperience": {
    "score": number (0-100, where 100 = excellent experience, vendor never frustrated),
    "repetitionsRequired": number (how many times vendor had to repeat themselves),
    "misunderstandings": ["list of things the bot misunderstood or ignored"],
    "frustrationIndicators": ["signs of vendor frustration observed"],
    "redundantQuestions": ["questions the bot asked that were already answered"],
    "positiveInteractions": ["things the bot did well from vendor's perspective"],
    "suggestions": ["specific improvements to reduce vendor frustration"]
  }${priceCheck.suspicious ? ',\n  "actualPriceFromTranscript": number | null // The real price mentioned by vendor, if different from extracted price' : ""}
}`;

  try {
    const response = await model.invoke(prompt);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);

      // If price was suspicious and LLM found a different actual price, use that
      let effectivePrice = call.quotedPrice;
      let priceWasCorrected = false;
      if (priceCheck.suspicious && result.actualPriceFromTranscript && result.actualPriceFromTranscript !== call.quotedPrice) {
        console.warn(`[call-analyzer] Price correction: Extracted ₹${call.quotedPrice} → LLM found actual price ₹${result.actualPriceFromTranscript}`);
        effectivePrice = result.actualPriceFromTranscript;
        priceWasCorrected = true;
      }

      // Adjust effectiveness based on outcome
      let adjustedEffectiveness = result.effectiveness || 50;

      if (effectivePrice && baselinePrice) {
        // Bonus for getting price below baseline
        if (effectivePrice < baselinePrice) {
          adjustedEffectiveness = Math.min(100, adjustedEffectiveness + 10);
        }
        // Penalty for price much higher than baseline
        if (effectivePrice > baselinePrice * 1.3) {
          adjustedEffectiveness = Math.max(0, adjustedEffectiveness - 15);
        }
      }

      // Penalty for failed calls
      if (call.status === "failed") {
        adjustedEffectiveness = Math.max(0, adjustedEffectiveness - 20);
      }

      // Add lesson learned if price was corrected
      const lessonsLearned = result.lessonsLearned || [];
      if (priceWasCorrected) {
        lessonsLearned.unshift(`Price extraction error detected: regex captured ₹${call.quotedPrice} but actual vendor quote was ₹${effectivePrice}`);
      }

      // Add vendor UX lessons if there were issues
      const vendorExp = result.vendorExperience;
      if (vendorExp) {
        if (vendorExp.repetitionsRequired > 0) {
          lessonsLearned.push(`Vendor had to repeat themselves ${vendorExp.repetitionsRequired} time(s) - improve listening/comprehension`);
        }
        if (vendorExp.misunderstandings?.length > 0) {
          lessonsLearned.push(`Bot misunderstandings to fix: ${vendorExp.misunderstandings.slice(0, 2).join('; ')}`);
        }
        if (vendorExp.suggestions?.length > 0) {
          lessonsLearned.push(...vendorExp.suggestions.slice(0, 2));
        }
      }

      return {
        callId: call.callId,
        effectiveness: adjustedEffectiveness,
        successfulTactics: result.successfulTactics || [],
        failedTactics: result.failedTactics || [],
        vendorPersonality: result.vendorPersonality || "professional",
        lessonsLearned,
        objectionsFaced: result.objectionsFaced || [],
        vendorExperience: vendorExp ? {
          score: vendorExp.score || 50,
          repetitionsRequired: vendorExp.repetitionsRequired || 0,
          misunderstandings: vendorExp.misunderstandings || [],
          frustrationIndicators: vendorExp.frustrationIndicators || [],
          redundantQuestions: vendorExp.redundantQuestions || [],
          positiveInteractions: vendorExp.positiveInteractions || [],
          suggestions: vendorExp.suggestions || [],
        } : undefined,
        // Include price verification info
        priceVerificationNeeded: priceCheck.suspicious && !priceWasCorrected,
        priceVerificationReason: priceCheck.reason || undefined,
        // Store corrected price for upstream use
        ...(priceWasCorrected ? { correctedPrice: effectivePrice } : {}),
      };
    }
  } catch (error) {
    console.error("Call analysis error:", error);
  }

  // Default analysis
  return {
    callId: call.callId,
    effectiveness: call.status === "completed" ? 50 : 20,
    successfulTactics: [],
    failedTactics: [],
    vendorPersonality: "professional",
    lessonsLearned: ["Unable to analyze - no transcript"],
    objectionsFaced: [],
    vendorExperience: undefined,
    priceVerificationNeeded: priceCheck.suspicious,
    priceVerificationReason: priceCheck.reason || undefined,
  };
}

// Main Call Analyzer function
export async function callAnalyzerAgent(
  state: NegotiatorGraphState
): Promise<Partial<NegotiatorGraphState>> {
  const events = [
    createAgentEvent(
      "sub_agent_started",
      "learning.call_analyzer",
      `Analyzing ${state.negotiation.calls.length} calls for effectiveness...`
    ),
  ];

  const callAnalyses: CallAnalysisResult[] = [];
  const baselinePrice = state.research?.priceIntel?.baselinePrice?.mid || null;

  // Analyze each call
  for (const call of state.negotiation.calls) {
    if (!call.transcript) {
      events.push(
        createAgentEvent(
          "sub_agent_started",
          "learning.call_analyzer",
          `Skipping ${call.businessName} - no transcript available`
        )
      );
      continue;
    }

    events.push(
      createAgentEvent(
        "sub_agent_started",
        "learning.call_analyzer",
        `Analyzing call to ${call.businessName}...`
      )
    );

    const analysis = await analyzeCall(call, baselinePrice);
    callAnalyses.push(analysis);

    // Emit warning event if price verification is needed
    if (analysis.priceVerificationNeeded) {
      events.push(
        createAgentEvent(
          "price_verification_needed",
          "learning.call_analyzer",
          `⚠️ ${call.businessName}: ${analysis.priceVerificationReason}`,
          {
            callId: call.callId,
            extractedPrice: call.quotedPrice,
            baselinePrice,
            reason: analysis.priceVerificationReason,
          }
        )
      );
    }

    // Emit event if price was corrected by LLM analysis
    if ((analysis as { correctedPrice?: number }).correctedPrice) {
      events.push(
        createAgentEvent(
          "price_corrected",
          "learning.call_analyzer",
          `🔧 ${call.businessName}: Price corrected from ₹${call.quotedPrice} to ₹${(analysis as { correctedPrice?: number }).correctedPrice} based on transcript analysis`,
          {
            callId: call.callId,
            originalPrice: call.quotedPrice,
            correctedPrice: (analysis as { correctedPrice?: number }).correctedPrice,
          }
        )
      );
    }

    // Emit vendor experience event if there were UX issues
    const vendorExp = analysis.vendorExperience;
    if (vendorExp && (vendorExp.repetitionsRequired > 0 || vendorExp.frustrationIndicators.length > 0)) {
      events.push(
        createAgentEvent(
          "learning_insight",
          "learning.call_analyzer",
          `👤 ${call.businessName} Vendor UX: ${vendorExp.score}% satisfaction. ${vendorExp.repetitionsRequired > 0 ? `Vendor repeated ${vendorExp.repetitionsRequired}x.` : ""} ${vendorExp.frustrationIndicators[0] || ""}`,
          {
            callId: call.callId,
            vendorExperienceScore: vendorExp.score,
            repetitionsRequired: vendorExp.repetitionsRequired,
            frustrationIndicators: vendorExp.frustrationIndicators,
            misunderstandings: vendorExp.misunderstandings,
          }
        )
      );
    }

    events.push(
      createAgentEvent(
        "learning_insight",
        "learning.call_analyzer",
        `${call.businessName}: ${analysis.effectiveness}% effective. ${analysis.lessonsLearned[0] || "No specific insights."}`,
        {
          callId: call.callId,
          effectiveness: analysis.effectiveness,
          personality: analysis.vendorPersonality,
          successfulTactics: analysis.successfulTactics.length,
          failedTactics: analysis.failedTactics.length,
          vendorExperienceScore: vendorExp?.score,
        }
      )
    );
  }

  // Generate summary insights
  const avgEffectiveness = callAnalyses.length > 0
    ? Math.round(callAnalyses.reduce((sum, a) => sum + a.effectiveness, 0) / callAnalyses.length)
    : 0;

  // Calculate average vendor experience score
  const vendorExpAnalyses = callAnalyses.filter(a => a.vendorExperience);
  const avgVendorExperience = vendorExpAnalyses.length > 0
    ? Math.round(vendorExpAnalyses.reduce((sum, a) => sum + (a.vendorExperience?.score || 0), 0) / vendorExpAnalyses.length)
    : null;
  const totalRepetitions = vendorExpAnalyses.reduce((sum, a) => sum + (a.vendorExperience?.repetitionsRequired || 0), 0);

  const allSuccessfulTactics = callAnalyses.flatMap((a) => a.successfulTactics);
  const allFailedTactics = callAnalyses.flatMap((a) => a.failedTactics);
  const allLessons = callAnalyses.flatMap((a) => a.lessonsLearned);
  const allVendorSuggestions = callAnalyses.flatMap((a) => a.vendorExperience?.suggestions || []);

  events.push(
    createAgentEvent(
      "sub_agent_completed",
      "learning.call_analyzer",
      `Call analysis complete. Effectiveness: ${avgEffectiveness}%${avgVendorExperience !== null ? `, Vendor UX: ${avgVendorExperience}%` : ""}${totalRepetitions > 0 ? ` (${totalRepetitions} repetitions needed)` : ""}`,
      {
        callsAnalyzed: callAnalyses.length,
        avgEffectiveness,
        avgVendorExperience,
        totalRepetitions,
        topTactics: [...new Set(allSuccessfulTactics)].slice(0, 3),
        avoidTactics: [...new Set(allFailedTactics)].slice(0, 3),
        vendorUXSuggestions: [...new Set(allVendorSuggestions)].slice(0, 3),
      }
    )
  );

  return {
    agentEvents: events,
    learning: {
      ...state.learning,
      callAnalyses,
      sessionLearnings: [
        ...state.learning.sessionLearnings,
        ...allLessons.slice(0, 5),
      ],
    },
  };
}
