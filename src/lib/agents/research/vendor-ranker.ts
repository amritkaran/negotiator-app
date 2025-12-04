import { ChatOpenAI } from "@langchain/openai";
import {
  NegotiatorGraphState,
  VendorRankingResult,
  RankedVendor,
  ReviewAnalysisResult,
  PriceIntelResult,
  createAgentEvent
} from "../types";
import { Business } from "@/types";

// Calculate proximity score (0-100)
function calculateProximityScore(distanceKm: number): number {
  if (distanceKm <= 1) return 100;
  if (distanceKm <= 2) return 90;
  if (distanceKm <= 3) return 80;
  if (distanceKm <= 5) return 70;
  if (distanceKm <= 10) return 50;
  if (distanceKm <= 15) return 30;
  return 10;
}

// Calculate rating score (0-100)
function calculateRatingScore(rating: number, reviewCount: number): number {
  // Weight rating by review count for reliability
  const reviewWeight = Math.min(reviewCount / 50, 1); // Max weight at 50+ reviews
  const adjustedRating = rating * reviewWeight + 3 * (1 - reviewWeight); // Regress to mean (3) for low reviews

  return Math.round((adjustedRating / 5) * 100);
}

// Calculate professionalism score from review analysis
function calculateProfessionalismScore(
  professionalism: "high" | "medium" | "low",
  redFlags: string[]
): number {
  let score = professionalism === "high" ? 100 : professionalism === "medium" ? 70 : 40;

  // Deduct for red flags
  score -= redFlags.length * 10;

  return Math.max(0, score);
}

// Calculate price score (favor cheaper perceived businesses)
function calculatePriceScore(
  pricePerception: "cheap" | "fair" | "expensive" | "unknown"
): number {
  switch (pricePerception) {
    case "cheap": return 100;
    case "fair": return 75;
    case "expensive": return 40;
    default: return 60;
  }
}

// Generate negotiation strategy based on analysis
async function generateNegotiationStrategy(
  business: Business,
  reviewAnalysis: ReviewAnalysisResult | undefined,
  priceIntel: PriceIntelResult | null | undefined,
  ranking: number
): Promise<{
  strategy: string;
  estimatedPriceRange: { low: number; high: number };
  strengths: string[];
  weaknesses: string[];
}> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.3,
  });

  const prompt = `Based on this vendor analysis, generate a negotiation strategy:

Vendor: ${business.name}
Ranking: #${ranking} out of candidates
Rating: ${reviewAnalysis?.rating || business.rating}★ (${reviewAnalysis?.reviewCount || business.reviewCount} reviews)
Distance: ${business.distance} km
Professionalism: ${reviewAnalysis?.professionalism || "unknown"}
Price Perception: ${reviewAnalysis?.pricePerception || "unknown"}
Negotiation Leverage: ${reviewAnalysis?.negotiationLeverage?.join(", ") || "None identified"}
Red Flags: ${reviewAnalysis?.redFlags?.join(", ") || "None"}
Positives: ${reviewAnalysis?.positives?.join(", ") || "None"}

Baseline Price Range: ₹${priceIntel?.baselinePrice?.low || "?"} - ₹${priceIntel?.baselinePrice?.high || "?"}

Generate:
1. A specific negotiation strategy (2-3 sentences in Kannada context)
2. Estimated price range we can negotiate to for this vendor
3. Key strengths to acknowledge
4. Weaknesses to leverage

Respond in JSON:
{
  "strategy": "strategy text",
  "estimatedLow": number,
  "estimatedHigh": number,
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"]
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
        strategy: result.strategy || "Standard negotiation approach - ask for best price.",
        estimatedPriceRange: {
          low: result.estimatedLow || priceIntel?.baselinePrice?.low || 0,
          high: result.estimatedHigh || priceIntel?.baselinePrice?.mid || 0,
        },
        strengths: result.strengths || [],
        weaknesses: result.weaknesses || [],
      };
    }
  } catch (error) {
    console.error("Strategy generation error:", error);
  }

  // Default strategy
  return {
    strategy: "Start with asking their best price, then negotiate down based on benchmark.",
    estimatedPriceRange: {
      low: priceIntel?.baselinePrice?.low || 0,
      high: priceIntel?.baselinePrice?.mid || 0,
    },
    strengths: [],
    weaknesses: [],
  };
}

// Main Vendor Ranker Agent function
export async function vendorRankerAgent(
  state: NegotiatorGraphState
): Promise<Partial<NegotiatorGraphState>> {
  const events = [
    createAgentEvent(
      "sub_agent_started",
      "research.vendor_ranker",
      `Ranking ${state.businesses.length} vendors based on research...`
    ),
  ];

  if (state.businesses.length === 0) {
    events.push(
      createAgentEvent(
        "agent_error",
        "research.vendor_ranker",
        "No businesses to rank"
      )
    );
    return {
      agentEvents: events,
      errors: [
        {
          agent: "research.vendor_ranker",
          error: "No businesses to rank",
          timestamp: new Date(),
          recoverable: true,
        },
      ],
    };
  }

  const reviewAnalysisMap = new Map(
    (state.research?.reviewAnalysis || []).map((r) => [r.businessId, r])
  );
  const priceIntel = state.research?.priceIntel;

  // Score each vendor
  const scoredVendors = state.businesses.map((business) => {
    const reviewAnalysis = reviewAnalysisMap.get(business.id);

    // Calculate component scores
    const proximityScore = calculateProximityScore(business.distance);
    const ratingScore = calculateRatingScore(
      reviewAnalysis?.rating || business.rating,
      reviewAnalysis?.reviewCount || business.reviewCount
    );
    const professionalismScore = calculateProfessionalismScore(
      reviewAnalysis?.professionalism || "medium",
      reviewAnalysis?.redFlags || []
    );
    const priceScore = calculatePriceScore(
      reviewAnalysis?.pricePerception || "unknown"
    );

    // Weighted total score
    // Weights: Proximity 20%, Rating 25%, Professionalism 30%, Price 25%
    const totalScore = Math.round(
      proximityScore * 0.20 +
      ratingScore * 0.25 +
      professionalismScore * 0.30 +
      priceScore * 0.25
    );

    return {
      business,
      reviewAnalysis,
      proximityScore,
      ratingScore,
      professionalismScore,
      priceScore,
      totalScore,
    };
  });

  // Sort by total score (descending)
  scoredVendors.sort((a, b) => b.totalScore - a.totalScore);

  events.push(
    createAgentEvent(
      "sub_agent_started",
      "research.vendor_ranker",
      "Generating negotiation strategies for top vendors..."
    )
  );

  // Generate strategies for top vendors
  const rankedVendors: RankedVendor[] = [];

  for (let i = 0; i < scoredVendors.length; i++) {
    const vendor = scoredVendors[i];
    const ranking = i + 1;

    const strategyResult = await generateNegotiationStrategy(
      vendor.business,
      vendor.reviewAnalysis,
      priceIntel,
      ranking
    );

    rankedVendors.push({
      business: vendor.business,
      score: vendor.totalScore,
      ranking,
      strengths: strategyResult.strengths,
      weaknesses: strategyResult.weaknesses,
      negotiationStrategy: strategyResult.strategy,
      estimatedPriceRange: strategyResult.estimatedPriceRange,
    });

    events.push(
      createAgentEvent(
        "sub_agent_completed",
        "research.vendor_ranker",
        `#${ranking} ${vendor.business.name} (Score: ${vendor.totalScore}) - ${strategyResult.strategy.substring(0, 100)}...`,
        {
          ranking,
          businessName: vendor.business.name,
          score: vendor.totalScore,
          breakdown: {
            proximity: vendor.proximityScore,
            rating: vendor.ratingScore,
            professionalism: vendor.professionalismScore,
            price: vendor.priceScore,
          },
        }
      )
    );
  }

  const vendorRanking: VendorRankingResult = {
    rankedVendors,
    rankingCriteria: [
      "Proximity (20%)",
      "Rating & Reviews (25%)",
      "Professionalism (30%)",
      "Price Perception (25%)",
    ],
  };

  events.push(
    createAgentEvent(
      "sub_agent_completed",
      "research.vendor_ranker",
      `Vendor ranking complete. Top choice: ${rankedVendors[0]?.business.name} (Score: ${rankedVendors[0]?.score})`,
      {
        topVendor: rankedVendors[0]?.business.name,
        topScore: rankedVendors[0]?.score,
        totalRanked: rankedVendors.length,
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
      vendorRanking,
      completedAt: new Date(),
    },
  };
}
