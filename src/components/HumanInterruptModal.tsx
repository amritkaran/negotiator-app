"use client";

import { useState } from "react";

interface HumanInterruptModalProps {
  isOpen: boolean;
  question: string;
  interruptId: string;
  sessionId: string;
  onSubmit: (response: string) => void;
  onClose: () => void;
}

export function HumanInterruptModal({
  isOpen,
  question,
  interruptId,
  sessionId,
  onSubmit,
  onClose,
}: HumanInterruptModalProps) {
  const [response, setResponse] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!response.trim()) return;

    setIsSubmitting(true);

    try {
      // Submit the response to the API
      const res = await fetch("/api/human-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          interruptId,
          response: response.trim(),
        }),
      });

      if (res.ok) {
        onSubmit(response.trim());
        setResponse("");

        // Also update the agent stream to continue
        await fetch("/api/agent-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            action: "human_response",
            humanResponse: response.trim(),
          }),
        });
      }
    } catch (error) {
      console.error("Submit error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick response suggestions based on common questions
  const getSuggestions = (q: string): string[] => {
    const questionLower = q.toLowerCase();

    if (questionLower.includes("address") || questionLower.includes("location")) {
      return [
        "Near main road",
        "Opposite to the mall",
        "Next to the bus stop",
      ];
    }
    if (questionLower.includes("advance") || questionLower.includes("payment")) {
      return [
        "Will pay full amount at pickup",
        "Can pay 50% advance online",
        "Cash payment only",
      ];
    }
    if (questionLower.includes("child") || questionLower.includes("seat")) {
      return ["No child seat needed", "Yes, need child seat", "Booster seat please"];
    }
    if (questionLower.includes("luggage") || questionLower.includes("bag")) {
      return ["2 medium bags", "1 large suitcase", "Small cabin bag only"];
    }
    if (questionLower.includes("ac") || questionLower.includes("air")) {
      return ["AC required", "Non-AC is fine", "Prefer AC if available"];
    }

    return [];
  };

  const suggestions = getSuggestions(question);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-yellow-500 text-white p-4">
          <div className="flex items-center">
            <span className="text-2xl mr-3">✋</span>
            <div>
              <h2 className="font-bold text-lg">Human Input Required</h2>
              <p className="text-yellow-100 text-sm">
                The vendor asked a question that needs your answer
              </p>
            </div>
          </div>
        </div>

        {/* Question */}
        <div className="p-6">
          <div className="bg-gray-100 rounded-lg p-4 mb-4">
            <p className="text-gray-500 text-sm mb-1">Vendor asked:</p>
            <p className="text-gray-800 font-medium">{question}</p>
          </div>

          {/* Quick Suggestions */}
          {suggestions.length > 0 && (
            <div className="mb-4">
              <p className="text-gray-500 text-xs mb-2">Quick responses:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setResponse(suggestion)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Response Input */}
          <form onSubmit={handleSubmit}>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Your response:
            </label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Type your answer here..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none resize-none"
              rows={3}
              disabled={isSubmitting}
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                disabled={isSubmitting}
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={!response.trim() || isSubmitting}
                className="px-6 py-2 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin h-4 w-4 mr-2"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Sending...
                  </span>
                ) : (
                  "Send Response"
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer Info */}
        <div className="bg-gray-50 px-6 py-3 text-xs text-gray-500">
          The AI agent is on hold waiting for your response. The call will
          resume automatically after you submit.
        </div>
      </div>
    </div>
  );
}
