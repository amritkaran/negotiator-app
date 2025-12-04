"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Business } from "@/types";

// Collapsible Section Component
function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = true,
  forceCollapse = false,
  colorClass = "blue",
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  forceCollapse?: boolean;
  colorClass?: "blue" | "green" | "purple" | "orange" | "yellow";
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasBeenManuallyToggled, setHasBeenManuallyToggled] = useState(false);

  // When forceCollapse becomes true, collapse the section (unless user manually opened it)
  useEffect(() => {
    if (forceCollapse && !hasBeenManuallyToggled) {
      setIsOpen(false);
    }
  }, [forceCollapse, hasBeenManuallyToggled]);

  const handleToggle = () => {
    setHasBeenManuallyToggled(true);
    setIsOpen(!isOpen);
  };

  const colorStyles = {
    blue: { bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-800", hover: "hover:bg-blue-100" },
    green: { bg: "bg-green-50", border: "border-green-100", text: "text-green-800", hover: "hover:bg-green-100" },
    purple: { bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-800", hover: "hover:bg-purple-100" },
    orange: { bg: "bg-orange-50", border: "border-orange-100", text: "text-orange-800", hover: "hover:bg-orange-100" },
    yellow: { bg: "bg-yellow-50", border: "border-yellow-100", text: "text-yellow-800", hover: "hover:bg-yellow-100" },
  };

  const styles = colorStyles[colorClass];

  return (
    <div className={`${styles.bg} rounded-lg border ${styles.border} overflow-hidden`}>
      <button
        onClick={handleToggle}
        className={`w-full px-4 py-3 flex items-center justify-between ${styles.hover} transition-colors`}
      >
        <h3 className={`font-semibold ${styles.text} flex items-center gap-2`}>
          <span>{icon}</span> {title}
        </h3>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className={`${styles.text}`}
        >
          ▼
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pb-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ResearchStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "error";
  result?: string;
  details?: Record<string, unknown>;
}

interface PriceIntel {
  estimatedDistance: number;
  estimatedDuration: number;
  baselinePrice: { low: number; mid: number; high: number };
  factors: string[];
  confidence: "high" | "medium" | "low";
}

interface VendorAnalysis {
  businessId: string;
  businessName: string;
  sentiment: string;
  pricePerception: string;
  professionalism: string;
  keyInsights: string[];
  score: number;
}

interface RankedVendor extends Business {
  ranking: number;
  scores: {
    proximity: number;
    rating: number;
    reviews: number;
    analysis: number;
    total: number;
  };
  reasoning: string;
  analysis?: VendorAnalysis;
}

interface Strategy {
  businessId: string;
  strategy: string;
  targetPrice: number;
  openingOffer: number;
}

interface ResearchPanelProps {
  requirements: {
    service: string;
    from: string;
    to?: string;
    date?: string;
    time?: string;
    passengers?: number;
    vehicleType?: string;
  };
  sessionId: string;
  onComplete: (data: {
    businesses: RankedVendor[];
    priceIntel: PriceIntel;
    strategies: Strategy[];
  }) => void;
  onError: (error: string) => void;
}

export function ResearchPanel({
  requirements,
  sessionId,
  onComplete,
  onError,
}: ResearchPanelProps) {
  const [steps, setSteps] = useState<ResearchStep[]>([]);
  const [plan, setPlan] = useState<string>("");
  const [priceIntel, setPriceIntel] = useState<PriceIntel | null>(null);
  const [vendors, setVendors] = useState<RankedVendor[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [currentAnalyzing, setCurrentAnalyzing] = useState<string>("");
  const [isComplete, setIsComplete] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [steps, plan]);

  useEffect(() => {
    const startResearch = async () => {
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
                handleEvent(data);
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : "Research failed");
      }
    };

    startResearch();
  }, [requirements, sessionId]);

  const handleEvent = (data: Record<string, unknown>) => {
    switch (data.type) {
      case "steps":
        setSteps(data.steps as ResearchStep[]);
        break;

      case "step_update":
        setSteps((prev) =>
          prev.map((s) =>
            s.id === (data.step as ResearchStep).id
              ? (data.step as ResearchStep)
              : s
          )
        );
        break;

      case "plan":
        setPlan(data.plan as string);
        break;

      case "price_intel":
        setPriceIntel(data.priceIntel as PriceIntel);
        break;

      case "analyzing_vendor":
        setCurrentAnalyzing(data.businessName as string);
        break;

      case "ranking":
        setVendors(data.vendors as RankedVendor[]);
        setCurrentAnalyzing("");
        break;

      case "strategies":
        setStrategies(data.strategies as Strategy[]);
        break;

      case "complete":
        setIsComplete(true);
        onComplete({
          businesses: data.businesses as RankedVendor[],
          priceIntel: (data as { priceIntel: PriceIntel }).priceIntel,
          strategies: (data as { strategies: Strategy[] }).strategies,
        });
        break;

      case "error":
        onError(data.message as string);
        break;
    }
  };

  const getStepIcon = (status: ResearchStep["status"]) => {
    switch (status) {
      case "pending":
        return "⏳";
      case "running":
        return "🔄";
      case "completed":
        return "✅";
      case "error":
        return "❌";
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="text-2xl">🔬</span>
          Deep Research in Progress
        </h2>
        <p className="text-purple-100 text-sm mt-1">
          Analyzing vendors and preparing negotiation strategy
        </p>
      </div>

      {/* Steps Progress */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex flex-wrap gap-2">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                ${
                  step.status === "completed"
                    ? "bg-green-100 text-green-700"
                    : step.status === "running"
                    ? "bg-blue-100 text-blue-700 animate-pulse"
                    : step.status === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-500"
                }
              `}
            >
              <span>{getStepIcon(step.status)}</span>
              <span>{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Research Log */}
      <div ref={logRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Research Plan */}
        {plan && (
          <CollapsibleSection
            title="Research Plan"
            icon="📋"
            colorClass="blue"
            forceCollapse={isComplete}
          >
            <div className="text-sm text-blue-700 whitespace-pre-line">{plan}</div>
          </CollapsibleSection>
        )}

        {/* Price Intelligence */}
        {priceIntel && (
          <CollapsibleSection
            title="Price Intelligence"
            icon="💰"
            colorClass="green"
            forceCollapse={isComplete}
          >
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center p-2 bg-white rounded-lg">
                <div className="text-xs text-gray-500">Budget</div>
                <div className="text-lg font-bold text-green-600">
                  ₹{priceIntel.baselinePrice.low}
                </div>
              </div>
              <div className="text-center p-2 bg-white rounded-lg border-2 border-green-300">
                <div className="text-xs text-gray-500">Expected</div>
                <div className="text-lg font-bold text-green-700">
                  ₹{priceIntel.baselinePrice.mid}
                </div>
              </div>
              <div className="text-center p-2 bg-white rounded-lg">
                <div className="text-xs text-gray-500">Max</div>
                <div className="text-lg font-bold text-orange-600">
                  ₹{priceIntel.baselinePrice.high}
                </div>
              </div>
            </div>
            {priceIntel.estimatedDistance > 0 && (
              <div className="text-sm text-green-700 mb-2">
                📍 Distance: {priceIntel.estimatedDistance.toFixed(1)} km •
                ⏱️ ~{Math.round(priceIntel.estimatedDuration)} mins
              </div>
            )}
            <div className="text-xs text-green-600">
              {priceIntel.factors.map((factor, idx) => (
                <div key={idx}>• {factor}</div>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Confidence: {priceIntel.confidence === "high" ? "🟢 High" : priceIntel.confidence === "medium" ? "🟡 Medium" : "🟠 Low"}
            </div>
          </CollapsibleSection>
        )}

        {/* Current Analysis */}
        {currentAnalyzing && (
          <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-100 animate-pulse">
            <div className="flex items-center gap-2 text-yellow-700">
              <span className="text-lg">🔍</span>
              <span className="text-sm font-medium">
                Analyzing: {currentAnalyzing}...
              </span>
            </div>
          </div>
        )}

        {/* Ranked Vendors */}
        {vendors.length > 0 && (
          <CollapsibleSection
            title="Vendor Rankings"
            icon="🏆"
            colorClass="purple"
            forceCollapse={isComplete}
          >
            <div className="space-y-3">
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className={`
                    bg-white rounded-lg p-3 border
                    ${vendor.ranking === 1 ? "border-yellow-400 ring-2 ring-yellow-200" : "border-gray-200"}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">
                        {vendor.ranking === 1 ? "🥇" : vendor.ranking === 2 ? "🥈" : vendor.ranking === 3 ? "🥉" : `#${vendor.ranking}`}
                      </span>
                      <div>
                        <div className="font-semibold text-gray-800 flex items-center gap-2">
                          {vendor.name}
                          <a
                            href={`https://www.google.com/maps/place/?q=place_id:${vendor.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-700 transition-colors"
                            title="View on Google Maps"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                          </a>
                        </div>
                        <div className="text-xs text-gray-500">
                          {vendor.rating}★ ({vendor.reviewCount} reviews) • {vendor.distance}km
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-purple-600">
                        {vendor.scores.total}
                      </div>
                      <div className="text-xs text-gray-400">score</div>
                    </div>
                  </div>

                  {/* Score breakdown */}
                  <div className="mt-2 flex gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                      📍 {vendor.scores.proximity}%
                    </span>
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                      ⭐ {vendor.scores.rating}%
                    </span>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
                      📊 {vendor.scores.analysis}%
                    </span>
                  </div>

                  {/* Reasoning */}
                  <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                    💡 {vendor.reasoning}
                  </div>

                  {/* Analysis insights */}
                  {vendor.analysis?.keyInsights && vendor.analysis.keyInsights.length > 0 && (
                    <div className="mt-2 text-xs text-purple-600">
                      {vendor.analysis.keyInsights.slice(0, 2).map((insight, idx) => (
                        <div key={idx}>• {insight}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Negotiation Strategies */}
        {strategies.length > 0 && (
          <CollapsibleSection
            title="Negotiation Strategy"
            icon="🎯"
            colorClass="orange"
            forceCollapse={isComplete}
          >
            <div className="space-y-3">
              {strategies.map((strategy) => {
                const vendor = vendors.find((v) => v.id === strategy.businessId);
                return (
                  <div key={strategy.businessId} className="bg-white rounded-lg p-3 border border-orange-200">
                    <div className="font-medium text-gray-800 mb-1">
                      {vendor?.name}
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      {strategy.strategy}
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-green-600">
                        🎯 Target: ₹{strategy.targetPrice}
                      </span>
                      <span className="text-blue-600">
                        💬 Open with: ₹{strategy.openingOffer}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Complete Message */}
        {isComplete && (
          <div className="bg-green-100 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">✅</div>
            <div className="font-semibold text-green-800">Research Complete!</div>
            <div className="text-sm text-green-600">
              Ready to start negotiations
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
