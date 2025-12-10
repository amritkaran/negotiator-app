/**
 * Helper functions for displaying VAPI endedReason values in a user-friendly way
 *
 * VAPI provides 50+ different endedReason codes. This module maps them to
 * user-friendly labels, colors, and descriptions for UI display.
 */

export interface EndedReasonDisplay {
  label: string;        // Short user-friendly label
  description: string;  // Longer explanation
  color: string;        // Tailwind color classes for badge
  icon: string;         // Emoji icon
  category: "success" | "customer" | "voicemail" | "timeout" | "error" | "forwarded" | "unknown";
}

/**
 * Get display information for a VAPI endedReason code
 */
export function getEndedReasonDisplay(endedReason: string | null | undefined): EndedReasonDisplay {
  if (!endedReason) {
    return {
      label: "Unknown",
      description: "Call ended for unknown reason",
      color: "bg-gray-100 text-gray-700",
      icon: "❓",
      category: "unknown",
    };
  }

  // Success - Call completed normally
  if (
    endedReason === "assistant-ended-call" ||
    endedReason === "assistant-ended-call-after-message-spoken" ||
    endedReason === "assistant-ended-call-with-hangup-task" ||
    endedReason === "assistant-said-end-call-phrase"
  ) {
    return {
      label: "Completed",
      description: "Call ended normally by the assistant",
      color: "bg-green-100 text-green-800",
      icon: "✅",
      category: "success",
    };
  }

  // Customer ended call
  if (endedReason === "customer-ended-call") {
    return {
      label: "Customer Hung Up",
      description: "The vendor ended the call",
      color: "bg-yellow-100 text-yellow-800",
      icon: "📞",
      category: "customer",
    };
  }

  // Customer didn't answer
  if (endedReason === "customer-did-not-answer") {
    return {
      label: "No Answer",
      description: "The vendor did not answer the call",
      color: "bg-orange-100 text-orange-800",
      icon: "📵",
      category: "customer",
    };
  }

  // Customer busy
  if (endedReason === "customer-busy") {
    return {
      label: "Line Busy",
      description: "The vendor's line was busy",
      color: "bg-orange-100 text-orange-800",
      icon: "🔴",
      category: "customer",
    };
  }

  // Voicemail
  if (endedReason === "voicemail") {
    return {
      label: "Voicemail",
      description: "Call was sent to voicemail",
      color: "bg-yellow-100 text-yellow-800",
      icon: "📬",
      category: "voicemail",
    };
  }

  // Timeout - max duration
  if (endedReason === "exceeded-max-duration") {
    return {
      label: "Time Limit",
      description: "Call reached the maximum allowed duration",
      color: "bg-orange-100 text-orange-800",
      icon: "⏱️",
      category: "timeout",
    };
  }

  // Timeout - silence
  if (endedReason === "silence-timed-out") {
    return {
      label: "Silence Timeout",
      description: "Call ended due to prolonged silence",
      color: "bg-orange-100 text-orange-800",
      icon: "🔇",
      category: "timeout",
    };
  }

  // Call forwarded
  if (
    endedReason === "assistant-forwarded-call" ||
    endedReason === "assistant-request-returned-forwarding-phone-number"
  ) {
    return {
      label: "Forwarded",
      description: "Call was transferred to another number",
      color: "bg-blue-100 text-blue-800",
      icon: "↪️",
      category: "forwarded",
    };
  }

  // Manually canceled
  if (endedReason === "manually-canceled") {
    return {
      label: "Canceled",
      description: "Call was manually canceled",
      color: "bg-gray-100 text-gray-700",
      icon: "🚫",
      category: "customer",
    };
  }

  // Twilio errors
  if (endedReason.startsWith("twilio-")) {
    if (endedReason === "twilio-failed-to-connect-call") {
      return {
        label: "Connection Failed",
        description: "Twilio failed to establish the call connection",
        color: "bg-red-100 text-red-800",
        icon: "❌",
        category: "error",
      };
    }
    if (endedReason === "twilio-reported-customer-misdialed") {
      return {
        label: "Invalid Number",
        description: "The phone number appears to be invalid",
        color: "bg-red-100 text-red-800",
        icon: "❌",
        category: "error",
      };
    }
    return {
      label: "Carrier Error",
      description: "Call failed due to a carrier issue",
      color: "bg-red-100 text-red-800",
      icon: "📡",
      category: "error",
    };
  }

  // Vonage errors
  if (endedReason.startsWith("vonage-")) {
    if (endedReason === "vonage-completed") {
      return {
        label: "Completed",
        description: "Call completed successfully via Vonage",
        color: "bg-green-100 text-green-800",
        icon: "✅",
        category: "success",
      };
    }
    return {
      label: "Carrier Error",
      description: "Call failed due to a carrier issue (Vonage)",
      color: "bg-red-100 text-red-800",
      icon: "📡",
      category: "error",
    };
  }

  // Pipeline errors (provider keys)
  if (endedReason.startsWith("pipeline-error-")) {
    const errorType = endedReason.replace("pipeline-error-", "");

    if (errorType.includes("transcriber")) {
      return {
        label: "Transcription Error",
        description: "Speech-to-text service encountered an error",
        color: "bg-red-100 text-red-800",
        icon: "🎤",
        category: "error",
      };
    }
    if (errorType.includes("llm") || errorType.includes("openai") || errorType.includes("anthropic")) {
      return {
        label: "AI Error",
        description: "Language model service encountered an error",
        color: "bg-red-100 text-red-800",
        icon: "🤖",
        category: "error",
      };
    }
    if (errorType.includes("voice") || errorType.includes("eleven-labs") || errorType.includes("azure")) {
      return {
        label: "Voice Error",
        description: "Text-to-speech service encountered an error",
        color: "bg-red-100 text-red-800",
        icon: "🔊",
        category: "error",
      };
    }

    return {
      label: "Pipeline Error",
      description: `Technical error: ${errorType}`,
      color: "bg-red-100 text-red-800",
      icon: "⚙️",
      category: "error",
    };
  }

  // VAPI fault errors
  if (endedReason.includes("vapifault") || endedReason.includes("providerfault")) {
    return {
      label: "Service Error",
      description: "An error occurred in the voice service",
      color: "bg-red-100 text-red-800",
      icon: "⚠️",
      category: "error",
    };
  }

  // Assistant errors
  if (endedReason.startsWith("assistant-")) {
    if (endedReason.includes("error") || endedReason.includes("failed") || endedReason.includes("timed-out")) {
      return {
        label: "Bot Error",
        description: "The AI assistant encountered an error",
        color: "bg-red-100 text-red-800",
        icon: "🤖",
        category: "error",
      };
    }
    if (endedReason.includes("not-found") || endedReason.includes("not-valid") || endedReason.includes("not-provided")) {
      return {
        label: "Config Error",
        description: "Assistant configuration issue",
        color: "bg-red-100 text-red-800",
        icon: "⚙️",
        category: "error",
      };
    }
  }

  // Call start errors
  if (endedReason.startsWith("call.start.error-") || endedReason.startsWith("call-start-error-")) {
    if (endedReason.includes("outbound-daily-limit")) {
      return {
        label: "Daily Limit",
        description: "Outbound call daily limit reached",
        color: "bg-orange-100 text-orange-800",
        icon: "🚫",
        category: "error",
      };
    }
    return {
      label: "Start Failed",
      description: "Call failed to start",
      color: "bg-red-100 text-red-800",
      icon: "❌",
      category: "error",
    };
  }

  // Database error
  if (endedReason === "database-error") {
    return {
      label: "Database Error",
      description: "A database error occurred during the call",
      color: "bg-red-100 text-red-800",
      icon: "🗄️",
      category: "error",
    };
  }

  // Worker shutdown
  if (endedReason === "worker-shutdown") {
    return {
      label: "Service Restart",
      description: "The call service was restarted",
      color: "bg-orange-100 text-orange-800",
      icon: "🔄",
      category: "error",
    };
  }

  // Unknown error
  if (endedReason === "unknown-error") {
    return {
      label: "Unknown Error",
      description: "An unexpected error occurred",
      color: "bg-red-100 text-red-800",
      icon: "❓",
      category: "error",
    };
  }

  // Default fallback - try to make it readable
  const readableLabel = endedReason
    .replace(/^(call\.|pipeline-|assistant-|customer-)/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 20);

  return {
    label: readableLabel || "Unknown",
    description: `Call ended: ${endedReason}`,
    color: "bg-gray-100 text-gray-700",
    icon: "ℹ️",
    category: "unknown",
  };
}

/**
 * Check if the endedReason indicates a successful call completion
 */
export function isSuccessfulEnd(endedReason: string | null | undefined): boolean {
  if (!endedReason) return false;

  return (
    endedReason === "assistant-ended-call" ||
    endedReason === "assistant-ended-call-after-message-spoken" ||
    endedReason === "assistant-ended-call-with-hangup-task" ||
    endedReason === "assistant-said-end-call-phrase" ||
    endedReason === "vonage-completed" ||
    endedReason === "customer-ended-call" // Customer may have hung up after getting info
  );
}

/**
 * Check if the endedReason indicates the vendor couldn't be reached
 */
export function isUnreachable(endedReason: string | null | undefined): boolean {
  if (!endedReason) return false;

  return (
    endedReason === "customer-did-not-answer" ||
    endedReason === "customer-busy" ||
    endedReason === "voicemail" ||
    endedReason.includes("failed-to-connect")
  );
}

/**
 * Check if the endedReason indicates a technical error worth retrying
 */
export function isRetryableError(endedReason: string | null | undefined): boolean {
  if (!endedReason) return false;

  return (
    endedReason.includes("error") ||
    endedReason.includes("failed") ||
    endedReason === "worker-shutdown" ||
    endedReason === "silence-timed-out"
  );
}
