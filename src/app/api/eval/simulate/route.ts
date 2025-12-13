/**
 * API Route: /api/eval/simulate
 *
 * Run synthetic vendor simulations for eval testing
 * - POST: Run simulation batch with specified parameters
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateSyntheticVendorBatch,
  runEvalBatch,
  createSyntheticVendor,
  PERSONA_TEMPLATES,
  SimulatedCallResult,
} from "@/lib/eval";
import { saveCallRecord } from "@/lib/call-history";

// Default bot script for testing (mimics actual bot behavior)
const DEFAULT_BOT_SCRIPT = [
  "Hello! Main Preet bol rahi hoon. Kya meri baat aapke service se ho rahi hai?",
  "Ji, mujhe Koramangala se Airport jaana hai, kal subah 8 baje. Kitna lagega?",
  "Thoda zyada lag raha hai. Aap 20% kam kar sakte ho?",
  "Accha, thoda aur adjust karo na. Final kitna hoga?",
  "Theek hai, all-inclusive hai na? Toll, parking sab included?",
  "Okay, confirm karke thodi der mein callback karti hoon. Dhanyavaad!",
];

// Helper to save simulated call to database
async function saveSimulatedCallToDb(
  result: SimulatedCallResult,
  tripDetails: { from: string; to: string; date: string; time: string; vehicleType?: string; tripType?: string },
  sessionId: string
) {
  // Build transcript from conversation
  const transcript = result.conversation
    .map(turn => `${turn.speaker === "bot" ? "Bot" : "Vendor"}: ${turn.text}`)
    .join("\n");

  await saveCallRecord({
    callId: `synthetic-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    vendorName: `${result.persona.name} (Synthetic)`,
    vendorPhone: "0000000000", // Synthetic placeholder
    dateTime: new Date().toISOString(),
    duration: result.outcome.callDuration,
    status: result.outcome.quoteObtained ? "completed" : "failed",
    endedReason: result.outcome.endReason,
    requirements: {
      service: "cab",
      from: tripDetails.from,
      to: tripDetails.to,
      date: tripDetails.date,
      time: tripDetails.time,
      vehicleType: tripDetails.vehicleType,
      tripType: tripDetails.tripType,
    },
    quotedPrice: result.outcome.firstOffer,
    negotiatedPrice: result.outcome.finalPrice,
    transcript,
    recordingUrl: null,
    notes: `Synthetic call with persona: ${result.persona.id}`,
    sessionId,
    isSynthetic: true,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      count = 10,
      personaIds,
      tripDetails = {
        from: "Koramangala, Bangalore",
        to: "Kempegowda Airport",
        date: "Tomorrow",
        time: "8:00 AM",
        distance: 35,
        vehicleType: "sedan",
        tripType: "one-way",
      },
      marketPrice = {
        low: 800,
        mid: 1000,
        high: 1200,
      },
      botScript = DEFAULT_BOT_SCRIPT,
      saveToDb = false, // Set to true to save results to database
    } = body;

    // Generate vendors
    let vendors;
    if (personaIds && Array.isArray(personaIds) && personaIds.length > 0) {
      // Create specific personas
      vendors = personaIds.slice(0, count).map(id =>
        createSyntheticVendor(id, tripDetails, marketPrice)
      );
    } else {
      // Generate mixed batch
      vendors = generateSyntheticVendorBatch(tripDetails, marketPrice, count);
    }

    // Run eval batch
    const result = await runEvalBatch(vendors, botScript);

    // Save to database if requested
    let savedCount = 0;
    if (saveToDb) {
      const sessionId = `synthetic-batch-${Date.now()}`;
      for (const simResult of result.results) {
        try {
          await saveSimulatedCallToDb(simResult, tripDetails, sessionId);
          savedCount++;
        } catch (err) {
          console.error("[simulate] Failed to save call:", err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      savedToDb: saveToDb,
      savedCount,
    });
  } catch (error) {
    console.error("[api/eval/simulate] error:", error);
    return NextResponse.json(
      { error: "Simulation failed", details: String(error) },
      { status: 500 }
    );
  }
}

// GET to list available personas for simulation
export async function GET() {
  return NextResponse.json({
    success: true,
    availablePersonas: PERSONA_TEMPLATES.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      negotiationStyle: p.negotiationStyle,
      priceFlexibility: p.priceFlexibility,
    })),
    defaultBotScript: DEFAULT_BOT_SCRIPT,
  });
}
