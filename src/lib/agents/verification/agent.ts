import { ChatOpenAI } from "@langchain/openai";
import {
  NegotiatorGraphState,
  VerificationResult,
  SupportedLanguage,
  createAgentEvent
} from "../types";
import { Business } from "@/types";
import {
  LANGUAGE_PHRASES,
  TRANSCRIBER_LANGUAGE_CODES,
  getLanguageName
} from "../negotiator/language-switcher";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = "https://api.vapi.ai";

// Generate verification call prompt
function generateVerificationPrompt(
  business: Business,
  negotiatedPrice: number,
  requirements: NegotiatorGraphState["requirements"],
  language: SupportedLanguage
): string {
  const langName = getLanguageName(language);
  const phrases = LANGUAGE_PHRASES[language];

  return `You are calling back to VERIFY and CONFIRM a previously negotiated booking.

## IMPORTANT: This is a VERIFICATION call
- You already negotiated a price earlier
- Now you are calling to CONFIRM the details are correct
- Be brief and focused - just verify the key details

## Language
- Speak in ${langName}
- If vendor responds in different language, switch to theirs

## Details to Verify
- Business: ${business.name}
- Negotiated Price: ₹${negotiatedPrice}
- Service: ${requirements?.service}
- From: ${requirements?.from}
- To: ${requirements?.to}
- Date: ${requirements?.date}
- Time: ${requirements?.time}

## Call Flow
1. Greet: "${phrases.greeting}"
2. Identify yourself: "We spoke earlier about a ${requirements?.service} booking"
3. Confirm price: "The agreed price was ₹${negotiatedPrice}, correct?"
4. Confirm pickup: "Pickup from ${requirements?.from} at ${requirements?.time}?"
5. Confirm date: "On ${requirements?.date}?"
6. Ask for driver contact: "Will the driver call us before pickup?"
7. Final confirmation: "So we are confirmed for ₹${negotiatedPrice}?"
8. Thank and end: "${phrases.thankYou}"

## What to Check For
- If they quote a DIFFERENT price, note it as a discrepancy
- If they say booking is not confirmed, note it
- If they ask for advance payment, note the terms
- Get driver contact number if possible

## Important
- Keep call SHORT (under 2 minutes)
- Be polite and professional
- If they don't remember, briefly remind them of the details
- Note any discrepancies for the user

End with clear confirmation or note the issue.`;
}

// Make verification call via Vapi
async function makeVerificationCall(
  business: Business,
  negotiatedPrice: number,
  requirements: NegotiatorGraphState["requirements"],
  language: SupportedLanguage
): Promise<{ callId: string; status: string }> {
  // Format phone number for India
  let phoneNumber = business.phone.replace(/\s/g, "").replace(/-/g, "");
  if (!phoneNumber.startsWith("+")) {
    if (phoneNumber.startsWith("0")) {
      phoneNumber = "+91" + phoneNumber.slice(1);
    } else if (!phoneNumber.startsWith("91")) {
      phoneNumber = "+91" + phoneNumber;
    } else {
      phoneNumber = "+" + phoneNumber;
    }
  }

  const prompt = generateVerificationPrompt(business, negotiatedPrice, requirements, language);
  const phrases = LANGUAGE_PHRASES[language];
  const firstMessage = `${phrases.greeting}! ${language === "kn" ? "ನಾವು ಮೊದಲು" : language === "hi" ? "हमने पहले" : "We"} ${requirements?.service} ${language === "kn" ? "ಬಗ್ಗೆ ಮಾತಾಡಿದ್ದೆವು" : language === "hi" ? "के बारे में बात की थी" : "spoke about"} ${requirements?.service}. ${language === "kn" ? "ಕನ್ಫರ್ಮ್ ಮಾಡಲು ಕಾಲ್ ಮಾಡ್ತಿದ್ದೇನೆ" : language === "hi" ? "कन्फर्म करने के लिए कॉल कर रहा हूं" : "Calling to confirm"}.`;

  const response = await fetch(`${VAPI_BASE_URL}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: {
        number: phoneNumber,
        name: business.name,
      },
      assistant: {
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: prompt,
            },
          ],
        },
        voice: {
          provider: "11labs",
          voiceId: "21m00Tcm4TlvDq8ikWAM",
          model: "eleven_multilingual_v2",
        },
        firstMessage,
        transcriber: {
          provider: "deepgram",
          language: TRANSCRIBER_LANGUAGE_CODES[language],
        },
        endCallFunctionEnabled: true,
        endCallMessage: phrases.thankYou,
        maxDurationSeconds: 120, // Shorter for verification
      },
      metadata: {
        businessId: business.id,
        businessName: business.name,
        callType: "verification",
        negotiatedPrice,
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

// Get call status from Vapi
async function getCallStatus(callId: string): Promise<{
  status: string;
  transcript?: string;
  endedAt?: string;
}> {
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

// Analyze verification transcript for discrepancies
async function analyzeVerificationTranscript(
  transcript: string,
  expectedPrice: number,
  requirements: NegotiatorGraphState["requirements"]
): Promise<{
  verified: boolean;
  discrepancies: VerificationResult["discrepancies"];
  finalConfirmation: VerificationResult["finalConfirmation"];
  notes: string;
}> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.2,
  });

  const prompt = `Analyze this verification call transcript for a cab booking.

Expected Details:
- Price: ₹${expectedPrice}
- Service: ${requirements?.service}
- From: ${requirements?.from}
- To: ${requirements?.to}
- Date: ${requirements?.date}
- Time: ${requirements?.time}

Transcript:
${transcript}

Analyze and respond in JSON:
{
  "verified": boolean (true if vendor confirmed all details),
  "discrepancies": [
    {
      "field": "price" | "time" | "date" | "vehicle" | "other",
      "negotiated": "what we expected",
      "confirmed": "what vendor said",
      "severity": "minor" | "major" | "critical"
    }
  ],
  "finalConfirmation": {
    "price": number (confirmed price),
    "pickupTime": "confirmed time",
    "pickupDate": "confirmed date",
    "vehicle": "vehicle type confirmed",
    "driverContact": "if provided, else null",
    "paymentTerms": "any payment terms mentioned"
  },
  "vendorConfirmed": boolean (did vendor explicitly confirm?),
  "notes": "any important observations"
}`;

  try {
    const response = await model.invoke(prompt);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        verified: result.verified && result.discrepancies.length === 0,
        discrepancies: result.discrepancies || [],
        finalConfirmation: result.finalConfirmation || null,
        notes: result.notes || "",
      };
    }
  } catch (error) {
    console.error("Verification analysis error:", error);
  }

  return {
    verified: false,
    discrepancies: [],
    finalConfirmation: null,
    notes: "Could not analyze verification call",
  };
}

// Main Verification Agent function
export async function verificationAgent(
  state: NegotiatorGraphState
): Promise<Partial<NegotiatorGraphState>> {
  const events = [
    createAgentEvent(
      "agent_started",
      "verification",
      "Starting verification phase...",
      {
        bestDeal: state.bestDeal?.vendor.name,
        price: state.bestDeal?.price,
      }
    ),
  ];

  // Check if verification should be skipped
  if (state.skipVerification) {
    events.push(
      createAgentEvent(
        "agent_completed",
        "verification",
        "Verification skipped by user request"
      )
    );
    return {
      agentEvents: events,
      currentAgent: "verification",
      previousAgents: [...state.previousAgents, "verification"],
      bestDeal: state.bestDeal
        ? { ...state.bestDeal, verificationStatus: "skipped" }
        : null,
    };
  }

  // Check if we have a best deal to verify
  if (!state.bestDeal) {
    events.push(
      createAgentEvent(
        "agent_completed",
        "verification",
        "No deal to verify - no successful negotiations"
      )
    );
    return {
      agentEvents: events,
      currentAgent: "verification",
      previousAgents: [...state.previousAgents, "verification"],
    };
  }

  const { vendor, price } = state.bestDeal;

  events.push(
    createAgentEvent(
      "verification_started",
      "verification",
      `Calling ${vendor.name} to verify ₹${price} deal...`,
      {
        businessId: vendor.id,
        businessName: vendor.name,
        price,
      }
    )
  );

  let verificationResult: VerificationResult = {
    callId: "",
    verified: false,
    verificationCallId: null,
    discrepancies: [],
    finalConfirmation: null,
    vendorConfirmed: false,
    notes: "",
  };

  try {
    // Make verification call
    const { callId, status } = await makeVerificationCall(
      vendor,
      price,
      state.requirements,
      state.currentLanguage
    );

    verificationResult.verificationCallId = callId;

    events.push(
      createAgentEvent(
        "call_started",
        "verification",
        `Verification call initiated to ${vendor.name}...`,
        { callId, status }
      )
    );

    // Wait for call completion
    let callComplete = false;
    let attempts = 0;
    const maxAttempts = 30; // 2.5 minutes max for verification

    while (!callComplete && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;

      const callStatus = await getCallStatus(callId);

      if (
        callStatus.status === "ended" ||
        callStatus.status === "completed" ||
        callStatus.status === "failed" ||
        callStatus.status === "busy" ||
        callStatus.status === "no-answer"
      ) {
        callComplete = true;

        if (callStatus.transcript) {
          // Analyze the verification transcript
          const analysis = await analyzeVerificationTranscript(
            callStatus.transcript,
            price,
            state.requirements
          );

          verificationResult = {
            callId,
            verified: analysis.verified,
            verificationCallId: callId,
            discrepancies: analysis.discrepancies,
            finalConfirmation: analysis.finalConfirmation,
            vendorConfirmed: analysis.verified,
            notes: analysis.notes,
          };
        } else {
          verificationResult.notes = "No transcript available for verification";
        }
      }
    }

    if (!callComplete) {
      verificationResult.notes = "Verification call timed out";
    }
  } catch (error) {
    verificationResult.notes = `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    events.push(
      createAgentEvent(
        "agent_error",
        "verification",
        `Verification call failed: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
  }

  // Determine verification status for best deal
  let verificationStatus: "verified" | "discrepancy" | "pending" = "pending";
  if (verificationResult.verified) {
    verificationStatus = "verified";
  } else if (verificationResult.discrepancies.length > 0) {
    verificationStatus = "discrepancy";
  }

  // Create completion event
  const discrepancyText = verificationResult.discrepancies.length > 0
    ? `Discrepancies: ${verificationResult.discrepancies.map((d) => `${d.field} (${d.severity})`).join(", ")}`
    : "";

  events.push(
    createAgentEvent(
      "verification_completed",
      "verification",
      verificationResult.verified
        ? `✅ Verification successful! ${vendor.name} confirmed ₹${verificationResult.finalConfirmation?.price || price}`
        : `⚠️ Verification ${verificationResult.discrepancies.length > 0 ? "found discrepancies" : "incomplete"}. ${discrepancyText || verificationResult.notes}`,
      {
        verified: verificationResult.verified,
        discrepancies: verificationResult.discrepancies,
        finalPrice: verificationResult.finalConfirmation?.price,
      }
    )
  );

  events.push(
    createAgentEvent(
      "agent_completed",
      "verification",
      `Verification phase complete. Status: ${verificationStatus}`,
      { verificationStatus }
    )
  );

  return {
    agentEvents: events,
    currentAgent: "verification",
    previousAgents: [...state.previousAgents, "verification"],
    verification: verificationResult,
    bestDeal: {
      ...state.bestDeal,
      verificationStatus,
      price: verificationResult.finalConfirmation?.price || state.bestDeal.price,
    },
  };
}
