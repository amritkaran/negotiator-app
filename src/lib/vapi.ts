import { CallResult, UserRequirement, Business } from "@/types";
import { buildNegotiationPrompt, NegotiationPromptContext } from "./prompts/negotiation-prompt";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = "https://api.vapi.ai";

interface VapiCallResponse {
  id: string;
  status: string;
  createdAt: string;
  endedAt?: string;
  transcript?: string;
  summary?: string;
  recordingUrl?: string;
  cost?: number;
}

// Create the system prompt for the negotiation call using the shared prompt builder
function createNegotiationPrompt(
  requirements: UserRequirement,
  business: Business,
  lowestPriceSoFar?: number
): string {
  const context: NegotiationPromptContext = {
    agentName: "Preet",
    vendorName: business.name,
    service: requirements.service,
    from: requirements.from || "pickup location",
    to: requirements.to || "destination",
    date: requirements.date || "today",
    time: requirements.time || "as soon as possible",
    passengerCount: requirements.passengers,
    vehicleType: requirements.vehicleType,
    tripType: requirements.tripType || "one-way",
    waitingTime: requirements.waitingTime,
    tollPreference: requirements.tollPreference,
    specialInstructions: requirements.specialInstructions,
    lowestPriceSoFar,
    language: "hindi", // VAPI voice bot uses Hindi by default
    hitlMode: "tool", // VAPI uses the askHumanForDetails tool
  };

  return buildNegotiationPrompt(context);
}

// Create the first message for the call (in Hinglish)
function createFirstMessage(requirements: UserRequirement, businessName: string): string {
  return `Hello! Main Preet bol rahi hoon. Kya meri baat ${businessName} se ho rahi hai?`;
}

export async function makeOutboundCall(
  business: Business,
  requirements: UserRequirement,
  lowestPriceSoFar?: number
): Promise<{ callId: string; status: string }> {
  const systemPrompt = createNegotiationPrompt(requirements, business, lowestPriceSoFar);
  const firstMessage = createFirstMessage(requirements, business.name);

  // TEST MODE: If TEST_PHONE_NUMBER is set, use it instead of the vendor's number
  const testPhoneNumber = process.env.TEST_PHONE_NUMBER;

  // Format phone number for India (add +91 if not present)
  let phoneNumber = (testPhoneNumber || business.phone).replace(/\s/g, "").replace(/-/g, "");
  if (!phoneNumber.startsWith("+")) {
    if (phoneNumber.startsWith("0")) {
      phoneNumber = "+91" + phoneNumber.slice(1);
    } else if (!phoneNumber.startsWith("91")) {
      phoneNumber = "+91" + phoneNumber;
    } else {
      phoneNumber = "+" + phoneNumber;
    }
  }

  // Log if using test mode
  if (testPhoneNumber) {
    console.log(`[VAPI TEST MODE] Calling test number ${phoneNumber} instead of vendor ${business.name} (${business.phone})`);
  }

  // Get the server URL for webhooks (needed for HITL)
  const serverUrl = process.env.VAPI_SERVER_URL || process.env.NEXT_PUBLIC_APP_URL;

  const response = await fetch(`${VAPI_BASE_URL}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID, // Your Vapi phone number ID
      customer: {
        number: phoneNumber,
        name: business.name,
      },
      assistant: {
        // Server URL for receiving webhooks (HITL tool calls)
        serverUrl: serverUrl ? `${serverUrl}/api/vapi-webhook` : undefined,
        serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
          ],
          // HITL Tool - allows bot to ask human for specific details
          tools: [
            {
              type: "function",
              function: {
                name: "askHumanForDetails",
                description:
                  "Use this tool when the vendor asks for specific details you don't have, such as exact pickup location, building name, landmark, etc. The human operator will provide the answer. Say 'एक सेकंड रुकिए' (one second please) before calling this tool.",
                parameters: {
                  type: "object",
                  properties: {
                    question: {
                      type: "string",
                      description:
                        "The specific question the vendor asked that you need human help to answer. Include the exact question in the language they asked.",
                    },
                    context: {
                      type: "string",
                      description:
                        "Brief context about what information is needed (e.g., 'exact pickup location', 'landmark near pickup', 'building name')",
                    },
                  },
                  required: ["question"],
                },
              },
            },
          ],
        },
        voice: {
          provider: "cartesia",
          voiceId: "95d51f79-c397-46f9-b49a-23763d3eaa2d", // Arushi Hinglish female voice
          language: "hi",
        },
        firstMessage: firstMessage,
        transcriber: {
          provider: "deepgram",
          model: "nova-3",
          language: "multi", // Multilingual detection
        },
        endCallFunctionEnabled: true,
        endCallMessage: "धन्यवाद, शुभ दिन!",
        maxDurationSeconds: 180, // 3 minutes max
        recordingEnabled: true, // Enable call recording
        artifactPlan: {
          recordingEnabled: true,
          videoRecordingEnabled: false,
          transcriptPlan: {
            enabled: true,
          },
        },
      },
      metadata: {
        businessId: business.id,
        businessName: business.name,
        service: requirements.service,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vapi API error: ${error}`);
  }

  const data = await response.json();
  return {
    callId: data.id,
    status: data.status,
  };
}

export async function getCallStatus(callId: string): Promise<VapiCallResponse> {
  const response = await fetch(`${VAPI_BASE_URL}/call/${callId}`, {
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get call status: ${response.statusText}`);
  }

  return response.json();
}

export async function waitForCallCompletion(
  callId: string,
  maxWaitMs: number = 300000 // 5 minutes max wait
): Promise<VapiCallResponse> {
  const startTime = Date.now();
  const pollInterval = 5000; // Poll every 5 seconds

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getCallStatus(callId);

    if (
      status.status === "ended" ||
      status.status === "failed" ||
      status.status === "busy" ||
      status.status === "no-answer"
    ) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Call timed out");
}

export async function extractQuoteFromTranscript(
  transcript: string,
  businessName: string
): Promise<{ price: number | null; notes: string }> {
  // Use OpenAI to extract structured data from transcript
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Extract the quoted price and any important notes from this call transcript.
The transcript may be in Kannada, Hindi, or English - understand all languages.

IMPORTANT - Extra Charges Detection:
- Look for mentions of toll, parking, night charges, waiting charges being EXTRA
- Kannada: "ಟೋಲ್ ಬೇರೆ", "ಪಾರ್ಕಿಂಗ್ ಬೇರೆ", "ಎಕ್ಸ್ಟ್ರಾ"
- Hindi: "toll alag", "parking alag", "extra charges"
- English: "plus toll", "toll extra", "parking separate"

Price Extraction Rules:
- If vendor gave BASE price + extras separately, calculate and return the TOTAL
- If vendor gave all-inclusive price, return that
- If only base price was mentioned with extras TBD, note that extras are additional

Respond in JSON format:
{
  "basePrice": number or null (the initial price quoted),
  "allInclusivePrice": number or null (total with all charges, if mentioned),
  "price": number or null (best estimate of final price - prefer allInclusivePrice if available),
  "currency": "INR",
  "vehicleType": "vehicle type mentioned or null",
  "hasExtraCharges": true/false (whether vendor mentioned extra charges like toll/parking),
  "extraChargeTypes": ["toll", "parking", etc] or [],
  "extraChargeAmount": number or null (estimated extra charges if mentioned),
  "isAllInclusive": true/false (whether the final price includes everything),
  "availability": "confirmed/not available/unclear",
  "notes": "any other important information from the call"
}`,
      },
      {
        role: "user",
        content: `Extract quote information from this call to ${businessName}:\n\n${transcript}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");

  // Build comprehensive notes
  const notesParts = [];
  if (result.vehicleType) notesParts.push(`Vehicle: ${result.vehicleType}`);
  if (result.hasExtraCharges && result.extraChargeTypes?.length > 0) {
    notesParts.push(`Extra charges: ${result.extraChargeTypes.join(", ")}`);
  }
  if (result.extraChargeAmount) {
    notesParts.push(`Extra amount: ₹${result.extraChargeAmount}`);
  }
  if (result.isAllInclusive === false) {
    notesParts.push("⚠️ Price may NOT include all charges");
  } else if (result.isAllInclusive === true) {
    notesParts.push("✓ All-inclusive price");
  }
  if (result.availability) notesParts.push(`Availability: ${result.availability}`);
  if (result.notes) notesParts.push(result.notes);

  return {
    price: result.allInclusivePrice || result.price || result.basePrice,
    notes: notesParts.filter(Boolean).join(". "),
  };
}

export async function processCallResult(
  callResponse: VapiCallResponse,
  business: Business
): Promise<CallResult> {
  let quotedPrice: number | undefined;
  let notes = "";

  if (callResponse.transcript) {
    const extracted = await extractQuoteFromTranscript(
      callResponse.transcript,
      business.name
    );
    quotedPrice = extracted.price || undefined;
    notes = extracted.notes;
  }

  const statusMap: Record<string, CallResult["status"]> = {
    ended: "completed",
    failed: "failed",
    busy: "busy",
    "no-answer": "no_answer",
  };

  return {
    businessId: business.id,
    businessName: business.name,
    phone: business.phone,
    status: statusMap[callResponse.status] || "failed",
    quotedPrice,
    notes: notes || callResponse.summary || "",
    transcript: callResponse.transcript,
    duration: callResponse.endedAt
      ? Math.round(
          (new Date(callResponse.endedAt).getTime() -
            new Date(callResponse.createdAt).getTime()) /
            1000
        )
      : undefined,
    callId: callResponse.id,
  };
}
