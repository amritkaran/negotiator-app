import { ChatOpenAI } from "@langchain/openai";
import {
  NegotiatorGraphState,
  ReviewAnalysisResult,
  createAgentEvent
} from "../types";
import { Business } from "@/types";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface GoogleReview {
  author_name: string;
  rating: number;
  text: string;
  time: number;
  relative_time_description: string;
}

interface PlaceDetailsResult {
  reviews?: GoogleReview[];
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: {
    open_now?: boolean;
    weekday_text?: string[];
  };
}

// Fetch reviews from Google Places API
async function fetchGoogleReviews(placeId: string): Promise<PlaceDetailsResult | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total,opening_hours&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" || !data.result) {
      console.error("Place details error:", data.status);
      return null;
    }

    return data.result;
  } catch (error) {
    console.error("Fetch reviews error:", error);
    return null;
  }
}

// Analyze reviews using LLM
async function analyzeReviewsWithLLM(
  businessName: string,
  reviews: GoogleReview[],
  rating: number,
  reviewCount: number
): Promise<Omit<ReviewAnalysisResult, "businessId" | "businessName" | "rating" | "reviewCount">> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.3,
  });

  const reviewTexts = reviews
    .slice(0, 10)
    .map((r, i) => `Review ${i + 1} (${r.rating}★): "${r.text}"`)
    .join("\n\n");

  const prompt = `Analyze these Google reviews for "${businessName}" (Overall: ${rating}★, ${reviewCount} reviews) to help with price negotiation:

${reviewTexts}

Analyze and provide:
1. Overall sentiment
2. How customers perceive their pricing (cheap, fair, expensive, unknown)
3. Professionalism level based on reviews
4. Any red flags (safety, reliability, behavior issues)
5. Positive points that indicate good service
6. Negotiation leverage points (e.g., "reviews mention flexible pricing", "they give discounts for regular customers")
7. 2-3 most relevant sample review excerpts

Respond in JSON format:
{
  "sentiment": "positive" | "neutral" | "negative",
  "pricePerception": "cheap" | "fair" | "expensive" | "unknown",
  "professionalism": "high" | "medium" | "low",
  "redFlags": ["flag1", "flag2"],
  "positives": ["positive1", "positive2"],
  "negotiationLeverage": ["leverage1", "leverage2"],
  "sampleReviews": ["excerpt1", "excerpt2"]
}`;

  try {
    const response = await model.invoke(prompt);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        sentiment: result.sentiment || "neutral",
        pricePerception: result.pricePerception || "unknown",
        professionalism: result.professionalism || "medium",
        redFlags: result.redFlags || [],
        positives: result.positives || [],
        negotiationLeverage: result.negotiationLeverage || [],
        sampleReviews: result.sampleReviews || [],
      };
    }
  } catch (error) {
    console.error("LLM review analysis error:", error);
  }

  // Default response if LLM fails
  return {
    sentiment: rating >= 4 ? "positive" : rating >= 3 ? "neutral" : "negative",
    pricePerception: "unknown",
    professionalism: rating >= 4 ? "high" : rating >= 3 ? "medium" : "low",
    redFlags: [],
    positives: [],
    negotiationLeverage: [],
    sampleReviews: [],
  };
}

// Analyze a single business
async function analyzeBusinessReviews(
  business: Business
): Promise<ReviewAnalysisResult> {
  // Fetch reviews from Google
  const placeDetails = business.placeId
    ? await fetchGoogleReviews(business.placeId)
    : null;

  const reviews = placeDetails?.reviews || [];
  const rating = placeDetails?.rating || business.rating || 0;
  const reviewCount = placeDetails?.user_ratings_total || business.reviewCount || 0;

  // If we have reviews, analyze them with LLM
  let analysis: Omit<ReviewAnalysisResult, "businessId" | "businessName" | "rating" | "reviewCount">;

  if (reviews.length > 0) {
    analysis = await analyzeReviewsWithLLM(business.name, reviews, rating, reviewCount);
  } else {
    // No reviews available - provide basic analysis based on rating
    analysis = {
      sentiment: rating >= 4 ? "positive" : rating >= 3 ? "neutral" : "negative",
      pricePerception: "unknown",
      professionalism: "medium",
      redFlags: reviewCount === 0 ? ["No reviews available - new or unverified business"] : [],
      positives: rating >= 4 ? ["Good overall rating"] : [],
      negotiationLeverage: [],
      sampleReviews: [],
    };
  }

  return {
    businessId: business.id,
    businessName: business.name,
    rating,
    reviewCount,
    ...analysis,
  };
}

// Main Review Analyzer Agent function
export async function reviewAnalyzerAgent(
  state: NegotiatorGraphState
): Promise<Partial<NegotiatorGraphState>> {
  const events = [
    createAgentEvent(
      "sub_agent_started",
      "research.review_analyzer",
      `Analyzing reviews for ${state.businesses.length} vendors...`
    ),
  ];

  if (state.businesses.length === 0) {
    events.push(
      createAgentEvent(
        "agent_error",
        "research.review_analyzer",
        "No businesses to analyze"
      )
    );
    return {
      agentEvents: events,
      errors: [
        {
          agent: "research.review_analyzer",
          error: "No businesses to analyze",
          timestamp: new Date(),
          recoverable: true,
        },
      ],
    };
  }

  const reviewAnalyses: ReviewAnalysisResult[] = [];

  // Analyze each business
  for (let i = 0; i < state.businesses.length; i++) {
    const business = state.businesses[i];

    events.push(
      createAgentEvent(
        "sub_agent_started",
        "research.review_analyzer",
        `Analyzing reviews for ${business.name} (${i + 1}/${state.businesses.length})...`
      )
    );

    try {
      const analysis = await analyzeBusinessReviews(business);
      reviewAnalyses.push(analysis);

      const leverageText = analysis.negotiationLeverage.length > 0
        ? ` Leverage: ${analysis.negotiationLeverage[0]}`
        : "";

      events.push(
        createAgentEvent(
          "sub_agent_completed",
          "research.review_analyzer",
          `${business.name}: ${analysis.sentiment} sentiment, ${analysis.pricePerception} pricing, ${analysis.professionalism} professionalism.${leverageText}`,
          { analysis }
        )
      );
    } catch (error) {
      console.error(`Error analyzing ${business.name}:`, error);
      events.push(
        createAgentEvent(
          "agent_error",
          "research.review_analyzer",
          `Failed to analyze ${business.name}: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  }

  events.push(
    createAgentEvent(
      "sub_agent_completed",
      "research.review_analyzer",
      `Review analysis complete for ${reviewAnalyses.length} vendors`,
      {
        summary: {
          analyzed: reviewAnalyses.length,
          withLeverage: reviewAnalyses.filter(r => r.negotiationLeverage.length > 0).length,
          highProfessionalism: reviewAnalyses.filter(r => r.professionalism === "high").length,
        }
      }
    )
  );

  // Update research state
  const updatedResearch = state.research || {
    priceIntel: null,
    reviewAnalysis: [],
    vendorRanking: null,
    completedAt: new Date(),
  };

  return {
    agentEvents: events,
    research: {
      ...updatedResearch,
      reviewAnalysis: reviewAnalyses,
    },
  };
}
