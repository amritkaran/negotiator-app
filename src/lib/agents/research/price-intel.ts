import { ChatOpenAI } from "@langchain/openai";
import {
  NegotiatorGraphState,
  PriceIntelResult,
  createAgentEvent
} from "../types";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

interface WebSearchPriceResult {
  searchedPrices: { source: string; price: string; details: string }[];
  marketRange: { low: number; mid: number; high: number };
  confidence: "high" | "medium" | "low";
  searchQuery: string;
}

// Search for real market prices using Perplexity API
async function searchRealPrices(
  origin: string,
  destination: string,
  service: string,
  distanceKm: number
): Promise<WebSearchPriceResult | null> {
  console.log("[price-intel] Checking Perplexity API key:", PERPLEXITY_API_KEY ? "configured" : "NOT configured");

  if (!PERPLEXITY_API_KEY) {
    console.log("[price-intel] Perplexity API key not configured, skipping web search");
    return null;
  }

  const searchQuery = service.toLowerCase().includes("cab") || service.toLowerCase().includes("taxi")
    ? `${service} fare price from ${origin} to ${destination} India 2024 2025 current rates Ola Uber local taxi`
    : `${service} service charges rates price ${origin} India 2024 2025 cost per hour visit`;

  console.log("[price-intel] Searching Perplexity for:", searchQuery);

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
            content: `You are a price research assistant. Search for current real market prices and provide accurate data. Always respond in valid JSON format.`
          },
          {
            role: "user",
            content: `Search for current ${service} prices/fares from ${origin} to ${destination} in India.
Distance is approximately ${distanceKm.toFixed(1)} km.

Find real prices from:
- Ola/Uber fare estimates if it's a cab/taxi service
- Local service provider rates
- Recent user experiences and reviews mentioning prices
- Any fare calculators or official rate cards

Respond ONLY with this JSON format:
{
  "searchedPrices": [
    {"source": "source name", "price": "₹XXX-XXX", "details": "brief detail"}
  ],
  "marketRange": {"low": number, "mid": number, "high": number},
  "confidence": "high" | "medium" | "low",
  "notes": "any important notes about pricing"
}`
          }
        ],
        temperature: 0.2,
        max_tokens: 1000
      }),
    });

    if (!response.ok) {
      console.error("[price-intel] Perplexity API error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log("[price-intel] Perplexity response received, content length:", content?.length || 0);

    if (!content) {
      console.log("[price-intel] No content in Perplexity response");
      return null;
    }

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log("[price-intel] Perplexity market range:", result.marketRange);
      console.log("[price-intel] Perplexity sources found:", result.searchedPrices?.length || 0);
      return {
        searchedPrices: result.searchedPrices || [],
        marketRange: result.marketRange || { low: 0, mid: 0, high: 0 },
        confidence: result.confidence || "medium",
        searchQuery,
      };
    } else {
      console.log("[price-intel] Could not parse JSON from Perplexity response");
    }
  } catch (error) {
    console.error("[price-intel] Web search error:", error);
  }

  return null;
}

interface DistanceMatrixResult {
  distance: number; // meters
  duration: number; // seconds
  status: string;
}

// Get distance and duration from Google Maps
async function getDistanceMatrix(
  origin: string,
  destination: string
): Promise<DistanceMatrixResult | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
      origin
    )}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" || !data.rows?.[0]?.elements?.[0]) {
      console.error("Distance Matrix error:", data.status);
      return null;
    }

    const element = data.rows[0].elements[0];
    if (element.status !== "OK") {
      return null;
    }

    return {
      distance: element.distance.value,
      duration: element.duration.value,
      status: "OK",
    };
  } catch (error) {
    console.error("Distance Matrix fetch error:", error);
    return null;
  }
}

// Calculate baseline price using multiple factors
async function calculateBaselinePrice(
  distanceKm: number,
  durationMinutes: number,
  serviceType: string,
  origin: string,
  destination: string
): Promise<{
  low: number;
  mid: number;
  high: number;
  factors: string[];
}> {
  const factors: string[] = [];

  // Base rates per km for different service types (in INR)
  const baseRates: Record<string, { low: number; mid: number; high: number }> = {
    cab: { low: 12, mid: 15, high: 20 },
    taxi: { low: 12, mid: 15, high: 20 },
    "taxi service": { low: 12, mid: 15, high: 20 },
    plumber: { low: 300, mid: 500, high: 800 }, // per visit
    electrician: { low: 200, mid: 400, high: 700 },
    caterer: { low: 150, mid: 250, high: 400 }, // per plate
    carpenter: { low: 400, mid: 600, high: 1000 },
    painter: { low: 15, mid: 25, high: 40 }, // per sqft
    cleaning: { low: 1000, mid: 2000, high: 4000 },
    mover: { low: 3000, mid: 6000, high: 12000 },
    mechanic: { low: 500, mid: 1000, high: 2000 },
  };

  const serviceKey = serviceType.toLowerCase();
  const rates = baseRates[serviceKey] || baseRates["cab"];

  // For cab/taxi services, calculate based on distance
  if (serviceKey === "cab" || serviceKey === "taxi" || serviceKey === "taxi service") {
    let lowPrice = distanceKm * rates.low;
    let midPrice = distanceKm * rates.mid;
    let highPrice = distanceKm * rates.high;

    // Minimum fare
    const minFare = 150;
    lowPrice = Math.max(lowPrice, minFare);
    midPrice = Math.max(midPrice, minFare);
    highPrice = Math.max(highPrice, minFare);
    factors.push(`Base rate: ₹${rates.low}-${rates.high}/km`);

    // Time factor for long trips
    if (durationMinutes > 60) {
      const timeCharge = Math.floor(durationMinutes / 60) * 50;
      midPrice += timeCharge;
      highPrice += timeCharge * 1.5;
      factors.push(`Long trip time charge: ~₹${timeCharge}`);
    }

    // Check for likely toll routes (intercity)
    if (distanceKm > 30) {
      const estimatedTolls = Math.floor(distanceKm / 50) * 100;
      midPrice += estimatedTolls;
      highPrice += estimatedTolls * 1.5;
      factors.push(`Estimated tolls: ~₹${estimatedTolls}`);
    }

    // Night charges (we don't know time yet, but mention as factor)
    factors.push("Night charges may apply (10pm-6am): +10-20%");

    // Round to nearest 50
    return {
      low: Math.round(lowPrice / 50) * 50,
      mid: Math.round(midPrice / 50) * 50,
      high: Math.round(highPrice / 50) * 50,
      factors,
    };
  }

  // For other services, return base rates
  factors.push(`Standard service rates for ${serviceType}`);
  return {
    low: rates.low,
    mid: rates.mid,
    high: rates.high,
    factors,
  };
}

// Use LLM to enhance price estimation with local knowledge
async function enhancePriceWithLLM(
  origin: string,
  destination: string,
  service: string,
  distanceKm: number,
  calculatedPrice: { low: number; mid: number; high: number }
): Promise<{
  adjustedPrice: { low: number; mid: number; high: number };
  additionalFactors: string[];
  confidence: "high" | "medium" | "low";
}> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.3,
  });

  const prompt = `You are a local transportation and pricing expert for India, specifically Karnataka region.

Given this trip information:
- Service: ${service}
- From: ${origin}
- To: ${destination}
- Distance: ${distanceKm} km
- Initial price estimate: ₹${calculatedPrice.low} - ₹${calculatedPrice.high}

Analyze and provide:
1. Is this price range accurate for this route? Consider:
   - Local market rates
   - Route difficulty (traffic, road conditions)
   - Popular/tourist routes might be higher
   - Competition in the area

2. Any specific factors for this route?

Respond in JSON format:
{
  "adjustedLow": number,
  "adjustedMid": number,
  "adjustedHigh": number,
  "additionalFactors": ["factor1", "factor2"],
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation"
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
        adjustedPrice: {
          low: result.adjustedLow || calculatedPrice.low,
          mid: result.adjustedMid || calculatedPrice.mid,
          high: result.adjustedHigh || calculatedPrice.high,
        },
        additionalFactors: result.additionalFactors || [],
        confidence: result.confidence || "medium",
      };
    }
  } catch (error) {
    console.error("LLM price enhancement error:", error);
  }

  return {
    adjustedPrice: calculatedPrice,
    additionalFactors: [],
    confidence: "medium",
  };
}

// Combine calculated and web-searched prices for final recommendation
function combineAndComparePrices(
  calculatedPrice: { low: number; mid: number; high: number },
  webSearchResult: WebSearchPriceResult | null,
  llmEnhanced: { adjustedPrice: { low: number; mid: number; high: number }; confidence: "high" | "medium" | "low" }
): {
  finalPrice: { low: number; mid: number; high: number };
  confidence: "high" | "medium" | "low";
  comparison: string;
  sources: string[];
} {
  const sources: string[] = ["Formula-based calculation"];

  console.log("[price-intel] Combining prices:");
  console.log("[price-intel]   - Formula calculated:", calculatedPrice);
  console.log("[price-intel]   - LLM enhanced:", llmEnhanced.adjustedPrice);
  console.log("[price-intel]   - Web search result:", webSearchResult ? webSearchResult.marketRange : "NOT AVAILABLE");

  // If no web search results, use LLM-enhanced calculated price
  if (!webSearchResult || webSearchResult.marketRange.low === 0) {
    console.log("[price-intel] Using LLM-enhanced price (no web search data)");
    return {
      finalPrice: llmEnhanced.adjustedPrice,
      confidence: llmEnhanced.confidence,
      comparison: "Based on calculated estimates with LLM enhancement",
      sources,
    };
  }

  sources.push("Real-time web search (Perplexity)");
  webSearchResult.searchedPrices.forEach(p => sources.push(p.source));

  const webLow = webSearchResult.marketRange.low;
  const webMid = webSearchResult.marketRange.mid;
  const webHigh = webSearchResult.marketRange.high;
  const calcLow = calculatedPrice.low;
  const calcHigh = calculatedPrice.high;

  // Compare calculated vs web-searched prices
  const avgWebPrice = (webLow + webHigh) / 2;
  const avgCalcPrice = (calcLow + calcHigh) / 2;
  const priceDifference = Math.abs(avgWebPrice - avgCalcPrice);
  const percentDiff = (priceDifference / avgCalcPrice) * 100;

  let comparison: string;
  let finalPrice: { low: number; mid: number; high: number };
  let confidence: "high" | "medium" | "low";

  if (percentDiff < 15) {
    // Prices are similar - high confidence
    comparison = `✓ Web search confirms our estimate (within ${percentDiff.toFixed(0)}% difference)`;
    finalPrice = {
      low: Math.round(Math.min(webLow, calcLow) / 50) * 50,
      mid: Math.round(((webMid + llmEnhanced.adjustedPrice.mid) / 2) / 50) * 50,
      high: Math.round(Math.max(webHigh, calcHigh) / 50) * 50,
    };
    confidence = "high";
  } else if (webSearchResult.confidence === "high") {
    // Web search has high confidence - prefer web prices
    comparison = `⚠ Web search found different rates (${percentDiff.toFixed(0)}% difference). Using real market data.`;
    finalPrice = {
      low: Math.round(webLow / 50) * 50,
      mid: Math.round(webMid / 50) * 50,
      high: Math.round(webHigh / 50) * 50,
    };
    confidence = "high";
  } else {
    // Blend both sources
    comparison = `⚡ Blended estimate from formula and web search (${percentDiff.toFixed(0)}% variance)`;
    finalPrice = {
      low: Math.round(((webLow + calcLow) / 2) / 50) * 50,
      mid: Math.round(((webMid + llmEnhanced.adjustedPrice.mid) / 2) / 50) * 50,
      high: Math.round(((webHigh + calcHigh) / 2) / 50) * 50,
    };
    confidence = "medium";
  }

  return { finalPrice, confidence, comparison, sources };
}

// Main Price Intel Agent function
export async function priceIntelAgent(
  state: NegotiatorGraphState
): Promise<Partial<NegotiatorGraphState>> {
  console.log("\n\n========================================");
  console.log("[price-intel] PRICE INTEL AGENT STARTED");
  console.log("[price-intel] Perplexity API Key:", PERPLEXITY_API_KEY ? `${PERPLEXITY_API_KEY.substring(0, 10)}...` : "NOT SET");
  console.log("========================================\n");

  const events = [
    createAgentEvent(
      "sub_agent_started",
      "research.price_intel",
      "Starting price intelligence research...",
      { origin: state.requirements?.from, destination: state.requirements?.to }
    ),
  ];

  if (!state.requirements?.from || !state.requirements?.to) {
    events.push(
      createAgentEvent(
        "agent_error",
        "research.price_intel",
        "Missing origin or destination for price research"
      )
    );
    return {
      agentEvents: events,
      errors: [
        {
          agent: "research.price_intel",
          error: "Missing origin or destination",
          timestamp: new Date(),
          recoverable: true,
        },
      ],
    };
  }

  const origin = state.requirements.from;
  const destination = state.requirements.to;
  const service = state.requirements.service || "cab";

  // Get distance and duration from Google Maps
  events.push(
    createAgentEvent(
      "sub_agent_started",
      "research.price_intel",
      "Fetching distance and route information..."
    )
  );

  const distanceMatrix = await getDistanceMatrix(origin, destination);

  let distanceKm = 10; // default
  let durationMinutes = 30; // default

  if (distanceMatrix) {
    distanceKm = distanceMatrix.distance / 1000;
    durationMinutes = distanceMatrix.duration / 60;
    events.push(
      createAgentEvent(
        "sub_agent_completed",
        "research.price_intel",
        `Route found: ${distanceKm.toFixed(1)} km, ~${Math.round(durationMinutes)} minutes`
      )
    );
  } else {
    events.push(
      createAgentEvent(
        "sub_agent_started",
        "research.price_intel",
        "Could not fetch exact distance, using estimates..."
      )
    );
  }

  // Calculate baseline prices using formula
  const baselinePrice = await calculateBaselinePrice(
    distanceKm,
    durationMinutes,
    service,
    origin,
    destination
  );

  events.push(
    createAgentEvent(
      "sub_agent_started",
      "research.price_intel",
      `Formula estimate: ₹${baselinePrice.low} - ₹${baselinePrice.high}. Searching real market prices...`
    )
  );

  // Search for real market prices using Perplexity (run in parallel with LLM enhancement)
  const [webSearchResult, llmEnhanced] = await Promise.all([
    searchRealPrices(origin, destination, service, distanceKm),
    enhancePriceWithLLM(origin, destination, service, distanceKm, baselinePrice)
  ]);

  if (webSearchResult) {
    events.push(
      createAgentEvent(
        "sub_agent_completed",
        "research.price_intel",
        `Web search found ${webSearchResult.searchedPrices.length} price sources. Market range: ₹${webSearchResult.marketRange.low} - ₹${webSearchResult.marketRange.high}`,
        { webSearchResult }
      )
    );
  } else {
    events.push(
      createAgentEvent(
        "sub_agent_started",
        "research.price_intel",
        "Web search unavailable, using LLM-enhanced estimates..."
      )
    );
  }

  // Combine and compare all price sources
  const combined = combineAndComparePrices(baselinePrice, webSearchResult, llmEnhanced);

  const priceIntel: PriceIntelResult = {
    estimatedDistance: Math.round(distanceKm * 10) / 10,
    estimatedDuration: Math.round(durationMinutes),
    baselinePrice: combined.finalPrice,
    factors: [
      ...baselinePrice.factors,
      ...llmEnhanced.additionalFactors,
      combined.comparison,
    ],
    dataSource: webSearchResult
      ? "Google Maps + Web Search + AI Analysis"
      : distanceMatrix
        ? "Google Maps + AI Analysis"
        : "Estimated + AI Analysis",
    confidence: combined.confidence,
    webSearchSources: combined.sources,
  };

  events.push(
    createAgentEvent(
      "sub_agent_completed",
      "research.price_intel",
      `Price intelligence complete. Final range: ₹${priceIntel.baselinePrice.low} - ₹${priceIntel.baselinePrice.high} (${priceIntel.confidence} confidence). ${combined.comparison}`,
      { priceIntel }
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
      priceIntel,
    },
  };
}
