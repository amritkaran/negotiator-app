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
} from "@/lib/eval";

// Default bot script for testing (mimics actual bot behavior)
const DEFAULT_BOT_SCRIPT = [
  "Hello! Main Preet bol rahi hoon. Kya meri baat aapke service se ho rahi hai?",
  "Ji, mujhe Koramangala se Airport jaana hai, kal subah 8 baje. Kitna lagega?",
  "Thoda zyada lag raha hai. Aap 20% kam kar sakte ho?",
  "Accha, thoda aur adjust karo na. Final kitna hoga?",
  "Theek hai, all-inclusive hai na? Toll, parking sab included?",
  "Okay, confirm karke thodi der mein callback karti hoon. Dhanyavaad!",
];

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

    return NextResponse.json({
      success: true,
      ...result,
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
