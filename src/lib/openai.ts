import OpenAI from "openai";
import { UserRequirement } from "@/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const REQUIREMENT_EXTRACTION_PROMPT = `You are a helpful assistant that extracts structured requirements from user messages for booking local services.

Your job is to:
1. Extract all relevant details from the conversation
2. Identify what information is still missing
3. Ask clarifying questions naturally - ONE question at a time

For CAB/TAXI services, you MUST collect these REQUIRED fields (in this priority order):
1. Pickup location (from) - REQUIRED
2. Drop location (to) - REQUIRED
3. Date of travel - REQUIRED
4. Time of travel - REQUIRED
5. Trip type (one-way or round-trip/up-and-down) - REQUIRED, always ask this
6. Waiting time (REQUIRED if round-trip) - how long should driver wait at destination
7. Toll preference - REQUIRED, ask if user is okay with toll roads (they may make the trip shorter/faster)
8. Number of passengers - REQUIRED
9. Special instructions - REQUIRED, always ask if there's anything specific to tell the vendor (e.g., luggage, elderly passenger, AC preference, etc.)

Optional fields:
- Vehicle preference (sedan, SUV, auto)
- Budget
- Preferred vendors - IMPORTANT: Look for ANY vendor/company/service names the user mentions wanting to use or try first. Examples:
  - "try Ola first" → preferredVendors: ["Ola"]
  - "call Sharma Travels" → preferredVendors: ["Sharma Travels"]
  - "prioritize XYZ Cabs and ABC Taxi" → preferredVendors: ["XYZ Cabs", "ABC Taxi"]
  - "I want to book with Uber" → preferredVendors: ["Uber"]
  - "Check with Meru first" → preferredVendors: ["Meru"]
  Extract vendor names even if they're mentioned casually in the conversation.

IMPORTANT RULES:
- Ask ONE question at a time, don't overwhelm with multiple questions
- For trip type, use natural phrasing like "Is this a one-way trip or do you need the cab to wait and bring you back?"
- For toll preference, ask "Are you okay with toll roads if they make the journey shorter?"
- For special instructions, ask "Any special requests or instructions for the driver? (luggage, AC preference, etc.)"
- Only mark isComplete=true when ALL required fields are collected
- If user says "no" or "nothing" for special instructions, that's valid - set it to "none"

Respond in JSON format:
{
  "extracted": {
    "service": "cab",
    "from": "extracted pickup location or null",
    "to": "extracted destination or null",
    "date": "extracted date or null",
    "time": "extracted time or null",
    "passengers": number or null,
    "vehicleType": "sedan/suv/auto or null",
    "budget": number or null,
    "tripType": "one-way or round-trip or null",
    "waitingTime": number in minutes or null (only for round-trip),
    "tollPreference": "ok/avoid/no-preference or null",
    "specialInstructions": "any special instructions or 'none' or null",
    "preferredVendors": ["array of vendor names user wants to call first"] or null,
    "additionalDetails": "any other relevant info"
  },
  "isComplete": boolean,
  "missingFields": ["list of missing required fields"],
  "followUpQuestion": "Natural question to ask for missing info, or null if complete"
}

Be conversational and friendly. If the user provides partial info, acknowledge what you understood and ask for ONE missing field.`;

export async function extractRequirements(
  conversationHistory: { role: "user" | "assistant"; content: string }[]
): Promise<{
  requirements: UserRequirement;
  followUpQuestion: string | null;
}> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: REQUIREMENT_EXTRACTION_PROMPT },
      ...conversationHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");

  console.log(`[extractRequirements] Raw extraction result:`, JSON.stringify(result, null, 2));
  console.log(`[extractRequirements] preferredVendors from GPT:`, result.extracted?.preferredVendors);

  return {
    requirements: {
      service: result.extracted?.service || "cab",
      from: result.extracted?.from || undefined,
      to: result.extracted?.to || undefined,
      date: result.extracted?.date || undefined,
      time: result.extracted?.time || undefined,
      passengers: result.extracted?.passengers || undefined,
      vehicleType: result.extracted?.vehicleType || undefined,
      budget: result.extracted?.budget || undefined,
      tripType: result.extracted?.tripType || undefined,
      waitingTime: result.extracted?.waitingTime || undefined,
      tollPreference: result.extracted?.tollPreference || undefined,
      specialInstructions: result.extracted?.specialInstructions || undefined,
      preferredVendors: result.extracted?.preferredVendors || undefined,
      additionalDetails: result.extracted?.additionalDetails || undefined,
      isComplete: result.isComplete || false,
      missingFields: result.missingFields || [],
    },
    followUpQuestion: result.followUpQuestion || null,
  };
}

export async function generateNegotiationScript(
  requirements: UserRequirement,
  business: { name: string; rating: number }
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are creating a phone call script for an AI assistant that will call a business to get a quote.

The AI should:
1. Be polite and professional
2. Clearly state the requirement
3. Ask for the best price
4. Try to negotiate if the price seems high
5. Get confirmation of availability
6. Thank them and end the call

Keep the script natural and conversational. The AI will adapt based on responses.`,
      },
      {
        role: "user",
        content: `Create a negotiation script for calling ${business.name} (${business.rating} star rating) for:
Service: ${requirements.service}
From: ${requirements.from}
To: ${requirements.to}
Date: ${requirements.date}
Time: ${requirements.time}
Passengers: ${requirements.passengers || "not specified"}
Vehicle: ${requirements.vehicleType || "any"}
Budget: ${requirements.budget ? `Rs. ${requirements.budget}` : "flexible"}`,
      },
    ],
    temperature: 0.7,
  });

  return response.choices[0].message.content || "";
}

export async function analyzeQuotes(
  quotes: { business: string; price: number; notes: string }[],
  requirements: UserRequirement
): Promise<{
  recommendation: string;
  reasoning: string;
  rankedQuotes: { business: string; price: number; rank: number; pros: string[]; cons: string[] }[];
}> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You analyze quotes from multiple vendors and provide a recommendation.
Consider: price, reliability (based on notes), and value for money.
Respond in JSON format.`,
      },
      {
        role: "user",
        content: `Analyze these quotes for ${requirements.service} from ${requirements.from} to ${requirements.to}:

${quotes.map((q, i) => `${i + 1}. ${q.business}: Rs. ${q.price} - ${q.notes}`).join("\n")}

User's budget: ${requirements.budget ? `Rs. ${requirements.budget}` : "not specified"}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });

  return JSON.parse(response.choices[0].message.content || "{}");
}
