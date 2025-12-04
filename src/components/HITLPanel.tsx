"use client";

import { useState, useEffect, useCallback } from "react";

interface HITLRequest {
  callId: string;
  question: string;
  vendorName: string;
  timestamp: number;
  waitingSeconds: number;
}

export default function HITLPanel() {
  const [requests, setRequests] = useState<HITLRequest[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [isPolling, setIsPolling] = useState(true);

  // Poll for pending requests
  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/hitl");
      if (res.ok) {
        const data = await res.json();
        setRequests(data.pending || []);
      }
    } catch (error) {
      console.error("Failed to fetch HITL requests:", error);
    }
  }, []);

  useEffect(() => {
    if (!isPolling) return;

    // Initial fetch
    fetchRequests();

    // Poll every 1 second
    const interval = setInterval(fetchRequests, 1000);

    return () => clearInterval(interval);
  }, [isPolling, fetchRequests]);

  // Submit answer
  const submitAnswer = async (callId: string) => {
    const answer = answers[callId];
    if (!answer?.trim()) return;

    setSubmitting((prev) => ({ ...prev, [callId]: true }));

    try {
      const res = await fetch("/api/hitl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, answer: answer.trim() }),
      });

      if (res.ok) {
        // Clear the answer and remove from local state
        setAnswers((prev) => {
          const newAnswers = { ...prev };
          delete newAnswers[callId];
          return newAnswers;
        });
        setRequests((prev) => prev.filter((r) => r.callId !== callId));
      } else {
        const error = await res.json();
        alert(`Failed to submit: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to submit answer:", error);
      alert("Failed to submit answer");
    } finally {
      setSubmitting((prev) => ({ ...prev, [callId]: false }));
    }
  };

  // Play notification sound when new request comes in
  useEffect(() => {
    if (requests.length > 0) {
      // Browser notification
      if (Notification.permission === "granted") {
        new Notification("HITL Request", {
          body: `Vendor asking: ${requests[0].question}`,
          requireInteraction: true,
        });
      }
    }
  }, [requests.length]);

  // Request notification permission on mount
  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Hide panel completely when no pending requests
  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-[500px] overflow-y-auto bg-white rounded-lg shadow-2xl border-2 border-orange-500 z-50 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="sticky top-0 bg-orange-500 text-white px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">Voice Bot Needs Help</span>
          <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full animate-pulse">
            {requests.length} pending
          </span>
        </div>
        <button
          onClick={() => setIsPolling(!isPolling)}
          className={`text-xs px-2 py-1 rounded ${
            isPolling ? "bg-green-600" : "bg-gray-600"
          }`}
        >
          {isPolling ? "Live" : "Paused"}
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="space-y-4">
          {requests.map((request) => (
              <div
                key={request.callId}
                className="border-2 border-orange-300 rounded-lg p-3 bg-orange-50"
              >
                {/* Vendor info */}
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {request.vendorName}
                  </span>
                  <span className="text-xs text-red-600 font-bold animate-pulse">
                    {request.waitingSeconds}s waiting
                  </span>
                </div>

                {/* Question */}
                <div className="bg-white p-2 rounded border mb-3">
                  <p className="text-sm text-gray-600 mb-1">Vendor asked:</p>
                  <p className="font-medium text-gray-900">{request.question}</p>
                </div>

                {/* Answer input */}
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Type your answer in Hindi..."
                    value={answers[request.callId] || ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [request.callId]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        submitAnswer(request.callId);
                      }
                    }}
                    className="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitAnswer(request.callId)}
                      disabled={
                        !answers[request.callId]?.trim() ||
                        submitting[request.callId]
                      }
                      className="flex-1 bg-orange-500 text-white px-3 py-2 rounded text-sm font-medium hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {submitting[request.callId] ? "Sending..." : "Send Answer"}
                    </button>
                  </div>
                  {/* Quick responses */}
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [request.callId]: "मेन रोड पर पिकअप होगा",
                        }))
                      }
                      className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200"
                    >
                      Main road pickup
                    </button>
                    <button
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [request.callId]: "Metro station के पास",
                        }))
                      }
                      className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200"
                    >
                      Near metro
                    </button>
                    <button
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [request.callId]:
                            "कॉल बैक करते वक्त बता दूंगा",
                        }))
                      }
                      className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200"
                    >
                      Will share on callback
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
