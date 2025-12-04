import { NextRequest } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { searchNearbyBusinesses, geocodeAddress, getDistanceMatrix, rankBusinesses } from "@/lib/google-maps";
import { Business, UserRequirement } from "@/types";
import { logResearch, logError } from "@/lib/session-logger";

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// Search real prices using Perplexity
async function searchRealPricesWithPerplexity(
  origin: string,
  destination: string,
  service: string,
  vehicleType: string | undefined
): Promise<{ low: number; mid: number; high: number; sources: string[] } | null> {
  console.log("[research-stream] Searching Perplexity for real prices...");
  console.log("[research-stream] Perplexity API Key:", PERPLEXITY_API_KEY ? "configured" : "NOT SET");

  if (!PERPLEXITY_API_KEY) {
    console.log("[research-stream] Perplexity API key not configured");
    return null;
  }

  const vehicleInfo = vehicleType ? ` ${vehicleType}` : "";
  const searchQuery = `${service}${vehicleInfo} fare price from ${origin} to ${destination} India current rates 2024 2025`;

  console.log("[research-stream] Perplexity search query:", searchQuery);

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "You are a price research assistant for India. Search for current real market prices. IMPORTANT: First determine the actual distance between locations, then find appropriate cab fares. Respond ONLY in valid JSON format."
          },
          {
            role: "user",
            content: `Search for current cab/taxi fares from ${origin} to ${destination} in India.
Vehicle type: ${vehicleType || "sedan/hatchback"}

IMPORTANT STEPS:
1. First, determine what city/area "${origin}" is located in
2. Then find the distance from ${origin} to ${destination}
3. Search for cab fares for that route from Ola, Uber, MakeMyTrip, local taxi services
4. If "${origin}" is a locality/area name, search for fares from that city to ${destination}

Find real prices from Ola, Uber, local taxi services, or recent user experiences.

Respond ONLY with this JSON:
{
  "low": (lowest realistic price in INR as number),
  "mid": (average price in INR as number),
  "high": (highest typical price in INR as number),
  "distance_km": (estimated distance in km),
  "sources": ["source1", "source2"],
  "notes": "include the city/area of origin and any important notes"
}`
          }
        ],
        temperature: 0.2,
        max_tokens: 600
      }),
    });

    if (!response.ok) {
      console.error("[research-stream] Perplexity API error:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log("[research-stream] Perplexity raw response:", content?.substring(0, 200));

    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log("[research-stream] Perplexity parsed result:", result);
      return {
        low: result.low || 0,
        mid: result.mid || 0,
        high: result.high || 0,
        sources: result.sources || ["Web search"],
      };
    }
  } catch (error) {
    console.error("[research-stream] Perplexity error:", error);
  }

  return null;
}

// Helper to send SSE events
function sendEvent(
  controller: ReadableStreamDefaultController,
  type: string,
  data: Record<string, unknown>
) {
  const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
  controller.enqueue(new TextEncoder().encode(event));
}

// Research step types
type ResearchStep = {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "error";
  result?: string;
  details?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const { requirements, sessionId } = await request.json();

  console.log(`[research-stream] Starting research for session ${sessionId}`);
  console.log(`[research-stream] Preferred vendors:`, requirements.preferredVendors);

  if (!requirements?.from || !requirements?.service) {
    return new Response(
      JSON.stringify({ error: "Missing location or service type" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const steps: ResearchStep[] = [
        {
          id: "plan",
          title: "Creating Research Plan",
          description: "Analyzing your requirements and planning research strategy",
          status: "pending",
        },
        {
          id: "geocode",
          title: "Locating Your Area",
          description: "Finding exact coordinates for your location",
          status: "pending",
        },
        {
          id: "search",
          title: "Searching Service Providers",
          description: "Finding businesses in your area",
          status: "pending",
        },
        {
          id: "price_intel",
          title: "Price Intelligence",
          description: "Calculating expected price range for your trip",
          status: "pending",
        },
        {
          id: "review_analysis",
          title: "Review Analysis",
          description: "Analyzing vendor reviews for reliability and quality",
          status: "pending",
        },
        {
          id: "ranking",
          title: "Vendor Ranking",
          description: "Ranking vendors based on multiple factors",
          status: "pending",
        },
        {
          id: "strategy",
          title: "Negotiation Strategy",
          description: "Preparing negotiation approach for each vendor",
          status: "pending",
        },
      ];

      // Send initial steps
      sendEvent(controller, "steps", { steps });

      try {
        // Step 1: Create Research Plan
        steps[0].status = "running";
        sendEvent(controller, "step_update", { step: steps[0] });

        const model = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0.3 });
        const planPrompt = `You are a research analyst helping find service providers.

User needs: ${requirements.service}
From: ${requirements.from}
To: ${requirements.to || "Not specified"}
Date: ${requirements.date || "Not specified"}
Time: ${requirements.time || "Not specified"}
Passengers: ${requirements.passengers || "Not specified"}
Vehicle Type: ${requirements.vehicleType || "Any"}

Create a brief research plan in 3-4 bullet points explaining:
1. What factors matter most for this service type
2. What price range we should expect
3. What to look for in reviews
4. How we'll rank vendors

Keep it concise (under 100 words).`;

        const planResponse = await model.invoke(planPrompt);
        const plan = typeof planResponse.content === "string"
          ? planResponse.content
          : JSON.stringify(planResponse.content);

        steps[0].status = "completed";
        steps[0].result = plan;
        sendEvent(controller, "step_update", { step: steps[0] });
        sendEvent(controller, "plan", { plan });

        // Step 2: Geocode location
        steps[1].status = "running";
        sendEvent(controller, "step_update", { step: steps[1] });

        const coordinates = await geocodeAddress(requirements.from);
        if (!coordinates) {
          throw new Error(`Could not find location: ${requirements.from}`);
        }

        steps[1].status = "completed";
        steps[1].result = `Found: ${requirements.from} (${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)})`;
        sendEvent(controller, "step_update", { step: steps[1] });

        // Step 3: Search for businesses
        steps[2].status = "running";
        steps[2].description = "Searching within 5km radius...";
        sendEvent(controller, "step_update", { step: steps[2] });

        const allBusinesses = await searchNearbyBusinesses(
          requirements.service,
          coordinates,
          5 // 5km radius
        );

        if (allBusinesses.length === 0) {
          steps[2].status = "error";
          steps[2].result = "No service providers found in your area";
          sendEvent(controller, "step_update", { step: steps[2] });
          sendEvent(controller, "error", { message: "No providers found" });
          controller.close();
          return;
        }

        steps[2].status = "completed";
        steps[2].result = `Found ${allBusinesses.length} service providers`;
        steps[2].details = { count: allBusinesses.length };
        sendEvent(controller, "step_update", { step: steps[2] });
        sendEvent(controller, "businesses_found", {
          count: allBusinesses.length,
          businesses: allBusinesses.slice(0, 10) // Send top 10 for display
        });

        // Step 4: Price Intelligence
        steps[3].status = "running";
        sendEvent(controller, "step_update", { step: steps[3] });

        let priceIntel: {
          estimatedDistance: number;
          estimatedDuration: number;
          baselinePrice: { low: number; mid: number; high: number };
          factors: string[];
          confidence: "high" | "medium" | "low";
        } = {
          estimatedDistance: 0,
          estimatedDuration: 0,
          baselinePrice: { low: 0, mid: 0, high: 0 },
          factors: [],
          confidence: "medium",
        };

        if (requirements.to) {
          try {
            const destCoords = await geocodeAddress(requirements.to);
            if (destCoords) {
              const distanceData = await getDistanceMatrix(
                `${coordinates.lat},${coordinates.lng}`,
                `${destCoords.lat},${destCoords.lng}`
              );

              if (distanceData) {
                priceIntel.estimatedDistance = distanceData.distance;
                priceIntel.estimatedDuration = distanceData.duration;

                // Calculate price based on service type and distance
                let baseRate = 15; // Rs per km
                let minimumFare = 100;

                if (requirements.service.toLowerCase().includes("cab") ||
                    requirements.service.toLowerCase().includes("taxi")) {
                  if (requirements.vehicleType?.toLowerCase().includes("suv")) {
                    baseRate = 20;
                    minimumFare = 150;
                  } else if (requirements.vehicleType?.toLowerCase().includes("sedan")) {
                    baseRate = 18;
                    minimumFare = 120;
                  } else if (requirements.vehicleType?.toLowerCase().includes("auto")) {
                    baseRate = 12;
                    minimumFare = 50;
                  }
                }

                const distancePrice = distanceData.distance * baseRate;
                const timeComponent = (distanceData.duration / 60) * 2; // Rs 2 per minute waiting

                priceIntel.baselinePrice = {
                  low: Math.max(minimumFare, Math.round((distancePrice + timeComponent) * 0.8)),
                  mid: Math.max(minimumFare, Math.round(distancePrice + timeComponent)),
                  high: Math.max(minimumFare, Math.round((distancePrice + timeComponent) * 1.3)),
                };

                priceIntel.factors = [
                  `Distance: ${distanceData.distance.toFixed(1)} km`,
                  `Estimated time: ${Math.round(distanceData.duration)} mins`,
                  `Base rate: ₹${baseRate}/km`,
                  requirements.time?.includes("morning") || requirements.time?.includes("6") || requirements.time?.includes("7")
                    ? "Early morning premium may apply (+10-15%)"
                    : "",
                  requirements.date && (requirements.date.includes("Sunday") || requirements.date.includes("holiday"))
                    ? "Weekend/holiday rates may be higher"
                    : "",
                ].filter(Boolean);

                priceIntel.confidence = "high";
              }
            }
          } catch (error) {
            console.error("Distance calculation error:", error);
          }
        }

        // If distance matrix failed, use Perplexity for real market prices
        if (priceIntel.baselinePrice.mid === 0 && requirements.to) {
          console.log("[research-stream] Distance matrix failed, using Perplexity for price research...");

          // Try Perplexity first for real market data
          const perplexityResult = await searchRealPricesWithPerplexity(
            requirements.from,
            requirements.to,
            requirements.service,
            requirements.vehicleType
          );

          if (perplexityResult && perplexityResult.mid > 0) {
            priceIntel.baselinePrice = {
              low: perplexityResult.low,
              mid: perplexityResult.mid,
              high: perplexityResult.high,
            };
            priceIntel.factors = [
              "Real-time web search data",
              ...perplexityResult.sources,
            ];
            priceIntel.confidence = "high";
            console.log("[research-stream] Using Perplexity prices:", priceIntel.baselinePrice);
          } else {
            // Fallback to reasonable estimates based on typical India cab rates
            // Ambala to Patiala is about 75-80 km, typical rate is ₹10-15/km for SUV
            console.log("[research-stream] Perplexity failed, using fallback estimates");
            priceIntel.baselinePrice = { low: 800, mid: 1200, high: 1800 };
            priceIntel.factors = ["Estimated based on typical intercity rates (₹10-15/km)"];
            priceIntel.confidence = "low";
          }
        } else if (priceIntel.baselinePrice.mid === 0) {
          // No destination - local service
          priceIntel.baselinePrice = { low: 300, mid: 500, high: 800 };
          priceIntel.factors = ["Estimated based on typical local rates"];
          priceIntel.confidence = "low";
        }

        steps[3].status = "completed";
        steps[3].result = `Expected price: ₹${priceIntel.baselinePrice.low} - ₹${priceIntel.baselinePrice.high}`;
        steps[3].details = priceIntel;
        sendEvent(controller, "step_update", { step: steps[3] });
        sendEvent(controller, "price_intel", { priceIntel });

        // Step 5: Review Analysis
        steps[4].status = "running";
        sendEvent(controller, "step_update", { step: steps[4] });

        const reviewAnalyses: Array<{
          businessId: string;
          businessName: string;
          sentiment: string;
          pricePerception: string;
          professionalism: string;
          keyInsights: string[];
          score: number;
        }> = [];

        // Analyze top 5 businesses (prioritize preferred vendors if specified)
        const topBusinesses = await rankBusinesses(
          allBusinesses,
          5,
          requirements.preferredVendors
        );

        for (const business of topBusinesses) {
          sendEvent(controller, "analyzing_vendor", {
            businessId: business.id,
            businessName: business.name
          });

          const reviewPrompt = `Analyze this service provider for a customer:
Business: ${business.name}
Rating: ${business.rating}★ (${business.reviewCount} reviews)
Distance: ${business.distance}km
Types: ${business.types.join(", ")}

Based on the rating and review count, assess:
1. Sentiment (positive/neutral/negative)
2. Price perception (cheap/fair/expensive/unknown)
3. Professionalism (high/medium/low)
4. Key insights (2-3 bullet points)
5. Overall score out of 100

Respond ONLY with JSON: {"sentiment": "", "pricePerception": "", "professionalism": "", "keyInsights": [], "score": number}`;

          try {
            const reviewResponse = await model.invoke(reviewPrompt);
            const reviewContent = typeof reviewResponse.content === "string"
              ? reviewResponse.content
              : JSON.stringify(reviewResponse.content);

            const jsonMatch = reviewContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const analysis = JSON.parse(jsonMatch[0]);
              reviewAnalyses.push({
                businessId: business.id,
                businessName: business.name,
                ...analysis,
              });
            }
          } catch {
            reviewAnalyses.push({
              businessId: business.id,
              businessName: business.name,
              sentiment: business.rating >= 4 ? "positive" : business.rating >= 3 ? "neutral" : "negative",
              pricePerception: "unknown",
              professionalism: business.rating >= 4 ? "high" : "medium",
              keyInsights: [`${business.rating}★ rating`, `${business.reviewCount} reviews`],
              score: Math.round(business.rating * 20),
            });
          }
        }

        steps[4].status = "completed";
        steps[4].result = `Analyzed ${reviewAnalyses.length} vendors`;
        sendEvent(controller, "step_update", { step: steps[4] });
        sendEvent(controller, "review_analysis", { analyses: reviewAnalyses });

        // Step 6: Ranking
        steps[5].status = "running";
        sendEvent(controller, "step_update", { step: steps[5] });

        // Check if vendor is a preferred vendor
        const preferredLower = (requirements.preferredVendors || []).map((v: string) => v.toLowerCase());
        console.log(`[research-stream] Ranking with preferredVendors:`, preferredLower);
        console.log(`[research-stream] Business names to check:`, topBusinesses.map(b => b.name));

        const isPreferredVendor = (name: string) => {
          if (preferredLower.length === 0) return false;
          const nameLower = name.toLowerCase();
          // Normalize spaces for comparison (handle "A K" vs "AK" variations)
          const nameNormalized = nameLower.replace(/\s+/g, '');

          const isMatch = preferredLower.some((pv: string) => {
            const pvNormalized = pv.replace(/\s+/g, '');
            // Check multiple matching strategies:
            // 1. Direct inclusion
            // 2. Normalized (no spaces) inclusion
            // 3. First word match
            return nameLower.includes(pv) ||
                   pv.includes(nameLower.split(" ")[0]) ||
                   nameNormalized.includes(pvNormalized) ||
                   pvNormalized.includes(nameNormalized.split(/\s+/)[0]);
          });

          console.log(`[research-stream] Checking "${name}" against preferred vendors: ${isMatch ? 'MATCH' : 'no match'}`);
          return isMatch;
        };

        const rankedVendors = topBusinesses.map((business, idx) => {
          const analysis = reviewAnalyses.find(a => a.businessId === business.id);
          const isPreferred = isPreferredVendor(business.name);

          // Calculate scores
          const proximityScore = Math.max(0, 100 - (business.distance * 15));
          const ratingScore = (business.rating / 5) * 100;
          const reviewScore = Math.min(100, (business.reviewCount / 50) * 100);
          const analysisScore = analysis?.score || 50;

          // Preferred vendors get a HUGE boost to ensure they ALWAYS appear first
          const preferredBonus = isPreferred ? 1000 : 0;

          // Weighted total
          const totalScore = Math.round(
            proximityScore * 0.25 +
            ratingScore * 0.30 +
            reviewScore * 0.15 +
            analysisScore * 0.30 +
            preferredBonus
          );

          return {
            business,
            analysis,
            isPreferred,
            scores: {
              proximity: Math.round(proximityScore),
              rating: Math.round(ratingScore),
              reviews: Math.round(reviewScore),
              analysis: analysisScore,
              preferred: preferredBonus,
              total: totalScore,
            },
            ranking: 0,
            reasoning: "",
          };
        });

        // Sort by total score (preferred vendors will rank higher due to bonus)
        rankedVendors.sort((a, b) => b.scores.total - a.scores.total);

        // Add ranking and reasoning
        rankedVendors.forEach((vendor, idx) => {
          vendor.ranking = idx + 1;

          const reasons = [];

          // Preferred vendor gets highlighted first
          if (vendor.isPreferred) reasons.push("⭐ Your preferred vendor");

          if (vendor.scores.proximity >= 80) reasons.push("Very close to you");
          else if (vendor.scores.proximity >= 60) reasons.push("Reasonably close");

          if (vendor.scores.rating >= 80) reasons.push("Excellent ratings");
          else if (vendor.scores.rating >= 60) reasons.push("Good ratings");

          if (vendor.scores.reviews >= 60) reasons.push("Many reviews (reliable)");

          if (vendor.analysis?.professionalism === "high") reasons.push("Professional service");
          if (vendor.analysis?.pricePerception === "cheap") reasons.push("Known for good prices");
          if (vendor.analysis?.pricePerception === "fair") reasons.push("Fair pricing");

          vendor.reasoning = reasons.join(" • ") || "Good overall score";
        });

        steps[5].status = "completed";
        steps[5].result = `Ranked ${rankedVendors.length} vendors`;
        sendEvent(controller, "step_update", { step: steps[5] });
        sendEvent(controller, "ranking", {
          vendors: rankedVendors.map(v => ({
            ...v.business,
            ranking: v.ranking,
            scores: v.scores,
            reasoning: v.reasoning,
            analysis: v.analysis,
            isPreferred: v.isPreferred,
          }))
        });

        // Step 7: Negotiation Strategy
        steps[6].status = "running";
        sendEvent(controller, "step_update", { step: steps[6] });

        const strategies: Array<{
          businessId: string;
          strategy: string;
          targetPrice: number;
          openingOffer: number;
        }> = [];

        for (const vendor of rankedVendors.slice(0, 3)) {
          // Fair pricing: target market mid-point, not below-market rates
          const targetPrice = Math.round(priceIntel.baselinePrice.mid);
          const openingOffer = Math.round(priceIntel.baselinePrice.mid * 0.9);
          const maxAcceptable = Math.round(priceIntel.baselinePrice.high);

          let strategy = "";
          if (vendor.analysis?.pricePerception === "cheap") {
            strategy = `${vendor.business.name} is known for good prices. Ask for their best rate - if it's around ₹${targetPrice}, that's a fair deal.`;
          } else if (vendor.analysis?.pricePerception === "expensive") {
            strategy = `${vendor.business.name} may quote higher. If above ₹${maxAcceptable}, politely mention your budget is around ₹${targetPrice}.`;
          } else {
            strategy = `Ask ${vendor.business.name} for their best price. If around ₹${targetPrice}, accept. If higher, ask if they can do around ₹${openingOffer}.`;
          }

          strategies.push({
            businessId: vendor.business.id,
            strategy,
            targetPrice,
            openingOffer,
          });
        }

        steps[6].status = "completed";
        steps[6].result = "Strategies ready for top 3 vendors";
        sendEvent(controller, "step_update", { step: steps[6] });
        sendEvent(controller, "strategies", { strategies });

        // Final result
        sendEvent(controller, "complete", {
          businesses: rankedVendors.map(v => ({
            ...v.business,
            ranking: v.ranking,
            scores: v.scores,
            reasoning: v.reasoning,
            analysis: v.analysis,
            isPreferred: v.isPreferred,
          })),
          priceIntel,
          strategies,
          summary: {
            totalFound: allBusinesses.length,
            analyzed: rankedVendors.length,
            expectedPrice: `₹${priceIntel.baselinePrice.low} - ₹${priceIntel.baselinePrice.high}`,
            topRecommendation: rankedVendors[0]?.business.name,
            topScore: rankedVendors[0]?.scores.total,
          },
        });

        // Log research completion
        const duration = Date.now() - startTime;
        console.log(`[research-stream] Completed in ${duration}ms`);
        try {
          await logResearch(sessionId, {
            businessesFound: rankedVendors.length,
            priceIntel: priceIntel.baselinePrice,
            duration,
          });
        } catch {
          // Ignore logging errors
        }

      } catch (error) {
        console.error("[research-stream] Error:", error);
        sendEvent(controller, "error", {
          message: error instanceof Error ? error.message : "Research failed"
        });

        // Log error
        try {
          await logError(sessionId, "research-stream", error instanceof Error ? error : String(error));
        } catch {
          // Ignore logging errors
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
