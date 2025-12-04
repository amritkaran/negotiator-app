import { Business } from "@/types";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  rating?: number;
  user_ratings_total?: number;
  formatted_phone_number?: string;
  international_phone_number?: string;
  types: string[];
}

interface NearbySearchResponse {
  results: PlaceResult[];
  status: string;
  next_page_token?: string;
}

interface PlaceDetailsResponse {
  result: PlaceResult & {
    formatted_phone_number?: string;
    international_phone_number?: string;
  };
  status: string;
}

// Convert service type to Google Maps search query
function getSearchQuery(service: string): string {
  const serviceMap: Record<string, string> = {
    cab: "taxi service",
    taxi: "taxi service",
    plumber: "plumber",
    electrician: "electrician",
    caterer: "catering service",
    carpenter: "carpenter",
    painter: "painter",
    cleaning: "cleaning service",
    mover: "packers and movers",
    mechanic: "car mechanic",
  };
  return serviceMap[service.toLowerCase()] || service;
}

// Calculate distance between two points using Haversine formula
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function searchNearbyBusinesses(
  service: string,
  location: { lat: number; lng: number },
  radiusKm: number = 5
): Promise<Business[]> {
  const query = getSearchQuery(service);
  const radiusMeters = radiusKm * 1000;

  // Use Text Search API for better results with service queries
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query
  )}&location=${location.lat},${location.lng}&radius=${radiusMeters}&key=${GOOGLE_MAPS_API_KEY}`;

  const searchResponse = await fetch(searchUrl);
  const searchData: NearbySearchResponse = await searchResponse.json();

  if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
    console.error("Google Maps API error:", searchData.status);
    throw new Error(`Google Maps API error: ${searchData.status}`);
  }

  if (!searchData.results || searchData.results.length === 0) {
    return [];
  }

  // Get details for each place to get phone numbers
  const businessesWithDetails = await Promise.all(
    searchData.results.slice(0, 10).map(async (place) => {
      const details = await getPlaceDetails(place.place_id);
      const distance = calculateDistance(
        location.lat,
        location.lng,
        place.geometry.location.lat,
        place.geometry.location.lng
      );

      return {
        id: place.place_id,
        name: place.name,
        phone: details?.formatted_phone_number || details?.international_phone_number || "",
        address: place.formatted_address,
        rating: place.rating || 0,
        reviewCount: place.user_ratings_total || 0,
        distance: Math.round(distance * 10) / 10,
        placeId: place.place_id,
        types: place.types,
      };
    })
  );

  // Filter businesses that have phone numbers AND are within the specified radius, then sort by rating & distance
  return businessesWithDetails
    .filter((b) => b.phone && b.distance <= radiusKm)
    .sort((a, b) => {
      // Score based on rating (weighted) and distance
      const scoreA = a.rating * 2 - a.distance * 0.5;
      const scoreB = b.rating * 2 - b.distance * 0.5;
      return scoreB - scoreA;
    });
}

async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetailsResponse["result"] | null> {
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,international_phone_number&key=${GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(detailsUrl);
  const data: PlaceDetailsResponse = await response.json();

  if (data.status !== "OK") {
    console.error("Place details error:", data.status);
    return null;
  }

  return data.result;
}

// Geocode an address to get coordinates
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address
  )}&key=${GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(geocodeUrl);
  const data = await response.json();

  if (data.status !== "OK" || !data.results?.[0]) {
    return null;
  }

  return data.results[0].geometry.location;
}

export async function rankBusinesses(
  businesses: Business[],
  topN: number = 3,
  preferredVendors?: string[]
): Promise<Business[]> {
  console.log(`[rankBusinesses] Ranking ${businesses.length} businesses, topN=${topN}, preferredVendors=`, preferredVendors);

  // Sort by composite score: rating * reviewCount weight + inverse distance
  const scored = businesses.map((b) => ({
    ...b,
    score:
      b.rating * Math.log(b.reviewCount + 1) * 0.7 + (10 - b.distance) * 0.3,
  }));

  // If preferred vendors specified, prioritize them
  if (preferredVendors && preferredVendors.length > 0) {
    const preferredLower = preferredVendors.map((v) => v.toLowerCase());

    // Separate preferred and non-preferred businesses
    const preferred: typeof scored = [];
    const nonPreferred: typeof scored = [];

    for (const business of scored) {
      const nameLower = business.name.toLowerCase();
      // Normalize by removing spaces for "A K" vs "AK" variations
      const nameNormalized = nameLower.replace(/\s+/g, '');

      // Check if business name contains any preferred vendor name (fuzzy match)
      const isPreferred = preferredLower.some((pv) => {
        const pvNormalized = pv.replace(/\s+/g, '');
        return nameLower.includes(pv) ||
               pv.includes(nameLower.split(" ")[0]) ||
               nameNormalized.includes(pvNormalized) ||
               pvNormalized.includes(nameNormalized.split(/\s+/)[0]);
      });

      if (isPreferred) {
        console.log(`[rankBusinesses] PREFERRED MATCH: "${business.name}"`);
        preferred.push(business);
      } else {
        nonPreferred.push(business);
      }
    }

    // Sort each group by score, then combine (preferred first)
    preferred.sort((a, b) => b.score - a.score);
    nonPreferred.sort((a, b) => b.score - a.score);

    console.log(`[rankBusinesses] Preferred vendors found: ${preferred.length}, returning preferred first`);
    return [...preferred, ...nonPreferred].slice(0, topN);
  }

  // Default: sort by score
  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}

// Get distance and duration between two points using Distance Matrix API
export async function getDistanceMatrix(
  origin: string,
  destination: string
): Promise<{ distance: number; duration: number } | null> {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
    origin
  )}&destinations=${encodeURIComponent(
    destination
  )}&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" || !data.rows?.[0]?.elements?.[0]) {
      console.error("Distance Matrix API error:", data.status);
      return null;
    }

    const element = data.rows[0].elements[0];
    if (element.status !== "OK") {
      console.error("Distance Matrix element error:", element.status);
      return null;
    }

    return {
      distance: element.distance.value / 1000, // Convert meters to km
      duration: element.duration.value / 60, // Convert seconds to minutes
    };
  } catch (error) {
    console.error("Distance Matrix fetch error:", error);
    return null;
  }
}
