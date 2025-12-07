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
  lowestPriceSoFar?: number,
  language?: string
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
    language: language || "hindi", // Use specified language or default to Hindi
    hitlMode: "tool", // VAPI uses the askHumanForDetails tool
  };

  return buildNegotiationPrompt(context);
}

// Azure Neural TTS voice mappings for Indian languages
// transcribeLang uses VAPI's Google transcriber language names
// langName is the full language name for prompts
const AZURE_VOICE_MAP: Record<string, { voiceId: string; transcribeLang: string; langName: string }> = {
  hi: { voiceId: "hi-IN-SwaraNeural", transcribeLang: "Hindi", langName: "Hindi" },
  kn: { voiceId: "kn-IN-SapnaNeural", transcribeLang: "Hindi", langName: "Kannada" }, // STT fallback to Hindi
  te: { voiceId: "te-IN-ShrutiNeural", transcribeLang: "Hindi", langName: "Telugu" }, // STT fallback to Hindi
  ta: { voiceId: "ta-IN-PallaviNeural", transcribeLang: "Hindi", langName: "Tamil" }, // STT fallback to Hindi
  bn: { voiceId: "bn-IN-TanishaaNeural", transcribeLang: "Bengali", langName: "Bengali" },
  mr: { voiceId: "mr-IN-AarohiNeural", transcribeLang: "Hindi", langName: "Marathi" }, // STT fallback to Hindi
  gu: { voiceId: "gu-IN-DhwaniNeural", transcribeLang: "Hindi", langName: "Gujarati" }, // STT fallback to Hindi
};

// First messages in different Indian languages
const FIRST_MESSAGES: Record<string, (businessName: string) => string> = {
  hi: (name) => `Hello! Main Preet bol rahi hoon. Kya meri baat ${name} se ho rahi hai?`,
  kn: (name) => `Hello! Naanu Preet. Naanu ${name} jote maathaadthiddina?`,
  te: (name) => `Hello! Nenu Preet. Nenu ${name} tho maatlaadutunnana?`,
  ta: (name) => `Hello! Naan Preet pesuren. Naan ${name} kitta pesurena?`,
  bn: (name) => `Hello! Ami Preet bolchi. Ami ki ${name} er sathe kotha bolchi?`,
  mr: (name) => `Hello! Mi Preet bolte. Mi ${name} shi bolte ka?`,
  gu: (name) => `Hello! Hu Preet bolu chhu. Hu ${name} sathe vaat karu chhu?`,
};

export async function makeOutboundCall(
  business: Business,
  requirements: UserRequirement,
  lowestPriceSoFar?: number,
  useRegionalLanguages?: boolean,
  regionalLanguage?: string
): Promise<{ callId: string; status: string }> {
  // Get Azure voice config for selected regional language
  const selectedLang = regionalLanguage || "hi";
  const azureConfig = AZURE_VOICE_MAP[selectedLang] || AZURE_VOICE_MAP.hi;

  // Determine language for prompts - use regional language name if regional mode, else Hindi
  const promptLanguage = useRegionalLanguages ? azureConfig.langName.toLowerCase() : "hindi";

  const systemPrompt = createNegotiationPrompt(requirements, business, lowestPriceSoFar, promptLanguage);

  // Use language-specific first message for regional languages, default Hindi otherwise
  const firstMessageFn = useRegionalLanguages
    ? (FIRST_MESSAGES[selectedLang] || FIRST_MESSAGES.hi)
    : FIRST_MESSAGES.hi;
  const firstMessage = firstMessageFn(business.name.slice(0, 30)); // Truncate for readability

  // Configure transcriber based on language mode
  // - Hindi/English mode: Deepgram Nova-3 with "multi" (faster, code-switching)
  // - Regional mode: Google STT with specific language (uses Gemini model)
  const transcriber = useRegionalLanguages
    ? {
        provider: "google" as const,
        model: "gemini-2.0-flash" as const,
        language: azureConfig.transcribeLang,
      }
    : {
        provider: "deepgram" as const,
        model: "nova-3" as const,
        language: "multi" as const,
      };

  // Configure voice (TTS) based on language mode
  // - Hindi/English mode: Cartesia (low latency, good Hindi support)
  // - Regional mode: Azure Neural TTS with language-specific voice
  const voice = useRegionalLanguages
    ? {
        provider: "azure" as const,
        voiceId: azureConfig.voiceId,
      }
    : {
        provider: "cartesia" as const,
        voiceId: "95d51f79-c397-46f9-b49a-23763d3eaa2d", // Arushi Hinglish female voice
        language: "hi" as const,
      };

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
        name: business.name.slice(0, 40), // VAPI requires name <= 40 chars
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
        voice,
        firstMessage: firstMessage,
        transcriber,
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
