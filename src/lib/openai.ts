import OpenAI from "openai";
import { UserRequirement } from "@/types";
import {
  getServiceConfig,
  detectServiceType,
  buildExtractionPrompt,
  getAvailableServices,
  ServiceConfig,
} from "./services/service-config";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initial prompt to detect service type
const SERVICE_DETECTION_PROMPT = `You are a helpful service booking assistant.
Your first job is to understand what service the customer needs.

Available services:
- cab/taxi: For travel, rides, airport transfers, outstation trips
- caterer/catering: For food, party catering, event food, tiffin services
- photographer/photography: For photo shoots, video, wedding photography, events

From the conversation, determine which service the customer needs.
If unclear, ask them what service they're looking for.

Respond in JSON format:
{
  "detectedService": "cab" or "caterer" or "photographer" or null,
  "confidence": "high" or "medium" or "low",
  "followUpQuestion": "Question to ask if service unclear, or null if clear"
}`;

/**
 * Detect service type from conversation
 */
export async function detectService(
  conversationHistory: { role: "user" | "assistant"; content: string }[]
): Promise<{ service: string | null; followUpQuestion: string | null }> {
  // First try keyword detection
  const lastUserMessage = conversationHistory.filter((m) => m.role === "user").pop();
  if (lastUserMessage) {
    const detected = detectServiceType(lastUserMessage.content);
    if (detected) {
      return { service: detected, followUpQuestion: null };
    }
  }

  // Use LLM for more complex detection
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SERVICE_DETECTION_PROMPT },
      ...conversationHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");

  if (result.detectedService && result.confidence !== "low") {
    return { service: result.detectedService, followUpQuestion: null };
  }

  return {
    service: null,
    followUpQuestion:
      result.followUpQuestion ||
      "What service are you looking for? I can help with cab booking, catering, or photography.",
  };
}

/**
 * Extract requirements using the dynamic service config
 */
export async function extractRequirements(
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  serviceType?: string
): Promise<{
  requirements: UserRequirement;
  followUpQuestion: string | null;
  serviceConfig: ServiceConfig | null;
}> {
  // Detect service if not provided
  let detectedService = serviceType;
  if (!detectedService) {
    for (const msg of conversationHistory) {
      if (msg.role === "user") {
        const detected = detectServiceType(msg.content);
        if (detected) {
          detectedService = detected;
          break;
        }
      }
    }
  }

  // Get service config
  const serviceConfig = detectedService ? getServiceConfig(detectedService) : null;

  // If no service detected yet, ask what service they need
  if (!serviceConfig) {
    const services = getAvailableServices();
    const serviceList = services.map((s) => `${s.icon} ${s.displayName}`).join(", ");
    return {
      requirements: {
        service: "",
        isComplete: false,
        missingFields: ["service"],
      },
      followUpQuestion: `Hello! What service do you need today? I can help with: ${serviceList}`,
      serviceConfig: null,
    };
  }

  // Build dynamic prompt based on service
  const extractionPrompt = buildExtractionPrompt(serviceConfig);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: extractionPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");

  console.log(`[extractRequirements] Service: ${serviceConfig.id}`);
  console.log(`[extractRequirements] Raw extraction:`, JSON.stringify(result, null, 2));

  // Build requirements object with all extracted fields
  const requirements: UserRequirement = {
    service: serviceConfig.id,
    isComplete: result.isComplete || false,
    missingFields: result.missingFields || [],
    // Common fields
    preferredVendors: result.extracted?.preferredVendors || undefined,
    additionalDetails: result.extracted?.additionalDetails || undefined,
    budget: result.extracted?.budget || undefined,
    // Store all service-specific fields in serviceFields
    serviceFields: {},
  };

  // Copy all extracted fields
  if (result.extracted) {
    for (const [key, value] of Object.entries(result.extracted)) {
      if (value !== null && value !== undefined) {
        // Map to known fields or store in serviceFields
        if (key in requirements) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (requirements as any)[key] = value;
        } else {
          requirements.serviceFields![key] = value;
        }
      }
    }
  }

  // Also map common cab fields for backward compatibility
  if (serviceConfig.id === "cab") {
    requirements.from = result.extracted?.from || undefined;
    requirements.to = result.extracted?.to || undefined;
    requirements.date = result.extracted?.date || undefined;
    requirements.time = result.extracted?.time || undefined;
    requirements.passengers = result.extracted?.passengers || undefined;
    requirements.vehicleType = result.extracted?.vehicleType || undefined;
    requirements.tripType = result.extracted?.tripType || undefined;
    requirements.waitingTime = result.extracted?.waitingTime || undefined;
    requirements.tollPreference = result.extracted?.tollPreference || undefined;
    requirements.specialInstructions = result.extracted?.specialInstructions || undefined;
  }

  return {
    requirements,
    followUpQuestion: result.followUpQuestion || null,
    serviceConfig,
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
