import { NextRequest, NextResponse } from "next/server";
import { searchNearbyBusinesses, rankBusinesses, geocodeAddress } from "@/lib/google-maps";

export async function POST(request: NextRequest) {
  try {
    const { service, location, radius = 5, preferredVendors } = await request.json();

    if (!service || !location) {
      return NextResponse.json(
        { error: "Service and location are required" },
        { status: 400 }
      );
    }

    // Geocode the location if it's a string
    let coordinates: { lat: number; lng: number };

    if (typeof location === "string") {
      const geocoded = await geocodeAddress(location);
      if (!geocoded) {
        return NextResponse.json(
          { error: `Could not find location: ${location}` },
          { status: 400 }
        );
      }
      coordinates = geocoded;
    } else {
      coordinates = location;
    }

    // Search for businesses
    const allBusinesses = await searchNearbyBusinesses(
      service,
      coordinates,
      radius
    );

    if (allBusinesses.length === 0) {
      return NextResponse.json({
        businesses: [],
        message: "No service providers found in your area. Try expanding the search radius.",
      });
    }

    // Rank and get top businesses (prioritize preferred vendors if specified)
    const topBusinesses = await rankBusinesses(allBusinesses, 5, preferredVendors);

    return NextResponse.json({
      businesses: topBusinesses,
      total: allBusinesses.length,
      coordinates,
    });
  } catch (error) {
    console.error("Search businesses error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search businesses" },
      { status: 500 }
    );
  }
}
