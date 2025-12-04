"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface AgentInfo {
  id: string;
  name: string;
  icon: string;
}

interface AgentHandoverOverlayProps {
  isActive: boolean;
  fromAgent: AgentInfo | null;
  toAgent: AgentInfo | null;
  onComplete?: () => void;
}

// Particle component for the data transfer effect
function DataParticle({ delay, index }: { delay: number; index: number }) {
  return (
    <motion.div
      className="absolute w-2 h-2 rounded-full"
      style={{
        background: `radial-gradient(circle, ${index % 2 === 0 ? '#00ffff' : '#ff00ff'}, transparent)`,
        boxShadow: `0 0 10px ${index % 2 === 0 ? '#00ffff' : '#ff00ff'}`,
        top: `${30 + Math.random() * 40}%`,
      }}
      initial={{ left: "20%", opacity: 0, scale: 0 }}
      animate={{
        left: ["20%", "50%", "80%"],
        opacity: [0, 1, 1, 0],
        scale: [0, 1.5, 1, 0],
        y: [0, -10 + Math.random() * 20, 0],
      }}
      transition={{
        duration: 1.2,
        delay: delay,
        ease: "easeInOut",
        times: [0, 0.3, 0.7, 1],
      }}
    />
  );
}

// Hexagonal node component
function HexNode({
  agent,
  side,
  status
}: {
  agent: AgentInfo;
  side: "left" | "right";
  status: "powering-down" | "powering-up" | "idle";
}) {
  const isLeft = side === "left";

  return (
    <motion.div
      className="relative flex flex-col items-center"
      initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {/* Outer glow ring */}
      <motion.div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: status === "powering-up"
            ? "radial-gradient(circle, rgba(0,255,255,0.3) 0%, transparent 70%)"
            : status === "powering-down"
            ? "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)"
            : "none",
        }}
        animate={{
          scale: status !== "idle" ? [1, 1.2, 1] : 1,
          opacity: status !== "idle" ? [0.5, 1, 0.5] : 0.3,
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main node */}
      <motion.div
        className={`
          relative w-24 h-24 rounded-2xl flex items-center justify-center
          ${status === "powering-up" ? "sci-fi-card-active" : "sci-fi-card"}
        `}
        style={{
          background: "linear-gradient(135deg, rgba(10,10,30,0.9) 0%, rgba(20,20,50,0.9) 100%)",
        }}
        animate={{
          boxShadow: status === "powering-up"
            ? [
                "0 0 20px rgba(0,255,255,0.3), inset 0 0 20px rgba(0,255,255,0.1)",
                "0 0 40px rgba(0,255,255,0.5), inset 0 0 30px rgba(0,255,255,0.2)",
                "0 0 20px rgba(0,255,255,0.3), inset 0 0 20px rgba(0,255,255,0.1)",
              ]
            : status === "powering-down"
            ? [
                "0 0 20px rgba(139,92,246,0.3), inset 0 0 20px rgba(139,92,246,0.1)",
                "0 0 10px rgba(139,92,246,0.1), inset 0 0 10px rgba(139,92,246,0.05)",
              ]
            : "0 0 10px rgba(0,255,255,0.1)",
          filter: status === "powering-down" ? ["brightness(1)", "brightness(0.5)"] : "brightness(1)",
        }}
        transition={{ duration: 1.5, repeat: status === "powering-up" ? Infinity : 0, ease: "easeInOut" }}
      >
        {/* Icon */}
        <motion.span
          className="text-4xl"
          animate={{
            scale: status === "powering-up" ? [1, 1.1, 1] : status === "powering-down" ? [1, 0.9] : 1,
            filter: status === "powering-down" ? ["brightness(1)", "brightness(0.5) grayscale(0.5)"] : "brightness(1)",
          }}
          transition={{ duration: 0.8, repeat: status === "powering-up" ? Infinity : 0 }}
        >
          {agent.icon}
        </motion.span>

        {/* Scan line effect */}
        {status === "powering-up" && (
          <motion.div
            className="absolute inset-0 overflow-hidden rounded-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="absolute w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
              animate={{ top: ["-10%", "110%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
        )}
      </motion.div>

      {/* Agent name */}
      <motion.div
        className={`mt-3 text-sm font-bold tracking-wider ${
          status === "powering-up" ? "neon-text-cyan" : "text-gray-400"
        }`}
        animate={{
          opacity: status === "powering-down" ? [1, 0.5] : 1,
        }}
      >
        {agent.name.toUpperCase()}
      </motion.div>

      {/* Status text */}
      <motion.div
        className={`text-xs mt-1 ${
          status === "powering-up" ? "text-cyan-400" :
          status === "powering-down" ? "text-purple-400" : "text-gray-500"
        }`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {status === "powering-up" && "INITIALIZING..."}
        {status === "powering-down" && "TRANSFERRING..."}
        {status === "idle" && "STANDBY"}
      </motion.div>
    </motion.div>
  );
}

export function AgentHandoverOverlay({
  isActive,
  fromAgent,
  toAgent,
  onComplete,
}: AgentHandoverOverlayProps) {
  const [particles, setParticles] = useState<number[]>([]);

  useEffect(() => {
    if (isActive) {
      // Generate particles
      setParticles(Array.from({ length: 12 }, (_, i) => i));

      // Auto-complete after animation
      const timer = setTimeout(() => {
        onComplete?.();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isActive, onComplete]);

  return (
    <AnimatePresence>
      {isActive && fromAgent && toAgent && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop with blur */}
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Grid background */}
          <div className="absolute inset-0 sci-fi-grid opacity-30" />

          {/* Main content */}
          <motion.div
            className="relative w-full max-w-2xl px-8"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {/* Title */}
            <motion.div
              className="text-center mb-8"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <motion.div
                className="text-xs tracking-[0.3em] text-cyan-400 mb-2"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                ⚡ AGENT HANDOVER IN PROGRESS ⚡
              </motion.div>
              <h2 className="text-2xl font-bold text-white">
                Transferring Context
              </h2>
            </motion.div>

            {/* Agents and connection */}
            <div className="flex items-center justify-between">
              {/* From Agent */}
              <HexNode agent={fromAgent} side="left" status="powering-down" />

              {/* Connection beam */}
              <div className="flex-1 mx-6 relative h-24 flex items-center">
                {/* Base line */}
                <div className="w-full h-0.5 bg-gradient-to-r from-purple-500 via-cyan-400 to-cyan-500 opacity-30" />

                {/* Animated beam */}
                <motion.div
                  className="absolute inset-y-0 left-0 right-0 flex items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <motion.div
                    className="w-full h-1 rounded-full"
                    style={{
                      background: "linear-gradient(90deg, transparent, #00ffff, #ff00ff, #00ffff, transparent)",
                      backgroundSize: "200% 100%",
                    }}
                    animate={{
                      backgroundPosition: ["0% 50%", "100% 50%", "200% 50%"],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                </motion.div>

                {/* Data packets */}
                <div className="absolute inset-0">
                  {particles.map((_, index) => (
                    <DataParticle key={index} delay={index * 0.15} index={index} />
                  ))}
                </div>

                {/* Arrow indicator */}
                <motion.div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  animate={{
                    x: ["-50%", "0%", "-50%"],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <span className="text-2xl text-cyan-400">→</span>
                </motion.div>

                {/* Data info */}
                <motion.div
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-gray-400 whitespace-nowrap"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    ◆ CONTEXT DATA ◆ MEMORY STATE ◆ TASK QUEUE ◆
                  </motion.span>
                </motion.div>
              </div>

              {/* To Agent */}
              <HexNode agent={toAgent} side="right" status="powering-up" />
            </div>

            {/* Progress bar */}
            <motion.div
              className="mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: "linear-gradient(90deg, #8b5cf6, #00ffff, #ff00ff)",
                  }}
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2.5, ease: "easeInOut" }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>TRANSFERRING</span>
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  ●●●
                </motion.span>
                <span>COMPLETE</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Corner decorations */}
          <div className="absolute top-4 left-4 w-16 h-16 border-l-2 border-t-2 border-cyan-500/30" />
          <div className="absolute top-4 right-4 w-16 h-16 border-r-2 border-t-2 border-cyan-500/30" />
          <div className="absolute bottom-4 left-4 w-16 h-16 border-l-2 border-b-2 border-purple-500/30" />
          <div className="absolute bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 border-purple-500/30" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Mini version for inline display in workflow panel
export function AgentHandoverMini({
  fromAgent,
  toAgent,
  isActive,
}: {
  fromAgent: string;
  toAgent: string;
  isActive: boolean;
}) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-900/50 to-cyan-900/50 border border-cyan-500/30"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
        >
          <motion.span
            className="text-purple-400"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            {fromAgent}
          </motion.span>

          <div className="flex-1 flex items-center gap-1">
            <motion.div
              className="flex-1 h-0.5 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full overflow-hidden"
            >
              <motion.div
                className="h-full w-4 bg-white rounded-full"
                animate={{ x: ["-100%", "1000%"] }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          </div>

          <motion.span
            className="text-cyan-400 neon-text-cyan"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            {toAgent}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
