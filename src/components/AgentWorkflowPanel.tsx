"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentHandoverOverlay, AgentHandoverMini } from "./AgentHandoverOverlay";

// Agent workflow definition
const WORKFLOW_AGENTS = [
  {
    id: "intake",
    name: "Intake",
    icon: "📝",
    description: "Gather requirements",
    color: "#3b82f6",
    subAgents: [],
  },
  {
    id: "research",
    name: "Research",
    icon: "🔬",
    description: "Analyze market & vendors",
    color: "#8b5cf6",
    subAgents: [
      { id: "research.plan", name: "Planning", icon: "📋" },
      { id: "research.geocode", name: "Location", icon: "📍" },
      { id: "research.search", name: "Search", icon: "🔍" },
      { id: "research.price_intel", name: "Price Intel", icon: "💰" },
      { id: "research.review_analysis", name: "Review Analysis", icon: "⭐" },
      { id: "research.ranking", name: "Vendor Ranking", icon: "🏆" },
      { id: "research.strategy", name: "Strategy", icon: "🎯" },
    ],
  },
  {
    id: "negotiator",
    name: "Negotiator",
    icon: "📞",
    description: "Make calls & negotiate",
    color: "#10b981",
    subAgents: [
      { id: "negotiator.calling", name: "Calling", icon: "📱" },
      { id: "negotiator.negotiating", name: "Negotiating", icon: "💬" },
      { id: "negotiator.human_interrupt", name: "Human Input", icon: "✋" },
    ],
  },
  {
    id: "learning",
    name: "Learning",
    icon: "🧠",
    description: "Analyze & improve",
    color: "#f59e0b",
    subAgents: [
      { id: "learning.call_analyzer", name: "Call Analysis", icon: "📊" },
      { id: "learning.safety_checker", name: "Safety Check", icon: "🛡️" },
      { id: "learning.prompt_enhancer", name: "Prompt Enhance", icon: "✨" },
    ],
  },
  {
    id: "verification",
    name: "Verification",
    icon: "✅",
    description: "Confirm booking",
    color: "#14b8a6",
    subAgents: [],
  },
];

export type AgentStatus = "idle" | "pending" | "running" | "completed" | "error" | "waiting";

export interface AgentState {
  id: string;
  status: AgentStatus;
  message?: string;
  startedAt?: Date;
  completedAt?: Date;
  result?: string;
}

export interface WorkflowEvent {
  id: string;
  timestamp: Date;
  type: "started" | "completed" | "error" | "handoff" | "update" | "human_interrupt";
  agentId: string;
  message: string;
  data?: Record<string, unknown>;
}

interface AgentWorkflowPanelProps {
  currentAgent: string;
  agentStates: Map<string, AgentState>;
  events: WorkflowEvent[];
  onEventsClear?: () => void;
}

// Status Ring Component with sci-fi styling
function StatusRing({
  status,
  isActive,
  color,
}: {
  status: AgentStatus;
  isActive: boolean;
  color: string;
}) {
  const getStatusColor = () => {
    if (isActive) return "#00ffff";
    switch (status) {
      case "completed":
        return "#00ff88";
      case "running":
        return "#00ffff";
      case "error":
        return "#ff4444";
      case "waiting":
        return "#ffaa00";
      case "pending":
        return "#666666";
      default:
        return "#333333";
    }
  };

  const statusColor = getStatusColor();
  const shouldAnimate = isActive || status === "running" || status === "waiting";

  return (
    <div className="relative w-6 h-6">
      {/* Outer ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2"
        style={{ borderColor: statusColor, borderStyle: shouldAnimate ? "dashed" : "solid" }}
        animate={shouldAnimate ? { rotate: 360 } : {}}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner dot */}
      <motion.div
        className="absolute rounded-full"
        style={{
          backgroundColor: statusColor,
          top: "25%",
          left: "25%",
          right: "25%",
          bottom: "25%",
          boxShadow: `0 0 8px ${statusColor}`,
        }}
        animate={shouldAnimate ? { opacity: [1, 0.5, 1], scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Glow effect for active */}
      {(isActive || status === "running") && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 15px ${statusColor}` }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </div>
  );
}

// Connection Beam Component
function ConnectionBeam({
  isCompleted,
  isActive,
}: {
  isCompleted: boolean;
  isActive: boolean;
}) {
  return (
    <div className="flex justify-center py-1 relative">
      <div className="relative w-0.5 h-6 overflow-hidden">
        {/* Base line */}
        <div
          className={`absolute inset-0 ${
            isCompleted
              ? "bg-gradient-to-b from-green-400 to-green-500"
              : "bg-gray-700"
          }`}
        />
        {/* Animated flow */}
        {(isActive || isCompleted) && (
          <motion.div
            className="absolute w-full h-3"
            style={{
              background: isCompleted
                ? "linear-gradient(180deg, transparent, #00ff88, transparent)"
                : "linear-gradient(180deg, transparent, #00ffff, #ff00ff, transparent)",
            }}
            animate={{ top: ["-50%", "150%"] }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>
      {/* Side particles */}
      {isActive && (
        <>
          <motion.div
            className="absolute w-1 h-1 bg-cyan-400 rounded-full"
            style={{ boxShadow: "0 0 4px #00ffff" }}
            animate={{
              x: [-10, 10],
              y: [0, 12, 24],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
          />
          <motion.div
            className="absolute w-1 h-1 bg-purple-400 rounded-full"
            style={{ boxShadow: "0 0 4px #ff00ff" }}
            animate={{
              x: [10, -10],
              y: [0, 12, 24],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
          />
        </>
      )}
    </div>
  );
}

// Agent Card Component
function AgentCard({
  agent,
  status,
  isActive,
  isExpanded,
  onToggle,
  agentStates,
  currentAgent,
}: {
  agent: (typeof WORKFLOW_AGENTS)[0];
  status: AgentStatus;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  agentStates: Map<string, AgentState>;
  currentAgent: string;
}) {
  const hasSubAgents = agent.subAgents.length > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      {/* Main Agent Card */}
      <motion.div
        className={`
          relative rounded-xl cursor-pointer overflow-hidden
          ${isActive ? "sci-fi-card-active" : "sci-fi-card"}
        `}
        onClick={() => hasSubAgents && onToggle()}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Background gradient based on status */}
        <div
          className={`
            absolute inset-0 opacity-20
            ${status === "completed" ? "bg-gradient-to-r from-green-500/30 to-transparent" : ""}
            ${status === "running" || isActive ? "bg-gradient-to-r from-cyan-500/30 to-purple-500/30" : ""}
            ${status === "error" ? "bg-gradient-to-r from-red-500/30 to-transparent" : ""}
          `}
        />

        <div className="relative flex items-center gap-3 p-3">
          {/* Status Ring */}
          <StatusRing status={status} isActive={isActive} color={agent.color} />

          {/* Icon with glow */}
          <motion.span
            className="text-2xl"
            animate={isActive ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 2, repeat: Infinity }}
            style={{
              filter: isActive ? `drop-shadow(0 0 8px ${agent.color})` : "none",
            }}
          >
            {agent.icon}
          </motion.span>

          {/* Name & Description */}
          <div className="flex-1 min-w-0">
            <div
              className={`text-sm font-bold tracking-wide ${
                isActive ? "neon-text-cyan" : "text-white"
              }`}
            >
              {agent.name}
            </div>
            <div className="text-xs text-gray-400 truncate">{agent.description}</div>
          </div>

          {/* Expand/Collapse indicator */}
          {hasSubAgents && (
            <motion.span
              className="text-gray-500 text-sm"
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              ▶
            </motion.span>
          )}

          {/* Status Badge */}
          {status !== "idle" && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={`
                text-xs px-2 py-0.5 rounded-full font-medium uppercase tracking-wider
                ${status === "completed" ? "bg-green-500/20 text-green-300 border border-green-500/30" : ""}
                ${status === "running" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : ""}
                ${status === "error" ? "bg-red-500/20 text-red-300 border border-red-500/30 flicker" : ""}
                ${status === "waiting" ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" : ""}
                ${status === "pending" ? "bg-gray-500/20 text-gray-300 border border-gray-500/30" : ""}
              `}
            >
              {status}
            </motion.span>
          )}
        </div>

        {/* Active indicator line */}
        {isActive && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-0.5"
            style={{
              background: "linear-gradient(90deg, transparent, #00ffff, #ff00ff, #00ffff, transparent)",
            }}
            animate={{
              backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        )}
      </motion.div>

      {/* Sub-Agents */}
      <AnimatePresence>
        {hasSubAgents && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="ml-4 mt-2 space-y-1 border-l border-cyan-500/30 pl-3">
              {agent.subAgents.map((subAgent, index) => {
                const subStatus = agentStates.get(subAgent.id)?.status || "idle";
                const isSubActive = currentAgent === subAgent.id;

                return (
                  <motion.div
                    key={subAgent.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`
                      flex items-center gap-2 p-2 rounded-lg text-sm
                      ${isSubActive ? "bg-cyan-500/10 border border-cyan-500/30" : "hover:bg-gray-800/50"}
                    `}
                  >
                    {/* Mini status indicator */}
                    <motion.div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor:
                          isSubActive ? "#00ffff" :
                          subStatus === "completed" ? "#00ff88" :
                          subStatus === "running" ? "#00ffff" :
                          subStatus === "error" ? "#ff4444" :
                          "#333333",
                        boxShadow: isSubActive || subStatus === "running"
                          ? `0 0 6px ${isSubActive ? "#00ffff" : "#00ffff"}`
                          : "none",
                      }}
                      animate={isSubActive || subStatus === "running" ? { opacity: [1, 0.5, 1] } : {}}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                    <span className="text-base">{subAgent.icon}</span>
                    <span className={`flex-1 truncate ${isSubActive ? "text-cyan-300" : "text-gray-300"}`}>
                      {subAgent.name}
                    </span>
                    {subStatus === "completed" && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-green-400"
                      >
                        ✓
                      </motion.span>
                    )}
                    {(subStatus === "running" || isSubActive) && (
                      <motion.span
                        className="text-cyan-400"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      >
                        ●
                      </motion.span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Event Log Item Component
function EventLogItem({ event }: { event: WorkflowEvent }) {
  const getEventStyle = () => {
    switch (event.type) {
      case "error":
        return {
          bg: "bg-red-500/10",
          border: "border-red-500/30",
          text: "text-red-300",
          icon: "❌",
        };
      case "completed":
        return {
          bg: "bg-green-500/10",
          border: "border-green-500/30",
          text: "text-green-300",
          icon: "✅",
        };
      case "handoff":
        return {
          bg: "bg-purple-500/10",
          border: "border-purple-500/30",
          text: "text-purple-300",
          icon: "⚡",
        };
      case "human_interrupt":
        return {
          bg: "bg-yellow-500/10",
          border: "border-yellow-500/30",
          text: "text-yellow-300",
          icon: "✋",
        };
      case "started":
        return {
          bg: "bg-cyan-500/10",
          border: "border-cyan-500/30",
          text: "text-cyan-300",
          icon: "▶️",
        };
      default:
        return {
          bg: "bg-gray-500/10",
          border: "border-gray-500/30",
          text: "text-gray-300",
          icon: "📌",
        };
    }
  };

  const style = getEventStyle();

  const formatTime = (date: Date): string => {
    return new Date(date).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`text-xs p-2 rounded-lg ${style.bg} border ${style.border}`}
    >
      <div className="flex items-start gap-2">
        <span>{style.icon}</span>
        <span className="text-gray-500 font-mono" suppressHydrationWarning>
          {formatTime(event.timestamp)}
        </span>
        <span className={`flex-1 ${style.text}`}>{event.message}</span>
      </div>
    </motion.div>
  );
}

export function AgentWorkflowPanel({
  currentAgent,
  agentStates,
  events,
}: AgentWorkflowPanelProps) {
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set(["research", "negotiator"]));
  const [handoverState, setHandoverState] = useState<{
    isActive: boolean;
    from: { id: string; name: string; icon: string } | null;
    to: { id: string; name: string; icon: string } | null;
  }>({ isActive: false, from: null, to: null });

  // Detect handover events
  useEffect(() => {
    const lastEvent = events[events.length - 1];
    if (lastEvent?.type === "handoff") {
      const [, fromId, , toId] = lastEvent.message.match(/(\w+)\s*→\s*(\w+)/i) || [];
      const fromAgent = WORKFLOW_AGENTS.find((a) => a.id.toLowerCase() === fromId?.toLowerCase());
      const toAgent = WORKFLOW_AGENTS.find((a) => a.id.toLowerCase() === toId?.toLowerCase());

      if (fromAgent && toAgent) {
        setHandoverState({
          isActive: true,
          from: { id: fromAgent.id, name: fromAgent.name, icon: fromAgent.icon },
          to: { id: toAgent.id, name: toAgent.name, icon: toAgent.icon },
        });
      }
    }
  }, [events]);

  // Removed auto-scroll - let user control scroll position

  const toggleAgent = useCallback((agentId: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  const getAgentStatus = useCallback(
    (agentId: string): AgentStatus => {
      return agentStates.get(agentId)?.status || "idle";
    },
    [agentStates]
  );

  const isAgentActive = useCallback(
    (agentId: string): boolean => {
      if (currentAgent === agentId) return true;
      if (currentAgent.startsWith(`${agentId}.`)) return true;
      return false;
    },
    [currentAgent]
  );

  const handleHandoverComplete = useCallback(() => {
    setHandoverState({ isActive: false, from: null, to: null });
  }, []);

  return (
    <>
      {/* Handover Overlay */}
      <AgentHandoverOverlay
        isActive={handoverState.isActive}
        fromAgent={handoverState.from}
        toAgent={handoverState.to}
        onComplete={handleHandoverComplete}
      />

      <div className="h-full flex flex-col hex-pattern text-white">
        {/* Header */}
        <div className="relative overflow-hidden">
          <div
            className="p-4"
            style={{
              background: "linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(0,255,255,0.2) 100%)",
            }}
          >
            {/* Animated border */}
            <motion.div
              className="absolute inset-x-0 bottom-0 h-0.5"
              style={{
                background: "linear-gradient(90deg, transparent, #00ffff, #ff00ff, #00ffff, transparent)",
              }}
              animate={{ backgroundPosition: ["0% 50%", "100% 50%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />

            <div className="flex items-center gap-3">
              <motion.span
                className="text-2xl"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                🤖
              </motion.span>
              <div>
                <h2 className="text-sm font-bold tracking-wider neon-text-cyan">
                  AGENT WORKFLOW
                </h2>
                <p className="text-xs text-cyan-200/70">
                  Real-time AI orchestration
                </p>
              </div>
            </div>
          </div>

          {/* Scan lines overlay */}
          <div className="absolute inset-0 scanlines pointer-events-none opacity-30" />
        </div>

        {/* Workflow Visualization */}
        <div className="flex-1 overflow-y-auto">
          {/* Agent Pipeline */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-xs text-cyan-400 uppercase tracking-widest font-bold">
                Pipeline
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/50 to-transparent" />
            </div>

            <div className="space-y-1">
              {WORKFLOW_AGENTS.map((agent, index) => {
                const status = getAgentStatus(agent.id);
                const isActive = isAgentActive(agent.id);
                const isExpanded = expandedAgents.has(agent.id);
                const isCompleted = status === "completed";
                const nextAgent = WORKFLOW_AGENTS[index + 1];
                const isNextActive = nextAgent ? isAgentActive(nextAgent.id) : false;

                return (
                  <div key={agent.id}>
                    <AgentCard
                      agent={agent}
                      status={status}
                      isActive={isActive}
                      isExpanded={isExpanded}
                      onToggle={() => toggleAgent(agent.id)}
                      agentStates={agentStates}
                      currentAgent={currentAgent}
                    />

                    {/* Connection Beam */}
                    {index < WORKFLOW_AGENTS.length - 1 && (
                      <ConnectionBeam
                        isCompleted={isCompleted}
                        isActive={isActive || isNextActive}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Handover Mini Display */}
          <AnimatePresence>
            {handoverState.isActive && handoverState.from && handoverState.to && (
              <div className="px-4 pb-2">
                <AgentHandoverMini
                  fromAgent={handoverState.from.name}
                  toAgent={handoverState.to.name}
                  isActive={true}
                />
              </div>
            )}
          </AnimatePresence>

          {/* Live Events Log */}
          <div className="p-4 border-t border-cyan-500/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="text-xs text-cyan-400 uppercase tracking-widest font-bold">
                  Live Events
                </div>
                <motion.div
                  className="w-2 h-2 rounded-full bg-cyan-400"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  style={{ boxShadow: "0 0 6px #00ffff" }}
                />
              </div>
              <span className="text-xs text-gray-500 font-mono">{events.length} events</span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {events.length === 0 ? (
                <div className="text-gray-500 text-xs text-center py-6">
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    Awaiting agent activity...
                  </motion.div>
                </div>
              ) : (
                events.slice(-20).map((event) => (
                  <EventLogItem key={event.id} event={event} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Current Status Footer */}
        <div className="relative border-t border-cyan-500/30">
          <div
            className="p-3"
            style={{
              background: "linear-gradient(135deg, rgba(10,10,30,0.9) 0%, rgba(20,20,50,0.9) 100%)",
            }}
          >
            <div className="flex items-center gap-3">
              <motion.div
                className={`w-3 h-3 rounded-full ${currentAgent ? "bg-cyan-400" : "bg-gray-600"}`}
                animate={currentAgent ? { scale: [1, 1.2, 1], opacity: [1, 0.7, 1] } : {}}
                transition={{ duration: 1, repeat: Infinity }}
                style={currentAgent ? { boxShadow: "0 0 10px #00ffff" } : {}}
              />
              <div className="flex-1">
                <div className="text-xs text-gray-400">CURRENT AGENT</div>
                <div className={`text-sm font-bold ${currentAgent ? "neon-text-cyan" : "text-gray-500"}`}>
                  {currentAgent || "STANDBY"}
                </div>
              </div>
              {currentAgent && (
                <motion.div
                  className="text-xs text-cyan-400/70 font-mono"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  PROCESSING...
                </motion.div>
              )}
            </div>
          </div>

          {/* Animated bottom border */}
          <motion.div
            className="absolute inset-x-0 bottom-0 h-0.5"
            style={{
              background: currentAgent
                ? "linear-gradient(90deg, transparent, #00ffff, #ff00ff, #00ffff, transparent)"
                : "linear-gradient(90deg, transparent, #333, transparent)",
            }}
            animate={currentAgent ? { backgroundPosition: ["0% 50%", "100% 50%"] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </div>
    </>
  );
}
