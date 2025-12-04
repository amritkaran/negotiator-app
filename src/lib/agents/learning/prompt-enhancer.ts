import { ChatOpenAI } from "@langchain/openai";
import {
  NegotiatorGraphState,
  PromptEnhancement,
  CallAnalysisResult,
  SafetyCheckResult,
  SupportedLanguage,
  createAgentEvent
} from "../types";

// Generate prompt enhancements based on learnings
async function generateEnhancements(
  callAnalyses: CallAnalysisResult[],
  safetyChecks: SafetyCheckResult[],
  sessionLearnings: string[],
  currentEnhancement: PromptEnhancement | null
): Promise<PromptEnhancement> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.4,
  });

  // Gather all successful and failed tactics
  const successfulTactics = callAnalyses.flatMap((a) => a.successfulTactics);
  const failedTactics = callAnalyses.flatMap((a) => a.failedTactics);
  const objections = callAnalyses.flatMap((a) => a.objectionsFaced);
  const safetyRecommendations = safetyChecks.flatMap((c) => c.recommendations);

  // Build context from previous enhancements
  const previousEnhancements = currentEnhancement
    ? `
Previous effective phrases: ${currentEnhancement.effectivePhrases.join(", ")}
Previous avoid phrases: ${currentEnhancement.avoidPhrases.join(", ")}
Previous objection handlers: ${JSON.stringify(currentEnhancement.objectionHandlers)}
`
    : "No previous enhancements.";

  const prompt = `Based on call analysis results, generate enhanced prompts for future negotiation calls.

## Call Analysis Summary
- Calls analyzed: ${callAnalyses.length}
- Average effectiveness: ${callAnalyses.length > 0 ? Math.round(callAnalyses.reduce((s, a) => s + a.effectiveness, 0) / callAnalyses.length) : 0}%

## Successful Tactics
${successfulTactics.length > 0 ? successfulTactics.map((t) => `- ${t}`).join("\n") : "None identified"}

## Failed Tactics
${failedTactics.length > 0 ? failedTactics.map((t) => `- ${t}`).join("\n") : "None identified"}

## Objections Faced
${objections.length > 0 ? objections.map((o) => `- "${o.objection}" → Response: "${o.response}" (${o.outcome})`).join("\n") : "None recorded"}

## Safety Recommendations
${safetyRecommendations.length > 0 ? safetyRecommendations.map((r) => `- ${r}`).join("\n") : "No safety concerns"}

## Session Learnings
${sessionLearnings.length > 0 ? sessionLearnings.map((l) => `- ${l}`).join("\n") : "None"}

${previousEnhancements}

Generate enhanced guidance for future calls:

1. Effective phrases to USE in negotiation (in English, will be translated)
2. Phrases to AVOID
3. Objection handlers (objection → suggested response)
4. Cultural notes for Indian context
5. Language-specific tips for Kannada, Hindi, Telugu, English
6. A prompt addition paragraph to enhance the negotiation prompt

Respond in JSON:
{
  "effectivePhrases": ["phrase1", "phrase2", ...],
  "avoidPhrases": ["phrase1", "phrase2", ...],
  "objectionHandlers": {
    "objection1": "response1",
    "objection2": "response2"
  },
  "culturalNotes": ["note1", "note2", ...],
  "languageSpecificTips": {
    "kn": ["tip1", "tip2"],
    "hi": ["tip1", "tip2"],
    "te": ["tip1", "tip2"],
    "en": ["tip1", "tip2"]
  },
  "promptAdditions": "paragraph to add to the negotiation prompt for better results"
}`;

  try {
    const response = await model.invoke(prompt);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);

      // Merge with previous enhancements
      const mergedEffectivePhrases = [
        ...new Set([
          ...(currentEnhancement?.effectivePhrases || []),
          ...(result.effectivePhrases || []),
        ]),
      ].slice(0, 10);

      const mergedAvoidPhrases = [
        ...new Set([
          ...(currentEnhancement?.avoidPhrases || []),
          ...(result.avoidPhrases || []),
        ]),
      ].slice(0, 10);

      const mergedObjectionHandlers = {
        ...(currentEnhancement?.objectionHandlers || {}),
        ...(result.objectionHandlers || {}),
      };

      const mergedCulturalNotes = [
        ...new Set([
          ...(currentEnhancement?.culturalNotes || []),
          ...(result.culturalNotes || []),
        ]),
      ].slice(0, 8);

      // Merge language-specific tips
      const languages: SupportedLanguage[] = ["kn", "hi", "te", "en"];
      const mergedLanguageTips: Record<SupportedLanguage, string[]> = {
        kn: [],
        hi: [],
        te: [],
        en: [],
      };

      for (const lang of languages) {
        mergedLanguageTips[lang] = [
          ...new Set([
            ...(currentEnhancement?.languageSpecificTips?.[lang] || []),
            ...(result.languageSpecificTips?.[lang] || []),
          ]),
        ].slice(0, 5);
      }

      return {
        version: (currentEnhancement?.version || 0) + 1,
        createdAt: new Date(),
        basedOnCallIds: callAnalyses.map((a) => a.callId),
        effectivePhrases: mergedEffectivePhrases,
        avoidPhrases: mergedAvoidPhrases,
        objectionHandlers: mergedObjectionHandlers,
        culturalNotes: mergedCulturalNotes,
        languageSpecificTips: mergedLanguageTips,
        promptAdditions: result.promptAdditions || "",
      };
    }
  } catch (error) {
    console.error("Prompt enhancement error:", error);
  }

  // Return minimal enhancement if LLM fails
  return {
    version: (currentEnhancement?.version || 0) + 1,
    createdAt: new Date(),
    basedOnCallIds: callAnalyses.map((a) => a.callId),
    effectivePhrases: currentEnhancement?.effectivePhrases || [],
    avoidPhrases: currentEnhancement?.avoidPhrases || [],
    objectionHandlers: currentEnhancement?.objectionHandlers || {},
    culturalNotes: currentEnhancement?.culturalNotes || [],
    languageSpecificTips: currentEnhancement?.languageSpecificTips || {
      kn: [],
      hi: [],
      te: [],
      en: [],
    },
    promptAdditions: currentEnhancement?.promptAdditions || "",
  };
}

// Main Prompt Enhancer function
export async function promptEnhancerAgent(
  state: NegotiatorGraphState
): Promise<Partial<NegotiatorGraphState>> {
  const events = [
    createAgentEvent(
      "sub_agent_started",
      "learning.prompt_enhancer",
      "Generating prompt enhancements based on learnings..."
    ),
  ];

  // Check if we have enough data to generate enhancements
  if (state.learning.callAnalyses.length === 0) {
    events.push(
      createAgentEvent(
        "sub_agent_completed",
        "learning.prompt_enhancer",
        "No call analyses available - skipping prompt enhancement"
      )
    );
    return {
      agentEvents: events,
    };
  }

  const enhancement = await generateEnhancements(
    state.learning.callAnalyses,
    state.learning.safetyChecks,
    state.learning.sessionLearnings,
    state.learning.currentPromptEnhancement
  );

  events.push(
    createAgentEvent(
      "prompt_enhanced",
      "learning.prompt_enhancer",
      `Prompt enhancement v${enhancement.version} generated. ${enhancement.effectivePhrases.length} effective phrases, ${Object.keys(enhancement.objectionHandlers).length} objection handlers.`,
      {
        version: enhancement.version,
        effectivePhrases: enhancement.effectivePhrases.slice(0, 3),
        avoidPhrases: enhancement.avoidPhrases.slice(0, 3),
        objectionCount: Object.keys(enhancement.objectionHandlers).length,
        culturalNotes: enhancement.culturalNotes.slice(0, 2),
      }
    )
  );

  // Log the prompt additions for visibility
  if (enhancement.promptAdditions) {
    events.push(
      createAgentEvent(
        "learning_insight",
        "learning.prompt_enhancer",
        `New guidance: "${enhancement.promptAdditions.substring(0, 200)}${enhancement.promptAdditions.length > 200 ? "..." : ""}"`,
        { fullAdditions: enhancement.promptAdditions }
      )
    );
  }

  events.push(
    createAgentEvent(
      "sub_agent_completed",
      "learning.prompt_enhancer",
      "Prompt enhancement complete - will be applied to next negotiation session"
    )
  );

  return {
    agentEvents: events,
    learning: {
      ...state.learning,
      currentPromptEnhancement: enhancement,
    },
  };
}
