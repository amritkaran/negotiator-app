"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage as ChatMessageType, Business, UserRequirement } from "@/types";
import { ChatMessage } from "./ChatMessage";
import { BookingForm } from "./BookingForm";
import { AgentWorkflowPanel, AgentState, WorkflowEvent, AgentStatus } from "./AgentWorkflowPanel";
import { VendorSimulationPanel } from "./VendorSimulationPanel";
import { LearningPanel } from "./LearningPanel";
import { PerformanceGraphs } from "./PerformanceGraphs";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { PromptChangeReview } from "./PromptChangeReview";
import Link from "next/link";
import {
  PerformanceStore,
  SimulationMetrics,
  loadPerformanceStore,
  savePerformanceStore,
  addSimulationMetrics,
  addPromptVersion,
  getCurrentPrompt,
} from "@/lib/performance-store";
import { v4 as uuidv4 } from "uuid";

// Learning analysis types
interface LearningAnalysis {
  callAnalysis: {
    analyses: Array<{
      vendorName: string;
      priceObtained: number | null;
      tacticsUsed: string[];
      effectiveMoves: string[];
      missedOpportunities: string[];
      overallScore: number;
      vendorExperience?: {
        score: number;
        repetitionsRequired: number;
        misunderstandings: string[];
        frustrationIndicators: string[];
      };
    }>;
    overallReasoning: string;
    vendorExperienceSummary?: {
      avgScore: number;
      totalRepetitions: number;
      callsWithFrustration: number;
      topIssues: string[];
      suggestions: string[];
    };
  };
  safetyCheck: {
    issues: Array<{
      severity: "low" | "medium" | "high";
      issue: string;
      recommendation: string;
    }>;
    reasoning: string;
    passed: boolean;
  };
  promptEnhancements: {
    improvements: Array<{
      area: string;
      currentBehavior: string;
      suggestedImprovement: string;
      expectedImpact: string;
      priority: "low" | "medium" | "high";
    }>;
    reasoning: string;
  };
  summary: string;
}

type AppStage =
  | "service_selection"
  | "booking_form"
  | "chat"
  | "researching"
  | "businesses_found"
  | "simulating"
  | "calling"
  | "results";

interface CallStatus {
  callId: string;
  businessId: string;
  status: string;
  quote?: { price: number | null; notes: string } | null;
}

// Call Decision State - for "one call at a time" flow
interface CallDecisionInfo {
  awaitingDecision: boolean;
  lastCallSummary: {
    vendorName: string;
    vendorPhone: string;
    quotedPrice: number | null;
    negotiatedPrice: number | null;
    callDuration: number;
    outcome: "success" | "failed" | "no_answer" | "busy";
    highlights: string[];
  } | null;
  vendorsRemaining: number;
  currentBestPrice: number | null;
  currentBestVendor: string | null;
}

interface RankedBusiness extends Business {
  ranking: number;
  scores: {
    proximity: number;
    rating: number;
    reviews: number;
    analysis: number;
    total: number;
  };
  reasoning: string;
}

interface PriceIntel {
  estimatedDistance: number;
  estimatedDuration: number;
  baselinePrice: { low: number; mid: number; high: number };
  factors: string[];
  confidence: "high" | "medium" | "low";
}

interface Strategy {
  businessId: string;
  strategy: string;
  targetPrice: number;
  openingOffer: number;
}

interface ResearchStep {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "error";
  result?: string;
}

// Labor illusion messages for each learning phase
const learningIllusionMessages = {
  idle: ["Preparing analysis..."],
  call_analyzer: [
    "Reading negotiation transcripts...",
    "Analyzing conversation patterns...",
    "Evaluating price negotiation tactics...",
    "Identifying effective moves...",
    "Detecting missed opportunities...",
    "Calculating negotiation scores...",
    "Comparing with best practices...",
    "Assessing vendor responses...",
  ],
  safety_checker: [
    "Scanning for policy violations...",
    "Checking booking boundaries...",
    "Verifying price disclosure rules...",
    "Analyzing vendor experience...",
    "Reviewing conversation tone...",
    "Checking for repetition issues...",
  ],
  prompt_enhancer: [
    "Analyzing improvement areas...",
    "Generating enhancement suggestions...",
    "Prioritizing fixes by impact...",
    "Drafting prompt modifications...",
    "Calculating expected improvements...",
  ],
  complete: ["Analysis complete!"],
};

// Learning Labor Illusion Component - shown in middle panel during learning analysis
function LearningLaborIllusion({ currentStep }: { currentStep: string }) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);

  const messages = learningIllusionMessages[currentStep as keyof typeof learningIllusionMessages] || learningIllusionMessages.idle;
  const currentMessage = messages[currentMessageIndex % messages.length];

  useEffect(() => {
    // Reset state when step changes
    setCurrentMessageIndex(0);
    setCompletedTasks([]);
  }, [currentStep]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => {
        const nextIndex = (prev + 1) % messages.length;
        // Add current message to completed tasks
        if (prev < messages.length - 1) {
          setCompletedTasks((prevTasks) => {
            const newTasks = [...prevTasks, messages[prev]];
            return newTasks.slice(-6); // Keep last 6 tasks
          });
        }
        return nextIndex;
      });
    }, 2000); // Change message every 2 seconds

    return () => clearInterval(interval);
  }, [messages]);

  const getStepStatus = (step: string) => {
    const steps = ["call_analyzer", "safety_checker", "prompt_enhancer"];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);

    if (currentStep === "complete") return "completed";
    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "running";
    return "pending";
  };

  return (
    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-6 shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative">
          <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-2xl">🧠</span>
          </div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
        </div>
        <div>
          <h3 className="font-bold text-lg text-gray-800">Learning Agent Active</h3>
          <p className="text-sm text-gray-500">GPT-4o is analyzing your negotiations</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-6 bg-white rounded-lg p-3">
        {[
          { id: "call_analyzer", name: "Call Analysis", icon: "📊" },
          { id: "safety_checker", name: "Safety Check", icon: "🛡️" },
          { id: "prompt_enhancer", name: "Improvements", icon: "✨" },
        ].map((step, index) => {
          const status = getStepStatus(step.id);
          return (
            <div key={step.id} className="flex items-center">
              <div className={`
                flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                ${status === "running" ? "bg-purple-100 text-purple-700 animate-pulse font-semibold" : ""}
                ${status === "completed" ? "bg-green-100 text-green-700" : ""}
                ${status === "pending" ? "bg-gray-100 text-gray-400" : ""}
              `}>
                <span>{step.icon}</span>
                <span className="hidden sm:inline">{step.name}</span>
                {status === "completed" && <span className="text-green-600">✓</span>}
              </div>
              {index < 2 && (
                <div className={`w-6 h-0.5 mx-1 ${status === "completed" ? "bg-green-400" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Current Task */}
      <div className="bg-white rounded-lg p-4 mb-4 border border-purple-100">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
          <span className="text-gray-700 font-medium">{currentMessage}</span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
            style={{
              width: `${((currentMessageIndex + 1) / messages.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Completed Tasks Feed */}
      <div className="bg-white/50 rounded-lg p-4 max-h-48 overflow-y-auto">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Recent Activity
        </div>
        <div className="space-y-2">
          {completedTasks.map((task, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 text-sm text-gray-600"
              style={{ opacity: 1 - (completedTasks.length - 1 - idx) * 0.15 }}
            >
              <span className="text-green-500">✓</span>
              <span>{task.replace("...", "")}</span>
            </div>
          ))}
          {completedTasks.length === 0 && (
            <div className="text-sm text-gray-400 italic">Starting analysis...</div>
          )}
        </div>
      </div>

      {/* Estimated Time */}
      <div className="mt-4 text-center">
        <span className="text-xs text-gray-400 bg-white px-3 py-1 rounded-full">
          Typically completes in 10-20 seconds
        </span>
      </div>
    </div>
  );
}

// Call Decision UI Component - shown after each call in "one call at a time" flow
function CallDecisionUI({
  callDecision,
  onContinue,
  onStop,
}: {
  callDecision: CallDecisionInfo;
  onContinue: () => void;
  onStop: () => void;
}) {
  const summary = callDecision.lastCallSummary;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6 shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
          <span className="text-2xl">📞</span>
        </div>
        <div>
          <h3 className="font-bold text-lg text-gray-800">Call Completed</h3>
          <p className="text-sm text-gray-500">Review the result and decide next steps</p>
        </div>
      </div>

      {/* Call Summary */}
      {summary && (
        <div className="bg-white rounded-lg p-4 mb-4 border border-blue-100">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h4 className="font-semibold text-gray-800">{summary.vendorName}</h4>
              <p className="text-xs text-gray-500">{summary.vendorPhone}</p>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              summary.outcome === "success"
                ? "bg-green-100 text-green-700"
                : summary.outcome === "failed"
                ? "bg-red-100 text-red-700"
                : "bg-yellow-100 text-yellow-700"
            }`}>
              {summary.outcome === "success" ? "✅ Success" :
               summary.outcome === "failed" ? "❌ Failed" :
               summary.outcome === "no_answer" ? "📵 No Answer" : "📞 Busy"}
            </span>
          </div>

          {summary.outcome === "success" && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-50 rounded p-2">
                <div className="text-xs text-gray-500">Quoted Price</div>
                <div className="font-bold text-lg text-gray-800">
                  {summary.quotedPrice ? `₹${summary.quotedPrice.toLocaleString()}` : "N/A"}
                </div>
              </div>
              <div className="bg-green-50 rounded p-2">
                <div className="text-xs text-gray-500">Negotiated Price</div>
                <div className="font-bold text-lg text-green-700">
                  {summary.negotiatedPrice ? `₹${summary.negotiatedPrice.toLocaleString()}` : "N/A"}
                </div>
              </div>
            </div>
          )}

          {summary.highlights.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Highlights</div>
              <ul className="text-sm text-gray-600 space-y-1">
                {summary.highlights.map((highlight, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-blue-500">•</span>
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-gray-400 mt-2">
            Duration: {Math.floor(summary.callDuration / 60)}m {summary.callDuration % 60}s
          </div>
        </div>
      )}

      {/* Current Best Deal */}
      {callDecision.currentBestPrice && (
        <div className="bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-3 mb-4 border border-green-200">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <div>
              <div className="text-xs text-green-700">Current Best Deal</div>
              <div className="font-bold text-green-800">
                {callDecision.currentBestVendor} - ₹{callDecision.currentBestPrice.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remaining Vendors */}
      <div className="text-center text-sm text-gray-600 mb-4">
        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
          {callDecision.vendorsRemaining} more vendor{callDecision.vendorsRemaining !== 1 ? "s" : ""} available
        </span>
      </div>

      {/* Decision Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onContinue}
          className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          <span>📞</span>
          Call Next Vendor
        </button>
        <button
          onClick={onStop}
          className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
        >
          <span>✅</span>
          Stop Here
        </button>
      </div>

      {callDecision.currentBestPrice && (
        <p className="text-xs text-center text-gray-500 mt-3">
          Stopping will finalize {callDecision.currentBestVendor} at ₹{callDecision.currentBestPrice.toLocaleString()}
        </p>
      )}
    </div>
  );
}

export function ChatInterface() {
  const [sessionId] = useState(() => uuidv4());
  const [messages, setMessages] = useState<ChatMessageType[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Hi! I'm your negotiation assistant. I'll help you find the best deals from local service providers.

Tell me what you need - for example:
- "I need a cab from Bangalore to Chennai tomorrow at 8 AM"
- "Looking for a plumber in Koramangala"
- "Need catering for 50 people next Saturday"

What can I help you find today?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<AppStage>("service_selection");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<UserRequirement | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [callStatuses, setCallStatuses] = useState<Map<string, CallStatus>>(new Map());
  const [priceIntel, setPriceIntel] = useState<PriceIntel | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [rankedBusinesses, setRankedBusinesses] = useState<RankedBusiness[]>([]);
  const [researchSteps, setResearchSteps] = useState<ResearchStep[]>([]);
  const [researchPlan, setResearchPlan] = useState<string>("");
  const [researchComplete, setResearchComplete] = useState(false);
  const [isResearchCollapsed, setIsResearchCollapsed] = useState(false);

  // Agent workflow state
  const [currentAgent, setCurrentAgent] = useState<string>("");
  const [agentStates, setAgentStates] = useState<Map<string, AgentState>>(new Map());
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([]);

  // Call decision state (one call at a time)
  const [callDecision, setCallDecision] = useState<CallDecisionInfo | null>(null);
  const [currentCallVendorIndex, setCurrentCallVendorIndex] = useState<number>(0);

  // Simulation state
  const [currentSimVendorIndex, setCurrentSimVendorIndex] = useState<number>(0);
  const [simResults, setSimResults] = useState<Array<{
    vendorId: string;
    vendorName: string;
    quotedPrice: number | null;
    success: boolean;
    notes: string;
    messages?: Array<{ role: string; content: string; thinking?: string }>;
  }>>([]);
  const [lowestSimPrice, setLowestSimPrice] = useState<number | null>(null);
  const [bestSimVendor, setBestSimVendor] = useState<string | null>(null);

  // Learning phase state
  const [learningAnalysis, setLearningAnalysis] = useState<LearningAnalysis | null>(null);
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningError, setLearningError] = useState<string | null>(null);
  const [learningStep, setLearningStep] = useState<"idle" | "call_analyzer" | "safety_checker" | "prompt_enhancer" | "complete">("idle");
  const [showLearningPanel, setShowLearningPanel] = useState(false);

  // Performance tracking state - initialize with empty store to avoid hydration mismatch
  const [performanceStore, setPerformanceStore] = useState<PerformanceStore>({
    simulations: [],
    promptVersions: [],
    currentPromptVersion: 1,
  });
  const [isStoreLoaded, setIsStoreLoaded] = useState(false);
  const [currentSimMetrics, setCurrentSimMetrics] = useState<SimulationMetrics | null>(null);
  const [showPromptReview, setShowPromptReview] = useState(false);
  const [showPerformanceDashboard, setShowPerformanceDashboard] = useState(false);

  // Language preference for transcription
  const [languageMode, setLanguageMode] = useState<"hindi-english" | "regional">("hindi-english");
  const [regionalLanguage, setRegionalLanguage] = useState<"hi" | "kn" | "te" | "ta" | "bn" | "mr" | "gu">("hi");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load performance store only on client side to avoid hydration mismatch
  useEffect(() => {
    const loaded = loadPerformanceStore();
    setPerformanceStore(loaded);
    setIsStoreLoaded(true);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Maintain focus on input after loading completes or messages change
  useEffect(() => {
    if (!isLoading && stage !== "researching" && stage !== "calling" && stage !== "simulating") {
      // Use setTimeout to ensure focus happens after React re-renders
      const focusTimeout = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(focusTimeout);
    }
  }, [isLoading, messages, stage]);

  const addMessage = (role: "user" | "assistant", content: string) => {
    const newMessage: ChatMessageType = {
      id: uuidv4(),
      role,
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    return newMessage;
  };

  const addWorkflowEvent = useCallback((
    type: WorkflowEvent["type"],
    agentId: string,
    message: string,
    data?: Record<string, unknown>
  ) => {
    const event: WorkflowEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      agentId,
      message,
      data,
    };
    setWorkflowEvents((prev) => [...prev, event]);
  }, []);

  const updateAgentState = useCallback((agentId: string, status: AgentStatus, message?: string, result?: string) => {
    setAgentStates((prev) => {
      const next = new Map(prev);
      const existing = next.get(agentId) || { id: agentId, status: "idle" };
      next.set(agentId, {
        ...existing,
        status,
        message,
        result,
        ...(status === "running" ? { startedAt: new Date() } : {}),
        ...(status === "completed" ? { completedAt: new Date() } : {}),
      });
      return next;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    addMessage("user", userMessage);
    setIsLoading(true);

    // Update agent state
    setCurrentAgent("intake");
    updateAgentState("intake", "running", "Processing user input...");
    addWorkflowEvent("started", "intake", "Processing user requirements");

    try {
      // Build conversation history for the API (serverless functions are stateless)
      const history = messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, sessionId, history }),
      });

      const data = await response.json();

      if (data.error) {
        // Ensure error is a string (handle object errors gracefully)
        const errorMsg = typeof data.error === "string"
          ? data.error
          : (data.error.message || JSON.stringify(data.error));
        addMessage("assistant", `Sorry, something went wrong: ${errorMsg}`);
        updateAgentState("intake", "error", errorMsg);
        addWorkflowEvent("error", "intake", errorMsg);
      } else {
        addMessage("assistant", data.response);
        if (data.requirements) {
          setRequirements(data.requirements);
          if (data.requirements.isComplete) {
            updateAgentState("intake", "completed", "Requirements gathered");
            addWorkflowEvent("completed", "intake", "Requirements complete - ready for research");
          }
        }
      }
    } catch (error) {
      addMessage("assistant", "Sorry, I encountered an error. Please try again.");
      updateAgentState("intake", "error", "Error processing request");
      addWorkflowEvent("error", "intake", "Failed to process request");
      console.error("Chat error:", error);
    } finally {
      setIsLoading(false);
      if (!requirements?.isComplete) {
        setCurrentAgent("intake");
      } else {
        setCurrentAgent("");
      }
      inputRef.current?.focus();
    }
  };

  const handleSearchBusinesses = async () => {
    if (!requirements?.from) return;

    setStage("researching");
    setCurrentAgent("research");
    updateAgentState("research", "running", "Starting deep research...");
    addWorkflowEvent("started", "research", "Beginning vendor research");
    addWorkflowEvent("handoff", "research", "Handoff from Intake → Research");
    addMessage("assistant", "🔬 Starting deep research to find and analyze service providers...");

    // Start the research stream
    try {
      const response = await fetch("/api/research-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirements, sessionId }),
      });

      if (!response.ok) {
        throw new Error("Failed to start research");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response stream");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              handleResearchEvent(data);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Research failed";
      addMessage("assistant", `❌ Research failed: ${errorMsg}`);
      updateAgentState("research", "error", errorMsg);
      addWorkflowEvent("error", "research", errorMsg);
      setStage("chat");
      setCurrentAgent("");
    }
  };

  const handleResearchEvent = (data: Record<string, unknown>) => {
    switch (data.type) {
      case "steps":
        setResearchSteps(data.steps as ResearchStep[]);
        break;

      case "step_update": {
        const step = data.step as ResearchStep;
        setResearchSteps((prev) =>
          prev.map((s) => (s.id === step.id ? step : s))
        );

        // Map step to agent state
        const stepToAgent: Record<string, string> = {
          plan: "research.plan",
          geocode: "research.geocode",
          search: "research.search",
          price_intel: "research.price_intel",
          review_analysis: "research.review_analysis",
          ranking: "research.ranking",
          strategy: "research.strategy",
        };

        const agentId = stepToAgent[step.id];
        if (agentId) {
          if (step.status === "running") {
            setCurrentAgent(agentId);
            updateAgentState(agentId, "running", step.title);
            addWorkflowEvent("started", agentId, step.title);
          } else if (step.status === "completed") {
            updateAgentState(agentId, "completed", step.result);
            addWorkflowEvent("completed", agentId, step.result || step.title);
          } else if (step.status === "error") {
            updateAgentState(agentId, "error", step.result);
            addWorkflowEvent("error", agentId, step.result || "Step failed");
          }
        }
        break;
      }

      case "plan":
        setResearchPlan(data.plan as string);
        break;

      case "price_intel":
        setPriceIntel(data.priceIntel as PriceIntel);
        break;

      case "analyzing_vendor":
        addWorkflowEvent("update", "research.review_analysis", `Analyzing: ${data.businessName}`);
        break;

      case "ranking":
        setRankedBusinesses(data.vendors as RankedBusiness[]);
        setBusinesses(data.vendors as Business[]);
        break;

      case "strategies":
        setStrategies(data.strategies as Strategy[]);
        break;

      case "complete":
        handleResearchComplete(data);
        break;

      case "error":
        const errorMsg = data.message as string;
        addMessage("assistant", `❌ Research failed: ${errorMsg}`);
        updateAgentState("research", "error", errorMsg);
        addWorkflowEvent("error", "research", errorMsg);
        setStage("chat");
        setCurrentAgent("");
        break;
    }
  };

  const handleResearchComplete = (data: Record<string, unknown>) => {
    const businesses = data.businesses as RankedBusiness[];
    const intel = (data as { priceIntel: PriceIntel }).priceIntel;
    const strats = (data as { strategies: Strategy[] }).strategies;

    setRankedBusinesses(businesses);
    setBusinesses(businesses);
    setPriceIntel(intel);
    setStrategies(strats);
    setResearchComplete(true);
    setIsResearchCollapsed(true); // Auto-collapse when research completes
    setStage("businesses_found");

    // Update agent states
    updateAgentState("research", "completed", "Research complete");
    addWorkflowEvent("completed", "research", "All research steps completed");
    setCurrentAgent("");

    // Generate summary message
    const topVendor = businesses[0];
    const priceRange = `₹${intel.baselinePrice.low} - ₹${intel.baselinePrice.high}`;

    let summaryMessage = `🎯 **Research Complete!**\n\n`;
    summaryMessage += `**Expected Price Range:** ${priceRange}\n`;
    if (intel.estimatedDistance > 0) {
      summaryMessage += `**Distance:** ${intel.estimatedDistance.toFixed(1)} km (~${Math.round(intel.estimatedDuration)} mins)\n`;
    }
    summaryMessage += `\n**Top Recommendation:** ${topVendor?.name} (Score: ${topVendor?.scores.total}/100)\n`;
    summaryMessage += `_${topVendor?.reasoning}_\n\n`;
    summaryMessage += `Found ${businesses.length} providers ranked by proximity, ratings, reviews, and negotiation potential.\n\n`;
    summaryMessage += `Click **"Start Calling"** to negotiate with the top 3 providers.`;

    addMessage("assistant", summaryMessage);
  };

  // Call a single vendor and wait for completion
  const handleCallSingleVendor = async (vendorIndex: number) => {
    const vendor = businesses[vendorIndex];
    if (!vendor || !requirements) return;

    setStage("calling");
    setCurrentAgent("negotiator");
    setCallDecision(null); // Clear any previous decision state

    const maxVendors = Math.min(3, businesses.length);
    const vendorsRemaining = maxVendors - vendorIndex - 1;

    updateAgentState("negotiator.calling", "running", `Calling ${vendor.name}...`);
    addWorkflowEvent("started", "negotiator.calling", `Calling ${vendor.name} (${vendorIndex + 1}/${maxVendors})`);
    addMessage(
      "assistant",
      `📞 **Calling ${vendor.name}** (${vendorIndex + 1} of ${maxVendors})...\n\nPlease wait while I negotiate on your behalf.`
    );

    // Update call status
    setCallStatuses((prev) => {
      const newMap = new Map(prev);
      newMap.set(vendor.id, {
        callId: "",
        businessId: vendor.id,
        status: "calling",
      });
      return newMap;
    });

    try {
      // Call single vendor using the existing API
      const response = await fetch("/api/start-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businesses: [vendor],
          requirements,
          sessionId,
          languageMode,
          regionalLanguage: languageMode === "regional" ? regionalLanguage : undefined,
          priceIntel, // Pass price context for better negotiation
        }),
      });

      const data = await response.json();

      if (data.error) {
        addMessage("assistant", `❌ ${data.error}`);
        updateAgentState("negotiator", "error", data.error);
        setStage("businesses_found");
        return;
      }

      const callInfo = data.calls?.[0];
      if (!callInfo?.callId) {
        // Call not initiated - show decision UI with failure
        handleSingleCallComplete(vendor, vendorIndex, null, "failed");
        return;
      }

      // Poll for this single call
      await pollSingleCall(callInfo, vendor, vendorIndex);
    } catch (error) {
      addMessage("assistant", `❌ Failed to call ${vendor.name}. ${error instanceof Error ? error.message : ""}`);
      updateAgentState("negotiator.calling", "error", "Call failed");
      // Show decision UI even on error
      handleSingleCallComplete(vendor, vendorIndex, null, "failed");
    }
  };

  // Poll for a single call's completion
  const pollSingleCall = async (
    callInfo: { callId: string; businessId: string; businessName: string },
    vendor: Business,
    vendorIndex: number
  ) => {
    const maxPolls = 60;
    let polls = 0;

    while (polls < maxPolls) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      polls++;

      try {
        const response = await fetch(
          `/api/call-status?callId=${callInfo.callId}&businessName=${encodeURIComponent(callInfo.businessName)}`
        );
        const data = await response.json();

        if (
          data.status === "ended" ||
          data.status === "completed" ||
          data.status === "failed" ||
          data.status === "no-answer" ||
          data.status === "busy"
        ) {
          // Update call status in map
          setCallStatuses((prev) => {
            const newMap = new Map(prev);
            newMap.set(vendor.id, {
              callId: callInfo.callId,
              businessId: vendor.id,
              status: data.status === "ended" || data.status === "completed" ? "completed" : data.status,
              quote: data.quote,
            });
            return newMap;
          });

          // Determine outcome
          const outcome: "success" | "failed" | "no_answer" | "busy" =
            data.status === "ended" || data.status === "completed"
              ? data.quote?.price ? "success" : "failed"
              : data.status === "no-answer" ? "no_answer" : data.status === "busy" ? "busy" : "failed";

          handleSingleCallComplete(vendor, vendorIndex, data.quote, outcome);
          return;
        }
      } catch (error) {
        console.error(`Error polling call ${callInfo.callId}:`, error);
      }
    }

    // Timeout
    handleSingleCallComplete(vendor, vendorIndex, null, "failed");
  };

  // Handle completion of a single call
  const handleSingleCallComplete = (
    vendor: Business,
    vendorIndex: number,
    quote: { price: number | null; notes: string } | null,
    outcome: "success" | "failed" | "no_answer" | "busy"
  ) => {
    const maxVendors = Math.min(3, businesses.length);
    const vendorsRemaining = maxVendors - vendorIndex - 1;

    // Calculate current best
    const allQuotes = Array.from(callStatuses.values())
      .filter(s => s.status === "completed" && s.quote?.price)
      .map(s => ({ price: s.quote!.price!, businessId: s.businessId }));

    if (quote?.price) {
      allQuotes.push({ price: quote.price, businessId: vendor.id });
    }

    const bestQuote = allQuotes.length > 0
      ? allQuotes.reduce((best, curr) => curr.price < best.price ? curr : best)
      : null;
    const bestVendor = bestQuote ? businesses.find(b => b.id === bestQuote.businessId) : null;

    // Update workflow
    const priceText = quote?.price ? `₹${quote.price}` : "No quote";
    updateAgentState("negotiator.calling", outcome === "success" ? "completed" : "error", `${vendor.name}: ${priceText}`);
    addWorkflowEvent("completed", "negotiator.calling", `${vendor.name}: ${priceText}`);

    // Add message about the result
    if (outcome === "success" && quote?.price) {
      addMessage("assistant", `✅ **${vendor.name}** quoted **₹${quote.price.toLocaleString()}**${quote.notes ? ` - ${quote.notes}` : ""}`);
    } else {
      addMessage("assistant", `❌ **${vendor.name}** - ${outcome === "no_answer" ? "No answer" : outcome === "busy" ? "Line busy" : "Call failed"}`);
    }

    // If more vendors available, show decision UI
    if (vendorsRemaining > 0) {
      setCallDecision({
        awaitingDecision: true,
        lastCallSummary: {
          vendorName: vendor.name,
          vendorPhone: vendor.phone || "N/A",
          quotedPrice: quote?.price || null,
          negotiatedPrice: quote?.price || null, // For now, same as quoted
          callDuration: 60, // Placeholder - actual duration would come from Vapi
          outcome,
          highlights: quote?.notes ? [quote.notes] : [],
        },
        vendorsRemaining,
        currentBestPrice: bestQuote?.price || null,
        currentBestVendor: bestVendor?.name || null,
      });
    } else {
      // No more vendors - go to results
      finishCallingPhase();
    }
  };

  // User decides to continue calling
  const handleCallDecisionContinue = () => {
    const nextIndex = currentCallVendorIndex + 1;
    setCurrentCallVendorIndex(nextIndex);
    setCallDecision(null);
    handleCallSingleVendor(nextIndex);
  };

  // User decides to stop calling
  const handleCallDecisionStop = () => {
    setCallDecision(null);
    finishCallingPhase();
  };

  // Finish the calling phase and go to results
  const finishCallingPhase = () => {
    setStage("results");
    updateAgentState("negotiator", "completed", "Calls completed");
    addWorkflowEvent("completed", "negotiator", "Negotiation phase complete");
    setCurrentAgent("");
    generateResultsSummary();
  };

  // Start the calling flow (one call at a time)
  const handleStartCalling = async () => {
    if (businesses.length === 0 || !requirements) return;

    // Reset state
    setCurrentCallVendorIndex(0);
    setCallDecision(null);
    setCallStatuses(new Map());

    // Initialize call statuses for all vendors (up to 3)
    const initialStatuses = new Map<string, CallStatus>();
    businesses.slice(0, 3).forEach((b) => {
      initialStatuses.set(b.id, {
        callId: "",
        businessId: b.id,
        status: "pending",
      });
    });
    setCallStatuses(initialStatuses);

    updateAgentState("negotiator", "running", "Starting calls...");
    addWorkflowEvent("started", "negotiator", "Starting negotiation calls (one at a time)");
    addWorkflowEvent("handoff", "negotiator", "Handoff from Research → Negotiator");

    addMessage(
      "assistant",
      `📞 **Starting Negotiations** (One Call at a Time)\n\nI'll call each vendor and show you the results. After each call, you can decide whether to continue or stop.\n\n**Vendors to call:** ${Math.min(3, businesses.length)}`
    );

    // Start with first vendor
    handleCallSingleVendor(0);
  };

  const handleStartSimulation = () => {
    if (businesses.length === 0 || !requirements || !priceIntel) return;

    // Reset simulation state
    setCurrentSimVendorIndex(0);
    setSimResults([]);
    setLowestSimPrice(null);
    setBestSimVendor(null);
    setStage("simulating");

    // Update agent workflow state
    setCurrentAgent("negotiator");
    updateAgentState("negotiator", "running", "Starting simulation...");
    addWorkflowEvent("started", "negotiator", "Starting vendor simulation (test mode)");
    addWorkflowEvent("handoff", "negotiator", "Handoff from Research → Negotiator (Simulation)");

    addMessage(
      "assistant",
      `🎮 **Simulation Mode Started!**\n\nYou will now play as each vendor (${Math.min(3, businesses.length)} total). The AI agent will call and negotiate with you.\n\n**Playing as:** ${rankedBusinesses[0]?.name || businesses[0]?.name}\n\nRespond naturally as if you're the service provider!`
    );
  };

  const handleSimCallComplete = (result: {
    vendorId: string;
    vendorName: string;
    quotedPrice: number | null;
    success: boolean;
    notes: string;
    messages?: Array<{ role: string; content: string; thinking?: string }>;
  }) => {
    // Store result - we need to track the new results array ourselves due to async state
    const newResults = [...simResults, result];
    setSimResults(newResults);

    // Track lowest price
    let newLowestPrice = lowestSimPrice;
    let newBestVendor = bestSimVendor;
    if (result.quotedPrice !== null) {
      if (lowestSimPrice === null || result.quotedPrice < lowestSimPrice) {
        newLowestPrice = result.quotedPrice;
        newBestVendor = result.vendorName;
        setLowestSimPrice(result.quotedPrice);
        setBestSimVendor(result.vendorName);
      }
    }

    // Add workflow event
    const priceText = result.quotedPrice ? `₹${result.quotedPrice}` : "No quote";
    addWorkflowEvent("completed", "negotiator.calling", `${result.vendorName}: ${priceText}`);

    // Move to next vendor or finish
    const nextIndex = currentSimVendorIndex + 1;
    const maxVendors = Math.min(3, rankedBusinesses.length || businesses.length);

    if (nextIndex < maxVendors) {
      setCurrentSimVendorIndex(nextIndex);
      const nextVendor = rankedBusinesses[nextIndex] || businesses[nextIndex];
      addMessage(
        "assistant",
        `📞 **Next Call!**\n\nNow playing as: **${nextVendor?.name}**\n\n${newLowestPrice !== null ? `_Note: Lowest price so far is ₹${newLowestPrice} from ${newBestVendor}_` : ""}`
      );
      addWorkflowEvent("started", "negotiator.calling", `Calling ${nextVendor?.name}`);
    } else {
      // All simulations complete - pass the complete results array
      handleSimulationComplete(newResults, newLowestPrice, newBestVendor);
    }
  };

  const handleSimSkip = () => {
    const currentVendor = rankedBusinesses[currentSimVendorIndex] || businesses[currentSimVendorIndex];

    // Add as skipped result
    const skipResult = {
      vendorId: currentVendor.id,
      vendorName: currentVendor.name,
      quotedPrice: null,
      success: false,
      notes: "Skipped",
    };
    const newResults = [...simResults, skipResult];
    setSimResults(newResults);

    addWorkflowEvent("update", "negotiator.calling", `Skipped: ${currentVendor.name}`);

    // Move to next vendor
    const nextIndex = currentSimVendorIndex + 1;
    const maxVendors = Math.min(3, rankedBusinesses.length || businesses.length);

    if (nextIndex < maxVendors) {
      setCurrentSimVendorIndex(nextIndex);
      const nextVendor = rankedBusinesses[nextIndex] || businesses[nextIndex];
      addMessage("assistant", `⏭️ Skipped ${currentVendor.name}. Now playing as: **${nextVendor?.name}**`);
      addWorkflowEvent("started", "negotiator.calling", `Calling ${nextVendor?.name}`);
    } else {
      handleSimulationComplete(newResults, lowestSimPrice, bestSimVendor);
    }
  };

  const handleSimulationComplete = async (
    finalResults: Array<{ vendorId: string; vendorName: string; quotedPrice: number | null; success: boolean; notes: string; messages?: Array<{ role: string; content: string; thinking?: string }> }>,
    finalLowestPrice: number | null,
    finalBestVendor: string | null
  ) => {
    setStage("results");
    updateAgentState("negotiator", "completed", "Simulation complete");
    addWorkflowEvent("completed", "negotiator", "All vendor simulations completed");

    // Use the passed-in results (not state, which may be stale)
    const successfulCalls = finalResults.filter((r) => r.quotedPrice !== null);
    const skippedCalls = finalResults.filter((r) => r.notes === "Skipped");

    // Generate simulation summary using passed-in results
    let summary = `🎮 **Simulation Complete!**\n\n`;
    summary += `**Calls Made:** ${finalResults.length}\n`;
    summary += `**Successful Quotes:** ${successfulCalls.length}\n`;
    summary += `**Skipped:** ${skippedCalls.length}\n\n`;

    if (successfulCalls.length === 0) {
      summary += `No price quotes were obtained during the simulation.\n\n`;
    } else {
      const sortedQuotes = successfulCalls
        .sort((a, b) => (a.quotedPrice || 0) - (b.quotedPrice || 0));

      summary += `**Results by Price:**\n\n`;
      sortedQuotes.forEach((result, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
        summary += `${medal} **${result.vendorName}**: ₹${result.quotedPrice?.toLocaleString()}`;
        if (result.notes && result.notes !== "Skipped") summary += ` _(${result.notes})_`;
        summary += `\n`;
      });

      if (priceIntel) {
        const bestPrice = sortedQuotes[0]?.quotedPrice || 0;
        const targetMet = bestPrice <= priceIntel.baselinePrice.mid;
        const savings = priceIntel.baselinePrice.high - bestPrice;

        summary += `\n**📊 Analysis:**\n`;
        summary += `- Best negotiated price: **₹${bestPrice}**\n`;
        summary += `- Expected market rate: ₹${priceIntel.baselinePrice.low} - ₹${priceIntel.baselinePrice.high}\n`;
        summary += `- Potential savings: ₹${savings > 0 ? savings : 0} from max rate\n`;
        summary += `- Target ${targetMet ? "✅ ACHIEVED" : "❌ NOT MET"}\n`;
      }

      if (finalBestVendor) {
        summary += `\n**🏆 Best Deal:** ${finalBestVendor} at ₹${finalLowestPrice}\n`;
      }
    }

    summary += `\n---\n\n🧠 **Learning Agent (GPT-4o)** is now analyzing the negotiations in detail...\n\nView the **Learning Panel** on the right for detailed insights.`;

    addMessage("assistant", summary);

    // Start real AI learning phase
    setCurrentAgent("learning");
    updateAgentState("learning", "running", "Starting GPT-4o analysis...");
    addWorkflowEvent("handoff", "learning", "Handoff from Negotiator → Learning");
    addWorkflowEvent("started", "learning", "Beginning AI-powered analysis with GPT-4o");

    // Reset learning state
    setLearningAnalysis(null);
    setLearningError(null);
    setLearningLoading(true);
    setShowLearningPanel(true);
    setLearningStep("call_analyzer");

    // Update workflow events for sub-agents
    updateAgentState("learning.call_analyzer", "running", "Analyzing call transcripts with GPT-4o...");
    addWorkflowEvent("started", "learning.call_analyzer", "GPT-4o analyzing negotiation patterns");

    try {
      // Get current prompt from performance store
      const currentPrompt = getCurrentPrompt(performanceStore);

      // Call the learning analysis API
      const response = await fetch("/api/learning-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          results: finalResults,
          priceIntel: priceIntel ? {
            baselinePrice: priceIntel.baselinePrice,
            estimatedDistance: priceIntel.estimatedDistance,
          } : { baselinePrice: { low: 0, mid: 0, high: 0 } },
          requirements: {
            service: requirements?.service || "service",
            from: requirements?.from || "",
            to: requirements?.to,
            passengerCount: requirements?.passengers,
            vehicleType: requirements?.vehicleType,
          },
          currentPrompt,
          promptVersion: performanceStore.currentPromptVersion,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Update step by step with delays for visual feedback
      setLearningStep("call_analyzer");
      updateAgentState("learning.call_analyzer", "completed",
        `Analyzed ${data.analysis.callAnalysis.analyses.length} calls`);
      addWorkflowEvent("completed", "learning.call_analyzer",
        `Score: ${(data.analysis.callAnalysis.analyses.reduce((s: number, a: { overallScore: number }) => s + a.overallScore, 0) / (data.analysis.callAnalysis.analyses.length || 1)).toFixed(1)}/10`);

      await new Promise(r => setTimeout(r, 300));

      setLearningStep("safety_checker");
      updateAgentState("learning.safety_checker", "running", "Checking for policy violations...");
      addWorkflowEvent("started", "learning.safety_checker", "Running safety compliance check");

      await new Promise(r => setTimeout(r, 300));

      updateAgentState("learning.safety_checker", "completed",
        data.analysis.safetyCheck.passed ? "No violations detected" : `${data.analysis.safetyCheck.issues.length} issues found`);
      addWorkflowEvent("completed", "learning.safety_checker",
        data.analysis.safetyCheck.passed ? "Safety check passed" : `Found ${data.analysis.safetyCheck.issues.length} issues`);

      await new Promise(r => setTimeout(r, 300));

      setLearningStep("prompt_enhancer");
      updateAgentState("learning.prompt_enhancer", "running", "Generating improvements...");
      addWorkflowEvent("started", "learning.prompt_enhancer", "Analyzing for prompt improvements");

      await new Promise(r => setTimeout(r, 300));

      const highPriority = data.analysis.promptEnhancements.improvements.filter((i: { priority: string }) => i.priority === "high").length;
      updateAgentState("learning.prompt_enhancer", "completed",
        `${highPriority} high-priority improvements identified`);
      addWorkflowEvent("completed", "learning.prompt_enhancer",
        `Generated ${data.analysis.promptEnhancements.improvements.length} improvement suggestions`);

      // Complete learning phase
      setLearningStep("complete");
      updateAgentState("learning", "completed", "AI analysis complete");
      addWorkflowEvent("completed", "learning", "All learning sub-agents completed");
      setCurrentAgent("");

      // Set the analysis data
      setLearningAnalysis(data.analysis);

      // Calculate and store performance metrics
      const successfulCalls = finalResults.filter((r) => r.quotedPrice !== null);
      const avgScore = data.analysis.callAnalysis.analyses.length > 0
        ? data.analysis.callAnalysis.analyses.reduce((s: number, a: { overallScore: number }) => s + a.overallScore, 0) / data.analysis.callAnalysis.analyses.length
        : 0;

      const bestPriceObtained = successfulCalls.length > 0
        ? Math.min(...successfulCalls.map((r) => r.quotedPrice || Infinity))
        : null;
      const avgPriceObtained = successfulCalls.length > 0
        ? successfulCalls.reduce((sum, r) => sum + (r.quotedPrice || 0), 0) / successfulCalls.length
        : null;

      const targetPrice = priceIntel?.baselinePrice.mid || 0;
      const priceEfficiency = bestPriceObtained && targetPrice > 0
        ? Math.max(0, Math.min(100, (1 - (bestPriceObtained - targetPrice) / targetPrice) * 100))
        : 0;

      const tacticsScore = data.analysis.callAnalysis.analyses.length > 0
        ? data.analysis.callAnalysis.analyses.reduce((sum: number, a: { tacticsUsed: string[] }) => sum + Math.min(a.tacticsUsed.length * 15, 100), 0) / data.analysis.callAnalysis.analyses.length
        : 0;

      const closingRate = finalResults.length > 0
        ? (successfulCalls.length / finalResults.length) * 100
        : 0;

      const safetyScore = data.analysis.safetyCheck.passed
        ? 100 - (data.analysis.safetyCheck.issues.filter((i: { severity: string }) => i.severity === "high").length * 30)
        : 50;

      // Calculate vendor experience score from analysis
      const vendorExpSummary = data.analysis.callAnalysis.vendorExperienceSummary;
      const vendorExperienceScore = vendorExpSummary?.avgScore || 0;

      const newMetrics: Omit<SimulationMetrics, 'id' | 'simulationNumber' | 'promptVersion'> = {
        timestamp: new Date(),
        callMetrics: data.analysis.callAnalysis.analyses.map((a: {
          vendorName: string;
          priceObtained: number | null;
          tacticsUsed: string[];
          effectiveMoves: string[];
          missedOpportunities: string[];
          overallScore: number;
          vendorExperience?: {
            score: number;
            repetitionsRequired: number;
            misunderstandings: string[];
            frustrationIndicators: string[];
          };
        }) => ({
          vendorName: a.vendorName,
          priceObtained: a.priceObtained,
          targetPrice,
          score: a.overallScore,
          tacticsUsed: a.tacticsUsed,
          effectiveMoves: a.effectiveMoves,
          missedOpportunities: a.missedOpportunities,
          vendorExperience: a.vendorExperience,
        })),
        scores: {
          overall: avgScore,
          priceEfficiency,
          tacticsScore,
          safetyScore,
          closingRate,
          vendorExperience: vendorExperienceScore,
        },
        pricePerformance: {
          targetPrice,
          bestPrice: bestPriceObtained,
          averagePrice: avgPriceObtained,
          priceRangeLow: priceIntel?.baselinePrice.low || 0,
          priceRangeHigh: priceIntel?.baselinePrice.high || 0,
        },
        safetyPassed: data.analysis.safetyCheck.passed,
        safetyIssues: data.analysis.safetyCheck.issues.length,
        vendorExperienceSummary: vendorExpSummary,
        improvementCount: data.analysis.promptEnhancements.improvements.length,
        highPriorityImprovements: highPriority,
      };

      // Add metrics to store and update state
      const updatedStore = addSimulationMetrics(performanceStore, newMetrics);
      setPerformanceStore(updatedStore);

      // Store current metrics for display
      const currentMetrics = updatedStore.simulations[updatedStore.simulations.length - 1];
      setCurrentSimMetrics(currentMetrics);

      // Add summary to chat (reuse avgScore from above)
      let analysisMsg = `\n\n🧠 **Learning Analysis Complete (GPT-4o)**\n\n`;
      analysisMsg += `**Negotiation Score:** ${avgScore.toFixed(1)}/10\n`;
      analysisMsg += `**Safety:** ${data.analysis.safetyCheck.passed ? "✅ Passed" : "⚠️ Issues found"}\n`;
      analysisMsg += `**Improvements:** ${highPriority} high-priority suggestions\n\n`;

      if (highPriority > 0) {
        analysisMsg += `**Top Improvements:**\n`;
        data.analysis.promptEnhancements.improvements
          .filter((i: { priority: string }) => i.priority === "high")
          .slice(0, 2)
          .forEach((imp: { area: string; suggestedImprovement: string }) => {
            analysisMsg += `- **${imp.area}:** ${imp.suggestedImprovement}\n`;
          });
      }

      analysisMsg += `\n_View the Learning Panel for detailed insights._`;
      addMessage("assistant", analysisMsg);

    } catch (error) {
      console.error("Learning analysis error:", error);
      setLearningError(error instanceof Error ? error.message : "Analysis failed");
      setLearningStep("idle");

      updateAgentState("learning", "error", "Analysis failed");
      addWorkflowEvent("error", "learning", error instanceof Error ? error.message : "Analysis failed");
      setCurrentAgent("");

      addMessage("assistant", `\n\n❌ **Learning Analysis Failed:** ${error instanceof Error ? error.message : "Unknown error"}\n\nThe simulation results are still valid. You can proceed with real calls.`);
    } finally {
      setLearningLoading(false);
    }
  };

  const pollCallStatuses = async (
    calls: { callId: string; businessId: string; businessName: string }[]
  ) => {
    const maxPolls = 60;
    let polls = 0;
    const completedCalls = new Set<string>();

    while (polls < maxPolls && completedCalls.size < calls.length) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      polls++;

      for (const call of calls) {
        if (completedCalls.has(call.callId)) continue;

        try {
          const response = await fetch(
            `/api/call-status?callId=${call.callId}&businessName=${encodeURIComponent(call.businessName)}`
          );
          const data = await response.json();

          if (
            data.status === "ended" ||
            data.status === "completed" ||
            data.status === "failed" ||
            data.status === "no-answer" ||
            data.status === "busy"
          ) {
            completedCalls.add(call.callId);

            setCallStatuses((prev) => {
              const newMap = new Map(prev);
              newMap.set(call.businessId, {
                callId: call.callId,
                businessId: call.businessId,
                status: data.status === "ended" || data.status === "completed" ? "completed" : data.status,
                quote: data.quote,
              });
              return newMap;
            });

            const statusText = data.status === "ended" || data.status === "completed"
              ? `Completed - ${data.quote?.price ? `₹${data.quote.price}` : "No quote"}`
              : data.status;
            addWorkflowEvent("completed", "negotiator.calling", `${call.businessName}: ${statusText}`);
          }
        } catch (error) {
          console.error(`Error polling call ${call.callId}:`, error);
        }
      }
    }

    // All calls completed
    setStage("results");
    updateAgentState("negotiator", "completed", "All calls completed");
    addWorkflowEvent("completed", "negotiator", "Negotiation phase complete");

    // Trigger learning phase
    setCurrentAgent("learning");
    updateAgentState("learning", "running", "Analyzing call results...");
    addWorkflowEvent("handoff", "learning", "Handoff from Negotiator → Learning");
    addWorkflowEvent("started", "learning", "Analyzing negotiation outcomes");

    // Simulate learning completion
    setTimeout(() => {
      updateAgentState("learning", "completed", "Analysis complete");
      addWorkflowEvent("completed", "learning", "Call analysis and learnings recorded");
      setCurrentAgent("");
    }, 2000);

    generateResultsSummary();
  };

  const generateResultsSummary = () => {
    const completedCalls = Array.from(callStatuses.values()).filter(
      (c) => c.status === "completed" && c.quote?.price
    );

    if (completedCalls.length === 0) {
      addMessage(
        "assistant",
        "😕 Unfortunately, none of the calls resulted in a quote. This can happen if businesses don't answer or aren't available. Would you like to try again with different providers?"
      );
      return;
    }

    const sortedQuotes = completedCalls
      .filter((c) => c.quote?.price)
      .sort((a, b) => (a.quote?.price || 0) - (b.quote?.price || 0));

    const bestQuote = sortedQuotes[0];
    const bestBusiness = businesses.find((b) => b.id === bestQuote.businessId);

    let summary = `🎉 **Great news! I got quotes for you:**\n\n`;

    sortedQuotes.forEach((call, index) => {
      const business = businesses.find((b) => b.id === call.businessId);
      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
      summary += `${medal} **${business?.name}**: ₹${call.quote?.price?.toLocaleString()}\n`;
      if (call.quote?.notes) {
        summary += `   _${call.quote.notes}_\n`;
      }
      summary += "\n";
    });

    summary += `\n**My Recommendation:** Go with **${bestBusiness?.name}** at ₹${bestQuote.quote?.price?.toLocaleString()} - they offer the best value!`;

    addMessage("assistant", summary);
  };

  const handleReset = async () => {
    await fetch(`/api/chat?sessionId=${sessionId}`, { method: "DELETE" });
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Hi! I'm your negotiation assistant. What can I help you find today?`,
        timestamp: new Date(),
      },
    ]);
    setStage("service_selection");
    setSelectedService(null);
    setRequirements(null);
    setBusinesses([]);
    setRankedBusinesses([]);
    setCallStatuses(new Map());
    setPriceIntel(null);
    setStrategies([]);
    setResearchSteps([]);
    setResearchPlan("");
    setCurrentAgent("");
    // Reset call decision state
    setCallDecision(null);
    setCurrentCallVendorIndex(0);
    setAgentStates(new Map());
    setWorkflowEvents([]);
    // Reset simulation state
    setCurrentSimVendorIndex(0);
    setSimResults([]);
    setLowestSimPrice(null);
    setBestSimVendor(null);
    // Reset learning state
    setLearningAnalysis(null);
    setLearningLoading(false);
    setLearningError(null);
    setLearningStep("idle");
    setShowLearningPanel(false);
    // Reset performance state (keep the store but clear current metrics)
    setCurrentSimMetrics(null);
    setShowPromptReview(false);
  };

  // Handler for service selection
  const handleServiceSelection = (service: string) => {
    setSelectedService(service);
    if (service === "cab") {
      // For cab service, show the booking form with map
      setStage("booking_form");
      addMessage("assistant", "Great! Let's book a cab. Please fill in your trip details below.");
    } else {
      // For other services, use chat-based intake
      setStage("chat");
      addMessage("assistant", `I'll help you find the best ${service} services. Tell me more about what you need - date, location, any specific requirements?`);
    }
  };

  // Handler for booking form submission
  const handleBookingFormSubmit = (formRequirements: UserRequirement) => {
    setRequirements(formRequirements);
    setStage("chat");
    addMessage("user", `I need a cab from ${formRequirements.from} to ${formRequirements.to} on ${formRequirements.date} at ${formRequirements.time}. ${formRequirements.tripType === "round-trip" ? "Round trip." : "One way."} ${formRequirements.passengers} passenger(s).`);
    addMessage("assistant", `Perfect! I've got your trip details:

**From:** ${formRequirements.from}
**To:** ${formRequirements.to}
**Date:** ${formRequirements.date} at ${formRequirements.time}
**Trip:** ${formRequirements.tripType === "round-trip" ? "Round Trip" : "One Way"}
**Passengers:** ${formRequirements.passengers}

Click **Find Providers** to search for the best cab services in your area.`);
  };

  // Handler for calling more vendors (continue from where we left off)
  const handleCallMoreVendors = () => {
    // Get vendors that haven't been called yet
    const calledIds = Array.from(callStatuses.keys());
    const uncalledVendors = businesses.filter(b => !calledIds.includes(b.id));

    if (uncalledVendors.length === 0) {
      addMessage("assistant", "All available vendors have been called. Click **Start New Search** to find more vendors.");
      return;
    }

    // Get the best price so far to use as leverage
    const completedCalls = Array.from(callStatuses.values()).filter(
      (c) => c.status === "completed" && c.quote?.price
    );
    const bestPriceSoFar = completedCalls.length > 0
      ? Math.min(...completedCalls.map(c => c.quote?.price || Infinity))
      : null;

    // Set the next vendor index and continue calling
    const nextVendorIndex = calledIds.length;
    setCurrentCallVendorIndex(nextVendorIndex);

    const vendorsToCall = Math.min(3, uncalledVendors.length);
    addMessage(
      "assistant",
      `📞 **Calling ${vendorsToCall} More Vendors**\n\n${bestPriceSoFar ? `Current best price: ₹${bestPriceSoFar.toLocaleString()} - I'll use this as leverage!` : ""}\n\nContinuing negotiations with additional vendors...`
    );

    // Start calling the next vendor
    handleCallSingleVendor(nextVendorIndex);
  };

  // Check how many more vendors are available to call
  const getUncalledVendorsCount = () => {
    const calledIds = Array.from(callStatuses.keys());
    return businesses.filter(b => !calledIds.includes(b.id)).length;
  };

  // Handler for accepting prompt changes
  const handleAcceptPromptChanges = (newPrompt: string, appliedChanges: string[]) => {
    const updatedStore = addPromptVersion(
      performanceStore,
      newPrompt,
      appliedChanges,
      appliedChanges
    );
    setPerformanceStore(updatedStore);
    setShowPromptReview(false);

    addMessage(
      "assistant",
      `✅ **Prompt Updated!**\n\nThe negotiation prompt has been updated to version ${updatedStore.currentPromptVersion}.\n\n**Changes Applied:**\n${appliedChanges.map(c => `- ${c}`).join('\n')}\n\n_Run another simulation to test the improvements._`
    );

    addWorkflowEvent("update", "learning", `Prompt updated to v${updatedStore.currentPromptVersion}`);
  };

  // Handler for rejecting prompt changes
  const handleRejectPromptChanges = () => {
    setShowPromptReview(false);
    addMessage("assistant", "Prompt changes were not applied. You can review them again from the Learning Panel.");
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 flex items-center justify-between shadow-lg">
        <div>
          <h1 className="text-xl font-bold text-white">Negotiator AI</h1>
          <p className="text-sm text-gray-400">Multi-Agent Negotiation System</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPerformanceDashboard(true)}
            className="flex items-center gap-2 text-sm text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-md transition-colors"
          >
            <span>📈</span>
            <span>Dashboard</span>
            {isStoreLoaded && performanceStore.simulations.length > 0 && (
              <span className="bg-blue-500 text-white px-2 py-0.5 rounded-full text-xs font-medium">
                {performanceStore.simulations.length}
              </span>
            )}
          </button>
          <Link
            href="/history"
            className="flex items-center gap-2 text-sm text-white bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg shadow-md transition-colors"
          >
            <span>📞</span>
            <span>Call History</span>
          </Link>
          <button
            onClick={handleReset}
            className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Start Over
          </button>
        </div>
      </header>

      {/* 3-Panel Layout */}
      <div className="flex-1 overflow-hidden flex">
        {/* Panel 1: Chat / Service Selection / Booking Form */}
        <div className="w-1/3 flex flex-col border-r bg-white shadow-sm">
          {/* Panel Header */}
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              {stage === "service_selection" ? (
                <><span>🎯</span> Select Service</>
              ) : stage === "booking_form" ? (
                <><span>🚕</span> Book Your Ride</>
              ) : (
                <><span>💬</span> Chat</>
              )}
            </h2>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Service Selection */}
            {stage === "service_selection" && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">What do you need help with?</h3>
                  <p className="text-sm text-gray-500">Select a service to get started</p>
                </div>

                <div className="grid gap-3">
                  <button
                    onClick={() => handleServiceSelection("cab")}
                    className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-transparent hover:border-blue-400 transition-all group"
                  >
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      🚕
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-800">Cab / Taxi</div>
                      <div className="text-sm text-gray-500">Book outstation or local rides</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleServiceSelection("caterer")}
                    className="flex items-center gap-4 p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border-2 border-transparent hover:border-orange-400 transition-all group"
                  >
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      🍽️
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-800">Caterer</div>
                      <div className="text-sm text-gray-500">Events, parties & functions</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleServiceSelection("photographer")}
                    className="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-transparent hover:border-purple-400 transition-all group"
                  >
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      📸
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-800">Photographer</div>
                      <div className="text-sm text-gray-500">Weddings, events & portraits</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleServiceSelection("other")}
                    className="flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl border-2 border-transparent hover:border-gray-400 transition-all group"
                  >
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      🔧
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-800">Other Service</div>
                      <div className="text-sm text-gray-500">Plumber, electrician, etc.</div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Booking Form for Cab */}
            {stage === "booking_form" && (
              <BookingForm
                onSubmit={handleBookingFormSubmit}
                isLoading={isLoading}
              />
            )}

            {/* Chat Messages for other stages */}
            {stage !== "service_selection" && stage !== "booking_form" && (
              <>
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                {isLoading && (
                  <div className="flex justify-start mb-4">
                    <div className="bg-gray-100 rounded-2xl px-4 py-3 rounded-bl-md">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Action Buttons */}
          {requirements?.isComplete && stage === "chat" && (
            <div className="px-4 pb-2">
              <button
                onClick={handleSearchBusinesses}
                className="w-full bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 transition-colors"
              >
                🔍 Find Providers
              </button>
            </div>
          )}

          {stage === "businesses_found" && (
            <div className="px-4 pb-2 space-y-3">
              {/* Language Mode Selector */}
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <p className="text-xs font-medium text-gray-600 mb-2">Vendor Language Preference</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLanguageMode("hindi-english")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      languageMode === "hindi-english"
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    🇮🇳 Hindi / English
                  </button>
                  <button
                    onClick={() => setLanguageMode("regional")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      languageMode === "regional"
                        ? "bg-green-600 text-white"
                        : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    🗣️ Regional
                  </button>
                </div>
                {languageMode === "hindi-english" ? (
                  <p className="text-xs text-gray-500 mt-2">
                    Best for Hindi, English, or Hinglish speakers (faster)
                  </p>
                ) : (
                  <div className="mt-2">
                    <select
                      value={regionalLanguage}
                      onChange={(e) => setRegionalLanguage(e.target.value as typeof regionalLanguage)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="hi">Hindi (हिंदी)</option>
                      <option value="kn">Kannada (ಕನ್ನಡ)</option>
                      <option value="te">Telugu (తెలుగు)</option>
                      <option value="ta">Tamil (தமிழ்)</option>
                      <option value="bn">Bengali (বাংলা)</option>
                      <option value="mr">Marathi (मराठी)</option>
                      <option value="gu">Gujarati (ગુજરાતી)</option>
                    </select>
                  </div>
                )}
              </div>

              <button
                onClick={handleStartSimulation}
                className="w-full bg-purple-600 text-white py-3 rounded-xl font-medium hover:bg-purple-700 transition-colors"
              >
                🎮 Test with Simulation ({Math.min(3, businesses.length)} vendors)
              </button>
              <button
                onClick={handleStartCalling}
                className="w-full bg-blue-600 text-white py-2 rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm"
              >
                📞 Start Real Calls (skip simulation)
              </button>
            </div>
          )}

          {stage === "results" && simResults.length > 0 && (
            <div className="px-4 pb-2">
              <button
                onClick={handleStartCalling}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                📞 Start Real Calls
              </button>
            </div>
          )}

          {/* Input - Hidden during service selection and booking form */}
          {stage !== "service_selection" && stage !== "booking_form" && (
          <form onSubmit={handleSubmit} className="p-4 bg-white border-t">
            {stage === "results" ? (
              /* Show action buttons when calls are complete */
              <div className="flex flex-col gap-2">
                {getUncalledVendorsCount() > 0 && (
                  <button
                    type="button"
                    onClick={handleCallMoreVendors}
                    className="w-full px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>📞</span> Call More Vendors ({getUncalledVendorsCount()} available)
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>🔄</span> Start New Search
                  </button>
                  <Link
                    href="/history"
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>📋</span> View History
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  disabled={isLoading || stage === "researching" || stage === "calling"}
                  autoFocus
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 bg-white text-gray-900 placeholder-gray-500"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading || stage === "researching" || stage === "calling"}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Send
                </button>
              </div>
            )}
          </form>
          )}
        </div>

        {/* Panel 2: Results (Research/Businesses/Calls) */}
        <div className="w-1/3 flex flex-col border-r bg-white shadow-sm overflow-hidden">
          {/* Panel Header */}
          <div className="bg-gray-50 border-b px-4 py-3">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <span>
                {stage === "chat" && "📋"}
                {stage === "researching" && "🔬"}
                {stage === "businesses_found" && "🏆"}
                {stage === "simulating" && "🎮"}
                {stage === "calling" && "📞"}
                {stage === "results" && "📊"}
              </span>
              <span>
                {stage === "chat" && "Results"}
                {stage === "researching" && "Research Progress"}
                {stage === "businesses_found" && "Ranked Providers"}
                {stage === "simulating" && "Simulation Mode"}
                {stage === "calling" && "Call Progress"}
                {stage === "results" && "Final Results"}
              </span>
            </h2>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {/* Empty State */}
            {stage === "chat" && (
              <div className="text-center text-gray-400 py-8">
                <div className="text-4xl mb-2">📋</div>
                <p>Results will appear here</p>
                <p className="text-sm">Tell me what you need to get started</p>
              </div>
            )}

            {/* Research Progress - shown during research or when complete */}
            {(stage === "researching" || researchComplete) && (researchPlan || researchSteps.length > 0 || priceIntel) && (
              <div className="bg-purple-50 rounded-lg border border-purple-200 overflow-hidden">
                {/* Collapsible Header */}
                <button
                  onClick={() => setIsResearchCollapsed(!isResearchCollapsed)}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-purple-100 transition-colors"
                >
                  <h3 className="font-semibold text-purple-800 flex items-center gap-2 text-sm">
                    <span>🔬</span> Research Results
                    {researchComplete && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Complete</span>}
                    {stage === "researching" && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full animate-pulse">In Progress</span>}
                  </h3>
                  <span className={`text-purple-600 transition-transform ${isResearchCollapsed ? "" : "rotate-180"}`}>
                    ▼
                  </span>
                </button>

                {/* Collapsible Content */}
                {!isResearchCollapsed && (
                  <div className="px-3 pb-3 space-y-3">
                    {/* Research Plan */}
                    {researchPlan && (
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                        <h3 className="font-medium text-blue-800 mb-2 text-sm flex items-center gap-1">
                          <span>📋</span> Research Plan
                        </h3>
                        <div className="text-xs text-blue-700 whitespace-pre-line">{researchPlan}</div>
                      </div>
                    )}

                    {/* Steps */}
                    {researchSteps.map((step) => (
                      <div
                        key={step.id}
                        className={`
                          rounded-lg p-3 border text-sm
                          ${step.status === "completed" ? "bg-green-50 border-green-200" : ""}
                          ${step.status === "running" ? "bg-blue-50 border-blue-200 animate-pulse" : ""}
                          ${step.status === "pending" ? "bg-gray-50 border-gray-200" : ""}
                          ${step.status === "error" ? "bg-red-50 border-red-200" : ""}
                        `}
                      >
                        <div className="flex items-center gap-2">
                          {step.status === "pending" && <span className="text-gray-400">⏳</span>}
                          {step.status === "running" && <span className="text-blue-500">🔄</span>}
                          {step.status === "completed" && <span className="text-green-600">✅</span>}
                          {step.status === "error" && <span className="text-red-500">❌</span>}
                          <span className={`font-medium ${
                            step.status === "completed" ? "text-green-800" :
                            step.status === "running" ? "text-blue-800" :
                            step.status === "error" ? "text-red-800" :
                            "text-gray-700"
                          }`}>{step.title}</span>
                        </div>
                        {step.result && (
                          <div className="mt-1 text-xs text-gray-600 pl-6">{step.result}</div>
                        )}
                      </div>
                    ))}

                    {/* Price Intel */}
                    {priceIntel && priceIntel.baselinePrice.mid > 0 && (
                      <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <h3 className="font-medium text-green-800 mb-2 text-sm flex items-center gap-1">
                          <span>💰</span> Price Intelligence
                        </h3>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-white rounded p-2">
                            <div className="text-xs text-gray-500">Budget</div>
                            <div className="font-bold text-green-600">₹{priceIntel.baselinePrice.low}</div>
                          </div>
                          <div className="bg-white rounded p-2 ring-2 ring-green-300">
                            <div className="text-xs text-gray-500">Expected</div>
                            <div className="font-bold text-green-700">₹{priceIntel.baselinePrice.mid}</div>
                          </div>
                          <div className="bg-white rounded p-2">
                            <div className="text-xs text-gray-500">Max</div>
                            <div className="font-bold text-orange-600">₹{priceIntel.baselinePrice.high}</div>
                          </div>
                        </div>
                        {priceIntel.estimatedDistance > 0 && (
                          <div className="mt-2 text-xs text-green-700">
                            📍 {priceIntel.estimatedDistance.toFixed(1)} km • ⏱️ ~{Math.round(priceIntel.estimatedDuration)} mins
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Learning Analysis Loading State - Labor Illusion */}
            {stage === "results" && learningLoading && (
              <LearningLaborIllusion currentStep={learningStep} />
            )}

            {/* Call Decision UI - shown when awaiting user decision after a call */}
            {stage === "calling" && callDecision?.awaitingDecision && (
              <CallDecisionUI
                callDecision={callDecision}
                onContinue={handleCallDecisionContinue}
                onStop={handleCallDecisionStop}
              />
            )}

            {/* Simulation Mode */}
            {stage === "simulating" && priceIntel && (
              <div className="h-full -m-3">
                <VendorSimulationPanel
                  vendor={rankedBusinesses[currentSimVendorIndex] || businesses[currentSimVendorIndex]}
                  context={{
                    service: requirements?.service || "service",
                    from: requirements?.from || "",
                    to: requirements?.to,
                    date: requirements?.date,
                    time: requirements?.time,
                    passengerCount: requirements?.passengers,
                    vehicleType: requirements?.vehicleType,
                    tripType: "one-way", // Default to one-way for cab services
                    expectedPriceLow: priceIntel.baselinePrice.low,
                    expectedPriceMid: priceIntel.baselinePrice.mid,
                    expectedPriceHigh: priceIntel.baselinePrice.high,
                    targetPrice: strategies.find((s) => s.businessId === (rankedBusinesses[currentSimVendorIndex] || businesses[currentSimVendorIndex])?.id)?.targetPrice || Math.round(priceIntel.baselinePrice.mid * 0.85),
                    openingOffer: strategies.find((s) => s.businessId === (rankedBusinesses[currentSimVendorIndex] || businesses[currentSimVendorIndex])?.id)?.openingOffer || Math.round(priceIntel.baselinePrice.low * 0.9),
                    lowestPriceSoFar: lowestSimPrice,
                    bestVendorSoFar: bestSimVendor,
                    vendorStrategy: strategies.find((s) => s.businessId === (rankedBusinesses[currentSimVendorIndex] || businesses[currentSimVendorIndex])?.id)?.strategy || "Standard negotiation approach",
                    callNumber: currentSimVendorIndex + 1,
                    totalCalls: Math.min(3, rankedBusinesses.length || businesses.length),
                  }}
                  sessionId={sessionId}
                  systemPrompt={getCurrentPrompt(performanceStore)}
                  onCallComplete={handleSimCallComplete}
                  onSkip={handleSimSkip}
                />
              </div>
            )}

            {/* Business Results */}
            {(stage === "businesses_found" || stage === "calling" || stage === "results") && (
              <div className="space-y-3">
                {/* Price Banner */}
                {priceIntel && (
                  <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-3">
                    <div className="text-xs opacity-90">Expected Price Range</div>
                    <div className="text-xl font-bold">
                      ₹{priceIntel.baselinePrice.low} - ₹{priceIntel.baselinePrice.high}
                    </div>
                    {priceIntel.estimatedDistance > 0 && (
                      <div className="text-xs opacity-90 mt-1">
                        {priceIntel.estimatedDistance.toFixed(1)} km • ~{Math.round(priceIntel.estimatedDuration)} mins
                      </div>
                    )}
                  </div>
                )}

                {/* Vendor Cards */}
                {(rankedBusinesses.length > 0 ? rankedBusinesses : businesses)
                  .slice(0, 5)
                  .map((business, index) => {
                    const ranked = business as RankedBusiness;
                    const strategy = strategies.find((s) => s.businessId === business.id);
                    const callStatus = callStatuses.get(business.id);

                    return (
                      <div
                        key={business.id}
                        className={`bg-white rounded-lg p-3 shadow-sm border ${
                          index === 0 ? "border-yellow-400 ring-1 ring-yellow-200" : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}
                            </span>
                            <div>
                              <div className="font-semibold text-gray-800 text-sm">{business.name}</div>
                              <div className="text-xs text-gray-500">
                                {business.rating}★ ({business.reviewCount}) • {business.distance}km
                              </div>
                            </div>
                          </div>
                          {ranked.scores && (
                            <div className="text-right">
                              <div className="text-lg font-bold text-purple-600">{ranked.scores.total}</div>
                              <div className="text-xs text-gray-400">score</div>
                            </div>
                          )}
                        </div>

                        {/* Score breakdown */}
                        {ranked.scores && (
                          <div className="flex gap-1 text-xs mb-2">
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">📍{ranked.scores.proximity}%</span>
                            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">⭐{ranked.scores.rating}%</span>
                            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">📊{ranked.scores.analysis}%</span>
                          </div>
                        )}

                        {/* Reasoning */}
                        {ranked.reasoning && (
                          <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded mb-2">
                            💡 {ranked.reasoning}
                          </div>
                        )}

                        {/* Strategy */}
                        {strategy && stage === "businesses_found" && (
                          <div className="text-xs text-orange-700 bg-orange-50 p-2 rounded">
                            🎯 Target: ₹{strategy.targetPrice} | Open: ₹{strategy.openingOffer}
                          </div>
                        )}

                        {/* Call Status */}
                        {callStatus && (
                          <div className="mt-2 pt-2 border-t">
                            <div className={`flex items-center gap-2 text-sm ${
                              callStatus.status === "completed" ? "text-green-600" :
                              callStatus.status === "calling" ? "text-blue-500 animate-pulse" :
                              callStatus.status === "pending" ? "text-gray-400" : "text-red-500"
                            }`}>
                              {callStatus.status === "pending" && <span>⏳ Waiting...</span>}
                              {callStatus.status === "calling" && <span>📞 Calling...</span>}
                              {callStatus.status === "completed" && (
                                <span>✅ {callStatus.quote?.price ? `₹${callStatus.quote.price}` : "Completed"}</span>
                              )}
                              {(callStatus.status === "failed" || callStatus.status === "no-answer" || callStatus.status === "busy") && (
                                <span>❌ {callStatus.status}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Panel 3: Agent Workflow or Learning Panel */}
        <div className="w-1/3 overflow-hidden flex flex-col bg-white shadow-sm">
          {/* Panel Header / Toggle */}
          {(stage === "results" || showLearningPanel) ? (
            <div className="bg-gray-50 border-b flex">
              <button
                onClick={() => setShowLearningPanel(false)}
                className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
                  !showLearningPanel
                    ? "bg-white text-indigo-600 border-b-2 border-indigo-600"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                🤖 Workflow
              </button>
              <button
                onClick={() => setShowLearningPanel(true)}
                className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
                  showLearningPanel
                    ? "bg-white text-purple-600 border-b-2 border-purple-600"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                🧠 Learning {learningLoading && "..."}
              </button>
            </div>
          ) : (
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                <span>🤖</span> Agent Workflow
              </h2>
            </div>
          )}

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto">
            {showLearningPanel ? (
              <div className="flex flex-col h-full">
                {/* Performance Graphs */}
                <div className="p-3 border-b">
                  <PerformanceGraphs
                    store={performanceStore}
                    currentSimulation={currentSimMetrics}
                  />
                </div>

                {/* Update Prompt Button */}
                {learningAnalysis && learningAnalysis.promptEnhancements.improvements.length > 0 && (
                  <div className="p-3 border-b bg-purple-50">
                    <button
                      onClick={() => setShowPromptReview(true)}
                      className="w-full py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 flex items-center justify-center gap-2"
                    >
                      <span>✨</span>
                      Update System Prompt
                      <span className="text-xs bg-purple-500 px-2 py-0.5 rounded">
                        {learningAnalysis.promptEnhancements.improvements.length} improvements
                      </span>
                    </button>
                    <p className="text-xs text-purple-600 mt-1 text-center">
                      Review and apply suggested prompt improvements
                    </p>
                  </div>
                )}

                {/* Learning Panel */}
                <div className="flex-1 overflow-y-auto">
                  <LearningPanel
                    analysis={learningAnalysis}
                    isLoading={learningLoading}
                    error={learningError}
                    currentStep={learningStep}
                  />
                </div>
              </div>
            ) : (
              <AgentWorkflowPanel
                currentAgent={currentAgent}
                agentStates={agentStates}
                events={workflowEvents}
              />
            )}
          </div>
        </div>
      </div>

      {/* Prompt Change Review Modal */}
      {learningAnalysis && (
        <PromptChangeReview
          isOpen={showPromptReview}
          currentPrompt={getCurrentPrompt(performanceStore)}
          suggestedChanges={learningAnalysis.promptEnhancements.improvements}
          onAccept={handleAcceptPromptChanges}
          onReject={handleRejectPromptChanges}
          onClose={() => setShowPromptReview(false)}
        />
      )}

      {/* Performance Dashboard Modal */}
      {showPerformanceDashboard && (
        <PerformanceDashboard
          store={performanceStore}
          onClose={() => setShowPerformanceDashboard(false)}
          onStoreCleared={() => {
            setPerformanceStore(loadPerformanceStore());
            setShowPerformanceDashboard(false);
          }}
        />
      )}
    </div>
  );
}
