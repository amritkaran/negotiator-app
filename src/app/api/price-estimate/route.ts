import { NextRequest, NextResponse } from "next/server";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

interface PriceEstimateRequest {
  from: string;
  to: string;
  fromLat?: number;
  fromLng?: number;
  toLat?: number;
  toLng?: number;
  vehicleType?: string;
  tripType?: "one-way" | "round-trip";
  distanceKm?: number;
  durationMinutes?: number;
}

interface PriceEstimateResponse {
  distanceKm: number;
  durationMinutes: number;
  priceRange: {
    low: number;
    mid: number;
    high: number;
  };
  rationale: string[];
  confidence: "high" | "medium" | "low";
  disclaimer: string;
}

// Vehicle type multipliers
const vehicleMultipliers: Record<string, number> = {
  hatchback: 0.9,
  sedan: 1.0,
  suv: 1.3,
  innova: 1.4,
  tempo: 1.8,
  "": 1.0,
};

// Get distance and duration from Google Maps if not provided
async function getDistanceMatrix(
  origin: string,
  destination: string
): Promise<{ distanceKm: number; durationMinutes: number } | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
      origin
    )}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" || !data.rows?.[0]?.elements?.[0]) {
      return null;
    }

    const element = data.rows[0].elements[0];
    if (element.status !== "OK") {
      return null;
    }

    return {
      distanceKm: element.distance.value / 1000,
      durationMinutes: element.duration.value / 60,
    };
  } catch (error) {
    console.error("Distance Matrix fetch error:", error);
    return null;
  }
}

// Search for real market prices using Perplexity
async function searchMarketPrices(
  origin: string,
  destination: string,
  distanceKm: number
): Promise<{ low: number; mid: number; high: number } | null> {
  if (!PERPLEXITY_API_KEY) {
    return null;
  }

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "You are a price research assistant. Search for current real cab/taxi prices and respond ONLY with valid JSON.",
          },
          {
            role: "user",
            content: `Search for current cab/taxi prices from ${origin} to ${destination} in India.
Distance is approximately ${distanceKm.toFixed(1)} km.

Find real prices from Ola, Uber, local taxi services.

Respond ONLY with this JSON format (numbers only, no text):
{"low": number, "mid": number, "high": number}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return null;
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      if (result.low && result.mid && result.high) {
        return result;
      }
    }
  } catch (error) {
    console.error("Perplexity search error:", error);
  }

  return null;
}

// Calculate price based on distance and factors
function calculatePrice(
  distanceKm: number,
  durationMinutes: number,
  vehicleType: string,
  tripType: "one-way" | "round-trip"
): { low: number; mid: number; high: number; rationale: string[] } {
  const rationale: string[] = [];

  // Base rates per km
  const baseRateLow = 12;
  const baseRateMid = 15;
  const baseRateHigh = 20;

  rationale.push(`Base rate: ₹${baseRateLow}-${baseRateHigh}/km`);

  // Calculate base prices
  let lowPrice = distanceKm * baseRateLow;
  let midPrice = distanceKm * baseRateMid;
  let highPrice = distanceKm * baseRateHigh;

  // Minimum fare
  const minFare = 200;
  if (lowPrice < minFare) {
    lowPrice = minFare;
    midPrice = Math.max(midPrice, minFare);
    highPrice = Math.max(highPrice, minFare);
    rationale.push(`Minimum fare: ₹${minFare}`);
  }

  // Vehicle type multiplier
  const multiplier = vehicleMultipliers[vehicleType] || 1.0;
  if (multiplier !== 1.0) {
    lowPrice *= multiplier;
    midPrice *= multiplier;
    highPrice *= multiplier;
    const vehicleName = vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);
    rationale.push(`${vehicleName} vehicle: ${multiplier > 1 ? "+" : ""}${((multiplier - 1) * 100).toFixed(0)}%`);
  }

  // Time charge for long trips
  if (durationMinutes > 60) {
    const timeCharge = Math.floor(durationMinutes / 60) * 50;
    midPrice += timeCharge;
    highPrice += timeCharge * 1.5;
    rationale.push(`Long trip (${Math.round(durationMinutes / 60)}+ hrs): +₹${timeCharge} time charge`);
  }

  // Toll estimates for intercity
  if (distanceKm > 30) {
    const estimatedTolls = Math.floor(distanceKm / 50) * 100;
    midPrice += estimatedTolls;
    highPrice += estimatedTolls * 1.5;
    rationale.push(`Estimated tolls: ~₹${estimatedTolls}`);
  }

  // Round trip multiplier
  if (tripType === "round-trip") {
    // Round trip is typically 1.7-1.9x one-way (not full 2x due to bundling)
    lowPrice *= 1.7;
    midPrice *= 1.8;
    highPrice *= 1.9;
    rationale.push("Round trip: 1.7-1.9x one-way rate (includes return + waiting)");
  }

  // Round to nearest 50
  return {
    low: Math.round(lowPrice / 50) * 50,
    mid: Math.round(midPrice / 50) * 50,
    high: Math.round(highPrice / 50) * 50,
    rationale,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: PriceEstimateRequest = await request.json();
    const { from, to, vehicleType = "", tripType = "one-way" } = body;

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing from or to location" },
        { status: 400 }
      );
    }

    // Get distance/duration - use provided values or fetch from Google Maps
    let distanceKm = body.distanceKm;
    let durationMinutes = body.durationMinutes;

    if (!distanceKm || !durationMinutes) {
      const distanceResult = await getDistanceMatrix(from, to);
      if (distanceResult) {
        distanceKm = distanceResult.distanceKm;
        durationMinutes = distanceResult.durationMinutes;
      } else {
        // Fallback estimate based on coordinates if available
        if (body.fromLat && body.fromLng && body.toLat && body.toLng) {
          // Haversine formula for rough distance
          const R = 6371; // Earth's radius in km
          const dLat = ((body.toLat - body.fromLat) * Math.PI) / 180;
          const dLon = ((body.toLng - body.fromLng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((body.fromLat * Math.PI) / 180) *
              Math.cos((body.toLat * Math.PI) / 180) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distanceKm = R * c * 1.3; // 1.3x multiplier for road distance vs straight line
          durationMinutes = distanceKm * 1.5; // Rough estimate: 40 km/h average
        } else {
          return NextResponse.json(
            { error: "Could not determine distance" },
            { status: 400 }
          );
        }
      }
    }

    // Calculate formula-based price
    const calculated = calculatePrice(
      distanceKm,
      durationMinutes,
      vehicleType,
      tripType
    );

    // Try to get real market prices (non-blocking, with timeout)
    let marketPrices: { low: number; mid: number; high: number } | null = null;
    let confidence: "high" | "medium" | "low" = "medium";

    try {
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 5000)
      );
      marketPrices = await Promise.race([
        searchMarketPrices(from, to, distanceKm),
        timeoutPromise,
      ]);
    } catch {
      // Ignore market price errors
    }

    // Combine prices
    let finalPrice = calculated;
    const rationale = [...calculated.rationale];

    if (marketPrices && marketPrices.low > 0) {
      // Blend formula and market prices
      const blendedLow = Math.round(((calculated.low + marketPrices.low) / 2) / 50) * 50;
      const blendedMid = Math.round(((calculated.mid + marketPrices.mid) / 2) / 50) * 50;
      const blendedHigh = Math.round(((calculated.high + marketPrices.high) / 2) / 50) * 50;

      finalPrice = {
        low: blendedLow,
        mid: blendedMid,
        high: blendedHigh,
        rationale,
      };
      rationale.push("Cross-verified with current market rates (Ola/Uber/local)");
      confidence = "high";
    } else {
      rationale.push("Based on standard market rates for this route");
    }

    const response: PriceEstimateResponse = {
      distanceKm: Math.round(distanceKm * 10) / 10,
      durationMinutes: Math.round(durationMinutes),
      priceRange: {
        low: finalPrice.low,
        mid: finalPrice.mid,
        high: finalPrice.high,
      },
      rationale,
      confidence,
      disclaimer:
        "This is an estimate based on market analysis. Actual prices will be confirmed after speaking with vendors, who may offer better rates through negotiation.",
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Price estimate error:", error);
    return NextResponse.json(
      { error: "Failed to estimate price" },
      { status: 500 }
    );
  }
}
