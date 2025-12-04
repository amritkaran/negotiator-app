"use client";

import { useState, useEffect, useRef } from "react";
import { AgentEvent, AgentType } from "@/lib/agents/types";

interface AgentTrackerProps {
  sessionId: string;
  onHumanInterrupt?: (question: string, interruptId: string) => void;
}

// Agent display configuration
const AGENT_CONFIG: Record<
  string,
  { name: string; icon: string; color: string }
> = {
  intake: { name: "Intake", icon: "📝", color: "bg-blue-500" },
  research: { name: "Research", icon: "🔍", color: "bg-purple-500" },
  "research.price_intel": {
    name: "Price Intel",
    icon: "💰",
    color: "bg-purple-400",
  },
  "research.review_analyzer": {
    name: "Review Analyzer",
    icon: "⭐",
    color: "bg-purple-400",
  },
  "research.vendor_ranker": {
    name: "Vendor Ranker",
    icon: "📊",
    color: "bg-purple-400",
  },
  negotiator: { name: "Negotiator", icon: "📞", color: "bg-green-500" },
  "negotiator.calling": { name: "Calling", icon: "📱", color: "bg-green-400" },
  "negotiator.human_interrupt": {
    name: "Human Input",
    icon: "✋",
    color: "bg-yellow-500",
  },
  learning: { name: "Learning", icon: "🧠", color: "bg-orange-500" },
  "learning.call_analyzer": {
    name: "Call Analyzer",
    icon: "📈",
    color: "bg-orange-400",
  },
  "learning.safety_checker": {
    name: "Safety Check",
    icon: "🛡️",
    color: "bg-orange-400",
  },
  "learning.prompt_enhancer": {
    name: "Prompt Enhancer",
    icon: "✨",
    color: "bg-orange-400",
  },
  verification: { name: "Verification", icon: "✅", color: "bg-teal-500" },
};

// Main agent pipeline order
const MAIN_AGENTS: AgentType[] = [
  "intake",
  "research",
  "negotiator",
  "learning",
  "verification",
];

export function AgentTracker({ sessionId, onHumanInterrupt }: AgentTrackerProps) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<string>("intake");
  const [status, setStatus] = useState<string>("idle");
  const [completedAgents, setCompletedAgents] = useState<Set<string>>(
    new Set()
  );
  const [humanInterrupt, setHumanInterrupt] = useState<{
    active: boolean;
    question: string;
    interruptId: string;
  } | null>(null);

  const eventLogRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE stream
  useEffect(() => {
    if (!sessionId) return;

    const eventSource = new EventSource(
      `/api/agent-stream?sessionId=${sessionId}`
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "init") {
          setStatus(data.status);
          setCurrentAgent(data.currentAgent);
        } else if (data.type === "event") {
          const event = data.event as AgentEvent;
          setEvents((prev) => [...prev, event]);

          // Update current agent
          if (
            event.type === "agent_started" ||
            event.type === "sub_agent_started"
          ) {
            setCurrentAgent(event.agent);
          }

          // Track completed agents
          if (event.type === "agent_completed") {
            setCompletedAgents((prev) => new Set([...prev, event.agent]));
          }

          // Handle human interrupt
          if (event.type === "human_interrupt_requested") {
            setHumanInterrupt({
              active: true,
              question: event.data?.question as string,
              interruptId: event.data?.interruptId as string,
            });
            onHumanInterrupt?.(
              event.data?.question as string,
              event.data?.interruptId as string
            );
          }

          if (event.type === "human_interrupt_resolved") {
            setHumanInterrupt(null);
          }
        }
      } catch (error) {
        console.error("SSE parse error:", error);
      }
    };

    eventSource.onerror = () => {
      setStatus("error");
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId, onHumanInterrupt]);

  // Auto-scroll event log
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [events]);

  // Get agent status
  const getAgentStatus = (agent: string): "pending" | "active" | "completed" => {
    if (completedAgents.has(agent)) return "completed";
    if (currentAgent === agent || currentAgent.startsWith(`${agent}.`))
      return "active";
    return "pending";
  };

  // Format timestamp
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Get event icon
  const getEventIcon = (type: AgentEvent["type"]) => {
    switch (type) {
      case "agent_started":
      case "sub_agent_started":
        return "▶️";
      case "agent_completed":
      case "sub_agent_completed":
        return "✅";
      case "agent_error":
        return "❌";
      case "handoff":
        return "🔄";
      case "human_interrupt_requested":
        return "✋";
      case "human_interrupt_resolved":
        return "👍";
      case "language_switched":
        return "🌐";
      case "call_started":
        return "📞";
      case "call_progress":
        return "📱";
      case "call_ended":
        return "📵";
      case "learning_insight":
        return "💡";
      case "prompt_enhanced":
        return "✨";
      case "verification_started":
        return "🔍";
      case "verification_completed":
        return "✅";
      default:
        return "📌";
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Pipeline Header */}
      <div className="bg-gray-800 text-white p-4">
        <h3 className="font-semibold mb-3">Agent Pipeline</h3>

        {/* Main Agent Pipeline */}
        <div className="flex items-center justify-between">
          {MAIN_AGENTS.map((agent, index) => {
            const config = AGENT_CONFIG[agent];
            const agentStatus = getAgentStatus(agent);

            return (
              <div key={agent} className="flex items-center">
                {/* Agent Node */}
                <div
                  className={`
                    flex flex-col items-center
                    ${agentStatus === "active" ? "animate-pulse" : ""}
                  `}
                >
                  <div
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-lg
                      ${
                        agentStatus === "completed"
                          ? "bg-green-500"
                          : agentStatus === "active"
                          ? config.color
                          : "bg-gray-600"
                      }
                      ${agentStatus === "active" ? "ring-2 ring-white ring-offset-2 ring-offset-gray-800" : ""}
                    `}
                  >
                    {agentStatus === "completed" ? "✓" : config.icon}
                  </div>
                  <span className="text-xs mt-1 text-gray-300">
                    {config.name}
                  </span>
                </div>

                {/* Connector Line */}
                {index < MAIN_AGENTS.length - 1 && (
                  <div
                    className={`
                      w-8 h-0.5 mx-1
                      ${
                        completedAgents.has(agent)
                          ? "bg-green-500"
                          : "bg-gray-600"
                      }
                    `}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Current Sub-Agent */}
        {currentAgent.includes(".") && (
          <div className="mt-3 flex items-center text-sm">
            <span className="text-gray-400 mr-2">Current:</span>
            <span
              className={`${AGENT_CONFIG[currentAgent]?.color || "bg-gray-500"} px-2 py-0.5 rounded-full text-xs`}
            >
              {AGENT_CONFIG[currentAgent]?.icon}{" "}
              {AGENT_CONFIG[currentAgent]?.name || currentAgent}
            </span>
          </div>
        )}
      </div>

      {/* Human Interrupt Banner */}
      {humanInterrupt?.active && (
        <div className="bg-yellow-50 border-b border-yellow-200 p-4">
          <div className="flex items-start">
            <span className="text-2xl mr-3">✋</span>
            <div>
              <p className="font-semibold text-yellow-800">
                Human Input Required
              </p>
              <p className="text-yellow-700 text-sm mt-1">
                {humanInterrupt.question}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Event Log */}
      <div
        ref={eventLogRef}
        className="h-64 overflow-y-auto p-4 bg-gray-50 text-sm font-mono"
      >
        {events.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            Waiting for agent activity...
          </p>
        ) : (
          events.map((event, index) => (
            <div
              key={event.id || index}
              className={`
                py-1.5 px-2 mb-1 rounded
                ${
                  event.type.includes("error")
                    ? "bg-red-50 text-red-700"
                    : event.type.includes("completed")
                    ? "bg-green-50 text-green-700"
                    : event.type.includes("human")
                    ? "bg-yellow-50 text-yellow-700"
                    : "bg-white text-gray-700"
                }
              `}
            >
              <span className="text-gray-400 text-xs mr-2" suppressHydrationWarning>
                {formatTime(event.timestamp)}
              </span>
              <span className="mr-1">{getEventIcon(event.type)}</span>
              <span
                className={`font-medium mr-2 ${AGENT_CONFIG[event.agent]?.color?.replace("bg-", "text-") || "text-gray-600"}`}
              >
                [{AGENT_CONFIG[event.agent]?.name || event.agent}]
              </span>
              <span>{event.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Status Bar */}
      <div className="bg-gray-100 px-4 py-2 flex items-center justify-between text-sm">
        <div className="flex items-center">
          <span
            className={`
            w-2 h-2 rounded-full mr-2
            ${
              status === "running"
                ? "bg-green-500 animate-pulse"
                : status === "paused"
                ? "bg-yellow-500"
                : status === "completed"
                ? "bg-blue-500"
                : status === "error"
                ? "bg-red-500"
                : "bg-gray-400"
            }
          `}
          />
          <span className="text-gray-600 capitalize">{status}</span>
        </div>
        <span className="text-gray-400">{events.length} events</span>
      </div>
    </div>
  );
}
