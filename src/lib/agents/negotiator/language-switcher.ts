import { ChatOpenAI } from "@langchain/openai";
import { SupportedLanguage, createAgentEvent, AgentEvent } from "../types";

// Language detection patterns
const LANGUAGE_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  kn: [
    /[\u0C80-\u0CFF]+/, // Kannada Unicode range
    /ನಮಸ್ಕಾರ|ಹೇಗಿದ್ದೀರಾ|ಧನ್ಯವಾದ|ಸರಿ|ಹೌದು|ಇಲ್ಲ/i,
  ],
  hi: [
    /[\u0900-\u097F]+/, // Devanagari Unicode range
    /नमस्ते|कैसे|धन्यवाद|ठीक|हां|नहीं|क्या|कितना/i,
  ],
  te: [
    /[\u0C00-\u0C7F]+/, // Telugu Unicode range
    /నమస్కారం|ధన్యవాదాలు|సరే|అవును|కాదు/i,
  ],
  en: [
    /^[a-zA-Z0-9\s.,!?'"()-]+$/,
    /hello|thank you|okay|yes|no|please|how much|price/i,
  ],
};

// Language-specific greetings and phrases for TTS
export const LANGUAGE_PHRASES: Record<SupportedLanguage, {
  greeting: string;
  thankYou: string;
  askPrice: string;
  isFinalPrice: string;
  tooHigh: string;
  willCallBack: string;
  frequentTraveller: string;
  canBeLower: string;
  oneMinute: string;
}> = {
  kn: {
    greeting: "ನಮಸ್ಕಾರ",
    thankYou: "ಧನ್ಯವಾದಗಳು",
    askPrice: "ದಯವಿಟ್ಟು ದರ ತಿಳಿಸುತ್ತೀರಾ?",
    isFinalPrice: "ಇದು ಫೈನಲ್ ಪ್ರೈಸ್ ಆ?",
    tooHigh: "ಸ್ವಲ್ಪ ಜಾಸ್ತಿ ಆಯ್ತು",
    willCallBack: "ನಾನು ಸ್ವಲ್ಪ ಹೊತ್ತಿನಲ್ಲಿ ಕನ್ಫರ್ಮ್ ಮಾಡಲು ವಾಪಸ್ ಕಾಲ್ ಮಾಡುತ್ತೇನೆ",
    frequentTraveller: "ನಾವು ಫ್ರೀಕ್ವೆಂಟ್ ಟ್ರಾವೆಲರ್ಸ್, ಒಳ್ಳೆ ರೇಟ್ ಕೊಟ್ರೆ ಯಾವಾಗಲೂ ನಿಮ್ಮ ಹತ್ರನೇ ಬುಕ್ ಮಾಡ್ತೀವಿ",
    canBeLower: "ಇನ್ನೂ ಸ್ವಲ್ಪ ಕಡಿಮೆ ಆಗುತ್ತಾ?",
    oneMinute: "ಒಂದು ನಿಮಿಷ ಹೋಲ್ಡ್ ಮಾಡಿ",
  },
  hi: {
    greeting: "नमस्ते",
    thankYou: "धन्यवाद",
    askPrice: "कृपया कीमत बताइए?",
    isFinalPrice: "क्या यह फाइनल प्राइस है?",
    tooHigh: "थोड़ा ज़्यादा है",
    willCallBack: "मैं थोड़ी देर में कन्फर्म करने के लिए वापस कॉल करूंगा",
    frequentTraveller: "हम फ्रीक्वेंट ट्रैवलर हैं, अच्छा रेट मिला तो हमेशा आपसे ही बुक करेंगे",
    canBeLower: "और कम हो सकता है क्या?",
    oneMinute: "एक मिनट होल्ड कीजिए",
  },
  te: {
    greeting: "నమస్కారం",
    thankYou: "ధన్యవాదాలు",
    askPrice: "దయచేసి ధర చెప్పండి?",
    isFinalPrice: "ఇది ఫైనల్ ప్రైస్ ఆ?",
    tooHigh: "కొంచెం ఎక్కువ అయింది",
    willCallBack: "నేను కొంచెం సేపట్లో కన్ఫర్మ్ చేయడానికి తిరిగి కాల్ చేస్తాను",
    frequentTraveller: "మేము ఫ్రీక్వెంట్ ట్రావెలర్స్, మంచి రేట్ ఇస్తే ఎప్పుడూ మీ దగ్గరే బుక్ చేస్తాము",
    canBeLower: "ఇంకా తక్కువ అవుతుందా?",
    oneMinute: "ఒక నిమిషం ఆగండి",
  },
  en: {
    greeting: "Hello",
    thankYou: "Thank you",
    askPrice: "Could you please tell me the price?",
    isFinalPrice: "Is this the final price?",
    tooHigh: "That seems a bit high",
    willCallBack: "I will call back shortly to confirm",
    frequentTraveller: "We are frequent travellers, we will always book with you if you give us a good rate",
    canBeLower: "Can it be any lower?",
    oneMinute: "One minute please",
  },
};

// Deepgram language codes
export const TRANSCRIBER_LANGUAGE_CODES: Record<SupportedLanguage, string> = {
  kn: "kn",
  hi: "hi",
  te: "te",
  en: "en-IN",
};

// Voice IDs for different languages (ElevenLabs)
export const VOICE_IDS: Record<SupportedLanguage, string> = {
  kn: "21m00Tcm4TlvDq8ikWAM", // Rachel - will use multilingual model
  hi: "21m00Tcm4TlvDq8ikWAM",
  te: "21m00Tcm4TlvDq8ikWAM",
  en: "21m00Tcm4TlvDq8ikWAM",
};

// Detect language from text
export function detectLanguage(text: string): SupportedLanguage | null {
  if (!text || text.trim().length === 0) {
    return null;
  }

  // Check for Kannada
  if (LANGUAGE_PATTERNS.kn.some(pattern => pattern.test(text))) {
    return "kn";
  }

  // Check for Hindi
  if (LANGUAGE_PATTERNS.hi.some(pattern => pattern.test(text))) {
    return "hi";
  }

  // Check for Telugu
  if (LANGUAGE_PATTERNS.te.some(pattern => pattern.test(text))) {
    return "te";
  }

  // Check for English
  if (LANGUAGE_PATTERNS.en.some(pattern => pattern.test(text))) {
    return "en";
  }

  return null;
}

// Detect language using LLM for more complex cases
export async function detectLanguageWithLLM(text: string): Promise<SupportedLanguage> {
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0,
  });

  const prompt = `Detect the primary language of this text. The text might be a mix of languages.

Text: "${text}"

Respond with ONLY one of: kannada, hindi, telugu, english`;

  try {
    const response = await model.invoke(prompt);
    const content = (typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content)).toLowerCase().trim();

    if (content.includes("kannada")) return "kn";
    if (content.includes("hindi")) return "hi";
    if (content.includes("telugu")) return "te";
    return "en";
  } catch (error) {
    console.error("Language detection error:", error);
    return "en"; // Default to English
  }
}

// Check if language switch is needed based on vendor response
export async function checkLanguageSwitch(
  vendorResponse: string,
  currentLanguage: SupportedLanguage
): Promise<{
  shouldSwitch: boolean;
  detectedLanguage: SupportedLanguage;
  reason: string;
}> {
  // First try pattern-based detection
  const detectedLanguage = detectLanguage(vendorResponse);

  if (detectedLanguage && detectedLanguage !== currentLanguage) {
    return {
      shouldSwitch: true,
      detectedLanguage,
      reason: `Vendor responded in ${getLanguageName(detectedLanguage)}`,
    };
  }

  // If pattern detection fails, use LLM for mixed language
  if (!detectedLanguage) {
    const llmDetected = await detectLanguageWithLLM(vendorResponse);
    if (llmDetected !== currentLanguage) {
      return {
        shouldSwitch: true,
        detectedLanguage: llmDetected,
        reason: `Vendor appears to prefer ${getLanguageName(llmDetected)}`,
      };
    }
  }

  return {
    shouldSwitch: false,
    detectedLanguage: currentLanguage,
    reason: "No language switch needed",
  };
}

// Get language name for display
export function getLanguageName(code: SupportedLanguage): string {
  const names: Record<SupportedLanguage, string> = {
    kn: "Kannada",
    hi: "Hindi",
    te: "Telugu",
    en: "English",
  };
  return names[code];
}

// Generate language switch event
export function createLanguageSwitchEvent(
  from: SupportedLanguage,
  to: SupportedLanguage,
  reason: string
): AgentEvent {
  return createAgentEvent(
    "language_switched",
    "negotiator",
    `Switching from ${getLanguageName(from)} to ${getLanguageName(to)}: ${reason}`,
    { from, to, reason }
  );
}

// Get prompt additions for specific language
export function getLanguagePromptAdditions(language: SupportedLanguage): string {
  const additions: Record<SupportedLanguage, string> = {
    kn: `
## Language: Kannada (ಕನ್ನಡ)
- Speak in conversational Kannada
- Use common Kannada phrases for negotiation
- Be respectful with "ನೀವು" (formal you)
- Numbers can be in English but units in Kannada
`,
    hi: `
## Language: Hindi (हिंदी)
- Speak in conversational Hindi
- Use common Hindi phrases for negotiation
- Be respectful with "आप" (formal you)
- Numbers can be in English but context in Hindi
`,
    te: `
## Language: Telugu (తెలుగు)
- Speak in conversational Telugu
- Use common Telugu phrases for negotiation
- Be respectful with "మీరు" (formal you)
- Numbers can be in English but context in Telugu
`,
    en: `
## Language: English (Indian English)
- Speak in clear, simple English
- Use Indian English conventions
- Be polite and professional
- Avoid complex vocabulary
`,
  };

  return additions[language];
}
