import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

interface PromptImprovement {
  area: string;
  currentBehavior: string;
  suggestedImprovement: string;
  expectedImpact: string;
  priority: "low" | "medium" | "high";
}

export async function POST(request: NextRequest) {
  try {
    const { currentPrompt, improvements } = await request.json();

    if (!currentPrompt || !improvements || improvements.length === 0) {
      return NextResponse.json(
        { error: "Missing currentPrompt or improvements" },
        { status: 400 }
      );
    }

    const model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.3,
    });

    const systemPrompt = `You are an expert at writing prompts for AI voice negotiation agents. Your task is to update a negotiation prompt based on specific improvements.

IMPORTANT CONTEXT:
- This prompt is for a VOICE BOT that makes phone calls to vendors
- The agent speaks out loud, so responses must be conversational and natural
- Keep responses brief (1-3 sentences) since it's a phone call
- The agent should never reveal it's an AI
- The prompt uses placeholders like {targetPrice}, {vendorStrategy}, etc. that get filled in at runtime

When applying improvements:
1. Integrate each improvement naturally into the existing prompt structure
2. Be specific and actionable in the instructions
3. Maintain the professional but conversational tone
4. Keep the core negotiation rules intact
5. Add new tactics/behaviors where they make sense
6. Preserve all existing placeholders (they are needed for the system to work)

Return ONLY the new prompt text, nothing else. Do not include explanations or markdown formatting.`;

    const improvementsList = improvements
      .map(
        (imp: PromptImprovement, idx: number) =>
          `${idx + 1}. **${imp.area}**
   - Current: ${imp.currentBehavior}
   - Improvement: ${imp.suggestedImprovement}
   - Expected Impact: ${imp.expectedImpact}`
      )
      .join("\n\n");

    const userPrompt = `Here is the current negotiation prompt:

---
${currentPrompt}
---

Apply these improvements to create an updated prompt:

${improvementsList}

Generate the complete updated prompt with all improvements integrated naturally. Remember this is for a voice bot making phone calls.`;

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const newPrompt =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    // Clean up any markdown formatting that might have slipped in
    const cleanedPrompt = newPrompt
      .replace(/^```[\w]*\n?/gm, "")
      .replace(/\n?```$/gm, "")
      .trim();

    return NextResponse.json({
      success: true,
      newPrompt: cleanedPrompt,
      improvementsApplied: improvements.length,
    });
  } catch (error) {
    console.error("Generate prompt error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate prompt" },
      { status: 500 }
    );
  }
}
