"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Business, NegotiatorPersona } from "@/types";

interface Message {
  role: "agent" | "vendor" | "human";
  content: string;
  timestamp: Date;
  thinking?: string;
  needsHumanInput?: boolean;
  humanInputReason?: string;
}

interface AgentInfo {
  marketRange: string;
  benchmark: string | null;
  isFirstVendor: boolean;
  strategy: string;
}

interface VendorSimulationPanelProps {
  vendor: Business & {
    ranking?: number;
    scores?: { total: number };
    reasoning?: string;
  };
  context: {
    service: string;
    from: string;
    to?: string;
    date?: string;
    time?: string;
    passengerCount?: number;
    vehicleType?: string;
    tripType?: string;
    luggageInfo?: string;
    expectedPriceLow: number;
    expectedPriceMid: number;
    expectedPriceHigh: number;
    targetPrice: number;
    openingOffer: number;
    lowestPriceSoFar: number | null;
    bestVendorSoFar: string | null;
    vendorStrategy: string;
    callNumber: number;
    totalCalls: number;
  };
  sessionId: string;
  systemPrompt?: string; // Custom prompt from learning feedback
  persona?: NegotiatorPersona; // Negotiator persona
  onCallComplete: (result: {
    vendorId: string;
    vendorName: string;
    quotedPrice: number | null;
    success: boolean;
    notes: string;
    messages?: Array<{ role: string; content: string; thinking?: string }>;
  }) => void;
  onSkip: () => void;
}

export function VendorSimulationPanel({
  vendor,
  context,
  sessionId,
  systemPrompt,
  persona = "preet",
  onCallComplete,
  onSkip,
}: VendorSimulationPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [humanInput, setHumanInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<string>("starting");
  const [quotedPrice, setQuotedPrice] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [showThinking, setShowThinking] = useState(true);
  const [manualPrice, setManualPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [needsHumanInput, setNeedsHumanInput] = useState(false);
  const [humanInputQuestion, setHumanInputQuestion] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const humanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus the appropriate input when loading completes
  useEffect(() => {
    if (!isLoading && !isComplete) {
      // Use setTimeout to ensure DOM is updated before focusing
      setTimeout(() => {
        if (needsHumanInput) {
          humanInputRef.current?.focus();
        } else {
          inputRef.current?.focus();
        }
      }, 100);
    }
  }, [isLoading, isComplete, needsHumanInput]);

  const startCall = useCallback(async () => {
    setIsLoading(true);
    setPhase("starting");
    setMessages([]);
    setQuotedPrice(null);
    setIsComplete(false);
    setNeedsHumanInput(false);
    setHumanInputQuestion("");
    setManualPrice("");
    setNotes("");
    setInput("");
    setHumanInput("");

    try {
      const response = await fetch("/api/simulate-negotiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          sessionId,
          vendorId: vendor.id,
          context: {
            vendorName: vendor.name,
            vendorRating: vendor.rating,
            vendorDistance: vendor.distance,
            ...context,
          },
          systemPrompt, // Pass custom prompt from learning feedback
          persona, // Pass negotiator persona for consistent behavior
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessages([{
          role: "agent",
          content: data.message,
          timestamp: new Date(),
          thinking: data.thinking,
        }]);
        setPhase(data.phase);
        setAgentInfo(data.agentInfo);
      }
    } catch (error) {
      console.error("Start call error:", error);
    } finally {
      setIsLoading(false);
      // Focus is handled by useEffect when isLoading changes
    }
  }, [sessionId, vendor.id, vendor.name, vendor.rating, vendor.distance, context, systemPrompt]);

  // Start the call when vendor changes
  // Note: We intentionally exclude startCall from deps to prevent double-calls
  // when the callback reference changes but vendor.id stays the same
  useEffect(() => {
    startCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isComplete) return;

    const vendorResponse = input.trim();
    setInput("");
    setIsLoading(true);

    // Add vendor message immediately
    setMessages((prev) => [...prev, {
      role: "vendor",
      content: vendorResponse,
      timestamp: new Date(),
    }]);

    try {
      const response = await fetch("/api/simulate-negotiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "respond",
          sessionId,
          vendorId: vendor.id,
          vendorResponse,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Check if agent needs human input
        if (data.needsHumanInput) {
          setNeedsHumanInput(true);
          setHumanInputQuestion(data.humanInputReason || "Agent needs your input");
          setMessages((prev) => [...prev, {
            role: "agent",
            content: data.message,
            timestamp: new Date(),
            thinking: data.thinking,
            needsHumanInput: true,
            humanInputReason: data.humanInputReason,
          }]);
        } else {
          setMessages((prev) => [...prev, {
            role: "agent",
            content: data.message,
            timestamp: new Date(),
            thinking: data.thinking,
          }]);
        }

        setPhase(data.phase);
        // Always update the detected price if a new one is extracted
        if (data.extractedPrice) {
          setQuotedPrice(data.extractedPrice);
        } else if (data.quotedPrice) {
          setQuotedPrice(data.quotedPrice);
        }
        setIsComplete(data.isComplete);
        setAgentInfo(data.agentInfo);
      }
    } catch (error) {
      console.error("Response error:", error);
    } finally {
      setIsLoading(false);
      // Focus is handled by useEffect when isLoading changes
    }
  };

  const handleHumanInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!humanInput.trim() || isLoading) return;

    const humanResponse = humanInput.trim();
    setHumanInput("");
    setIsLoading(true);

    // Add human message to show user's input
    setMessages((prev) => [...prev, {
      role: "human",
      content: `[User to Agent]: ${humanResponse}`,
      timestamp: new Date(),
    }]);

    try {
      const response = await fetch("/api/simulate-negotiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "human_input",
          sessionId,
          vendorId: vendor.id,
          humanResponse,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Clear the needs human input state
        setNeedsHumanInput(false);
        setHumanInputQuestion("");

        setMessages((prev) => [...prev, {
          role: "agent",
          content: data.message,
          timestamp: new Date(),
          thinking: data.thinking,
        }]);

        setPhase(data.phase);
        if (data.quotedPrice) {
          setQuotedPrice(data.quotedPrice);
        }
        setAgentInfo(data.agentInfo);
      }
    } catch (error) {
      console.error("Human input error:", error);
    } finally {
      setIsLoading(false);
      // Focus is handled by useEffect when isLoading changes
    }
  };

  const handleEndCall = async () => {
    const finalPrice = manualPrice ? parseInt(manualPrice, 10) : quotedPrice;

    try {
      const response = await fetch("/api/simulate-negotiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end",
          sessionId,
          vendorId: vendor.id,
          finalPrice,
          notes,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onCallComplete({
          vendorId: vendor.id,
          vendorName: vendor.name,
          quotedPrice: finalPrice,
          success: data.result.success,
          notes,
          messages: data.result.messages, // Include messages for learning analysis
        });
      }
    } catch (error) {
      console.error("End call error:", error);
    }
  };

  const getPhaseColor = (p: string) => {
    switch (p) {
      case "greeting": return "bg-blue-100 text-blue-700";
      case "inquiry": return "bg-yellow-100 text-yellow-700";
      case "negotiation": return "bg-orange-100 text-orange-700";
      case "closing": return "bg-green-100 text-green-700";
      case "ended": return "bg-gray-100 text-gray-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getMessageStyle = (role: string) => {
    switch (role) {
      case "agent":
        return "bg-blue-100 text-blue-900 rounded-tl-md";
      case "vendor":
        return "bg-green-100 text-green-900 rounded-tr-md";
      case "human":
        return "bg-purple-100 text-purple-900 rounded-tr-md";
      default:
        return "bg-gray-100 text-gray-900";
    }
  };

  const getAvatarStyle = (role: string) => {
    switch (role) {
      case "agent":
        return "bg-blue-500 text-white";
      case "vendor":
        return "bg-green-500 text-white";
      case "human":
        return "bg-purple-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getAvatarIcon = (role: string) => {
    switch (role) {
      case "agent": return "🤖";
      case "vendor": return "👤";
      case "human": return "✋";
      default: return "?";
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📞</span>
              <h2 className="font-bold">Simulated Call</h2>
            </div>
            <p className="text-blue-100 text-xs">
              Call {context.callNumber} of {context.totalCalls} • You are: {vendor.name}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPhaseColor(phase)}`}>
            {phase.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Agent Info Panel */}
      {agentInfo && (
        <div className="bg-gray-50 p-2 border-b">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-semibold text-gray-600 uppercase">Agent Strategy</h3>
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showThinking ? "Hide Thinking" : "Show Thinking"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="bg-white px-2 py-1 rounded border">
              <span className="text-gray-500">Market:</span>
              <span className="ml-1 font-bold text-blue-600">{agentInfo.marketRange}</span>
            </div>
            <div className="bg-white px-2 py-1 rounded border">
              <span className="text-gray-500">Benchmark:</span>
              <span className="ml-1 font-bold text-green-600">{agentInfo.benchmark || "None"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Current Price */}
      {quotedPrice && (
        <div className="bg-yellow-50 p-2 border-b flex items-center justify-between">
          <div className="text-sm">
            <span className="text-yellow-700">Detected Price:</span>
            <span className="ml-2 font-bold text-yellow-800">₹{quotedPrice}</span>
          </div>
          {agentInfo && (() => {
            // Parse market range to get high value for comparison
            const rangeMatch = agentInfo.marketRange.match(/₹(\d+)\s*-\s*₹(\d+)/);
            const marketLow = rangeMatch ? parseInt(rangeMatch[1]) : 0;
            const marketHigh = rangeMatch ? parseInt(rangeMatch[2]) : 0;
            const benchmarkPrice = agentInfo.benchmark ? parseInt(agentInfo.benchmark.replace(/[₹,]/g, "")) : null;

            // Compare against benchmark if available, otherwise use market range
            const comparePrice = benchmarkPrice || marketHigh;

            return (
              <span className={`text-xs px-2 py-1 rounded ${
                quotedPrice <= marketLow
                  ? "bg-green-100 text-green-700"
                  : quotedPrice <= comparePrice
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-red-100 text-red-700"
              }`}>
                {quotedPrice <= marketLow
                  ? "✓ Below Market Low"
                  : quotedPrice <= comparePrice
                  ? "~ Within Range"
                  : "✗ Above Range"}
              </span>
            );
          })()}
        </div>
      )}

      {/* Human Input Needed Banner */}
      {needsHumanInput && (
        <div className="bg-purple-100 p-2 border-b border-purple-200">
          <div className="flex items-center gap-2 text-purple-800">
            <span className="text-lg">✋</span>
            <div>
              <p className="font-medium text-xs">Agent needs your input!</p>
              <p className="text-xs text-purple-600">{humanInputQuestion}</p>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {messages.map((message, index) => (
          <div key={index}>
            {/* Thinking bubble (for agent messages) */}
            {showThinking && message.role === "agent" && message.thinking && (
              <div className="mb-2 ml-10 bg-purple-50 rounded-lg p-2 border border-purple-100 text-xs text-purple-700">
                <span className="font-medium">🧠 Agent Thinking:</span>
                <p className="mt-1 italic">{message.thinking}</p>
              </div>
            )}

            {/* Message bubble */}
            <div className={`flex ${message.role === "agent" ? "justify-start" : "justify-end"}`}>
              <div className={`flex items-start gap-2 max-w-[80%] ${message.role === "agent" ? "" : "flex-row-reverse"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${getAvatarStyle(message.role)}`}>
                  {getAvatarIcon(message.role)}
                </div>
                <div className={`rounded-2xl px-4 py-2 ${getMessageStyle(message.role)}`}>
                  <div className="text-xs text-gray-500 mb-1">
                    {message.role === "agent" ? "AI Agent" : message.role === "human" ? "You (to Agent)" : `You (${vendor.name})`}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-blue-100 rounded-2xl px-4 py-3 rounded-tl-md">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input / End Call */}
      <div className="border-t bg-gray-50 p-3">
        {!isComplete ? (
          <>
            {/* Human Input (when agent needs info) */}
            {needsHumanInput && (
              <form onSubmit={handleHumanInputSubmit} className="mb-3">
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-200 mb-2">
                  <p className="text-xs text-purple-700 mb-2">
                    <span className="font-medium">✋ Provide info to agent:</span> {humanInputQuestion}
                  </p>
                  <div className="flex gap-2">
                    <input
                      ref={humanInputRef}
                      type="text"
                      value={humanInput}
                      onChange={(e) => setHumanInput(e.target.value)}
                      placeholder="Type your answer for the agent..."
                      disabled={isLoading}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm bg-white text-gray-900 placeholder-gray-500"
                    />
                    <button
                      type="submit"
                      disabled={!humanInput.trim() || isLoading}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-300 text-sm"
                    >
                      Send to Agent
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Vendor Input */}
            <form onSubmit={handleSubmit} className="mb-2">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Respond as the vendor..."
                  disabled={isLoading || needsHumanInput}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 bg-white text-gray-900 placeholder-gray-500"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading || needsHumanInput}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300"
                >
                  Send
                </button>
              </div>
            </form>

            {/* End Call Section */}
            <div className="pt-3 border-t flex justify-end">
              <button
                onClick={handleEndCall}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 text-sm"
              >
                End Call
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-green-600 font-medium mb-2">✅ Call completed!</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleEndCall}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                Save & Continue
              </button>
            </div>
          </div>
        )}

        {/* Skip button */}
        <div className="mt-2 text-center">
          <button
            onClick={onSkip}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Skip this vendor →
          </button>
        </div>
      </div>
    </div>
  );
}
