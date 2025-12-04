"use client";

import { useState, useEffect } from "react";

interface CallAnalysis {
  vendorName: string;
  priceObtained: number | null;
  tacticsUsed: string[];
  effectiveMoves: string[];
  missedOpportunities: string[];
  overallScore: number;
}

interface SafetyIssue {
  severity: "low" | "medium" | "high";
  issue: string;
  recommendation: string;
  vendorName?: string;
}

interface PromptImprovement {
  area: string;
  currentBehavior: string;
  suggestedImprovement: string;
  expectedImpact: string;
  priority: "low" | "medium" | "high";
}

interface LearningAnalysis {
  callAnalysis: {
    analyses: CallAnalysis[];
    overallReasoning: string;
  };
  safetyCheck: {
    issues: SafetyIssue[];
    reasoning: string;
    passed: boolean;
  };
  promptEnhancements: {
    improvements: PromptImprovement[];
    reasoning: string;
  };
  summary: string;
}

interface LearningPanelProps {
  analysis: LearningAnalysis | null;
  isLoading: boolean;
  error: string | null;
  currentStep: "idle" | "call_analyzer" | "safety_checker" | "prompt_enhancer" | "complete";
}

// Labor illusion messages for each phase
const laborIllusionMessages = {
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
};

export function LearningPanel({ analysis, isLoading, error, currentStep }: LearningPanelProps) {
  const [activeTab, setActiveTab] = useState<"calls" | "safety" | "prompts" | "summary">("summary");
  const [currentMessage, setCurrentMessage] = useState("");
  const [messageIndex, setMessageIndex] = useState(0);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);

  // Labor illusion effect - cycle through messages
  useEffect(() => {
    if (!isLoading || analysis) return;

    const messages = laborIllusionMessages[currentStep as keyof typeof laborIllusionMessages] || [];
    if (messages.length === 0) return;

    // Set initial message
    setCurrentMessage(messages[0]);
    setMessageIndex(0);

    // Cycle through messages
    const interval = setInterval(() => {
      setMessageIndex((prev) => {
        const nextIndex = (prev + 1) % messages.length;
        setCurrentMessage(messages[nextIndex]);

        // Add to completed tasks (for visual effect)
        if (prev < messages.length - 1) {
          setCompletedTasks((prevTasks) => {
            const newTasks = [...prevTasks, messages[prev]];
            // Keep only last 5 tasks
            return newTasks.slice(-5);
          });
        }

        return nextIndex;
      });
    }, 1800); // Change message every 1.8 seconds

    return () => clearInterval(interval);
  }, [isLoading, analysis, currentStep]);

  // Reset completed tasks when step changes
  useEffect(() => {
    setCompletedTasks([]);
  }, [currentStep]);

  const getStepStatus = (step: string) => {
    const steps = ["call_analyzer", "safety_checker", "prompt_enhancer"];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);

    if (currentStep === "complete") return "completed";
    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "running";
    return "pending";
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-red-100 text-red-700 border-red-200";
      case "medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "low": return "bg-green-100 text-green-700 border-green-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "bg-red-500";
      case "medium": return "bg-yellow-500";
      case "low": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-green-600";
    if (score >= 6) return "text-yellow-600";
    if (score >= 4) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          <div>
            <h2 className="font-bold text-lg">Learning Phase</h2>
            <p className="text-purple-200 text-xs">AI-powered analysis using GPT-4o</p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-gray-50 p-3 border-b">
        <div className="flex items-center justify-between">
          {[
            { id: "call_analyzer", name: "Call Analysis", icon: "📊" },
            { id: "safety_checker", name: "Safety Check", icon: "🛡️" },
            { id: "prompt_enhancer", name: "Prompt Enhance", icon: "✨" },
          ].map((step, index) => {
            const status = getStepStatus(step.id);
            return (
              <div key={step.id} className="flex items-center">
                <div className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                  ${status === "running" ? "bg-purple-100 text-purple-700 animate-pulse" : ""}
                  ${status === "completed" ? "bg-green-100 text-green-700" : ""}
                  ${status === "pending" ? "bg-gray-100 text-gray-500" : ""}
                `}>
                  <span>{step.icon}</span>
                  <span className="font-medium">{step.name}</span>
                  {status === "completed" && <span>✓</span>}
                  {status === "running" && <span className="animate-spin">⏳</span>}
                </div>
                {index < 2 && (
                  <div className={`w-8 h-0.5 mx-1 ${status === "completed" ? "bg-green-400" : "bg-gray-300"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Loading State - Labor Illusion */}
      {isLoading && !analysis && (
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          {/* Current Task Header */}
          <div className="bg-gradient-to-r from-purple-100 to-indigo-100 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="text-3xl animate-pulse">🧠</div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-purple-800">
                  {currentStep === "call_analyzer" && "Analyzing Negotiations"}
                  {currentStep === "safety_checker" && "Running Safety Check"}
                  {currentStep === "prompt_enhancer" && "Generating Improvements"}
                  {currentStep === "idle" && "Preparing Analysis"}
                </div>
                <div className="text-xs text-purple-600 mt-0.5">GPT-4o is processing your data</div>
              </div>
            </div>
          </div>

          {/* Current Task with Typewriter Effect */}
          <div className="bg-white border border-purple-200 rounded-lg p-4 mb-4 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
              <span className="text-sm text-gray-700 font-medium">{currentMessage || "Initializing..."}</span>
            </div>

            {/* Progress bar animation */}
            <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full animate-pulse"
                style={{
                  width: `${((messageIndex + 1) / (laborIllusionMessages[currentStep as keyof typeof laborIllusionMessages]?.length || 1)) * 100}%`,
                  transition: 'width 0.5s ease-out'
                }}
              />
            </div>
          </div>

          {/* Completed Tasks Feed */}
          <div className="flex-1 overflow-y-auto">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Recent Activity
            </div>
            <div className="space-y-2">
              {completedTasks.map((task, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm text-gray-600 animate-fade-in"
                  style={{
                    opacity: 1 - (idx * 0.15),
                    animationDelay: `${idx * 100}ms`
                  }}
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

          {/* Stats Preview */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold text-purple-600">
                  {currentStep === "call_analyzer" ? "..." : currentStep === "safety_checker" ? "✓" : currentStep === "prompt_enhancer" ? "✓" : "..."}
                </div>
                <div className="text-xs text-gray-500">Calls</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold text-purple-600">
                  {currentStep === "safety_checker" ? "..." : currentStep === "prompt_enhancer" ? "✓" : "—"}
                </div>
                <div className="text-xs text-gray-500">Safety</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold text-purple-600">
                  {currentStep === "prompt_enhancer" ? "..." : "—"}
                </div>
                <div className="text-xs text-gray-500">Improve</div>
              </div>
            </div>
          </div>

          {/* Estimated Time */}
          <div className="mt-3 text-center">
            <span className="text-xs text-gray-400">Usually takes 10-20 seconds</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <span className="text-2xl">❌</span>
            <p className="text-red-700 font-medium mt-2">Analysis Failed</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && (
        <>
          {/* Tabs */}
          <div className="flex border-b bg-gray-50">
            {[
              { id: "summary", name: "Summary", icon: "📋" },
              { id: "calls", name: "Calls", icon: "📞" },
              { id: "safety", name: "Safety", icon: "🛡️" },
              { id: "prompts", name: "Improve", icon: "✨" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`
                  flex-1 px-3 py-2 text-sm font-medium flex items-center justify-center gap-1
                  ${activeTab === tab.id
                    ? "bg-white border-b-2 border-purple-600 text-purple-700"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }
                `}
              >
                <span>{tab.icon}</span>
                <span>{tab.name}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Summary Tab */}
            {activeTab === "summary" && (
              <div className="space-y-4">
                {/* Score Overview */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${getScoreColor(
                      analysis.callAnalysis.analyses.reduce((sum, a) => sum + a.overallScore, 0) /
                      (analysis.callAnalysis.analyses.length || 1)
                    )}`}>
                      {(analysis.callAnalysis.analyses.reduce((sum, a) => sum + a.overallScore, 0) /
                        (analysis.callAnalysis.analyses.length || 1)).toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-600">Avg Score</div>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${
                    analysis.safetyCheck.passed ? "bg-green-50" : "bg-red-50"
                  }`}>
                    <div className="text-2xl">{analysis.safetyCheck.passed ? "✅" : "⚠️"}</div>
                    <div className="text-xs text-gray-600">Safety</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {analysis.promptEnhancements.improvements.filter(i => i.priority === "high").length}
                    </div>
                    <div className="text-xs text-gray-600">Key Fixes</div>
                  </div>
                </div>

                {/* Overall Reasoning */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <span>🎯</span> Analysis Summary
                  </h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {analysis.callAnalysis.overallReasoning}
                  </p>
                </div>

                {/* Quick Actions */}
                {analysis.promptEnhancements.improvements.filter(i => i.priority === "high").length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <h3 className="font-semibold text-orange-700 mb-2 flex items-center gap-2">
                      <span>⚡</span> High Priority Improvements
                    </h3>
                    <ul className="space-y-2">
                      {analysis.promptEnhancements.improvements
                        .filter(i => i.priority === "high")
                        .map((imp, idx) => (
                          <li key={idx} className="text-sm text-orange-800 flex items-start gap-2">
                            <span>•</span>
                            <span><strong>{imp.area}:</strong> {imp.suggestedImprovement}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Calls Tab */}
            {activeTab === "calls" && (
              <div className="space-y-4">
                {analysis.callAnalysis.analyses.map((call, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg p-4 border">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                        <span>📞</span> {call.vendorName}
                      </h3>
                      <div className={`text-lg font-bold ${getScoreColor(call.overallScore)}`}>
                        {call.overallScore}/10
                      </div>
                    </div>

                    {call.priceObtained && (
                      <div className="mb-3 bg-green-100 text-green-700 px-3 py-1 rounded inline-block text-sm">
                        Price: ₹{call.priceObtained}
                      </div>
                    )}

                    {/* Tactics Used */}
                    {call.tacticsUsed.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">Tactics Used:</div>
                        <div className="flex flex-wrap gap-1">
                          {call.tacticsUsed.map((tactic, i) => (
                            <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                              {tactic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Effective Moves */}
                    {call.effectiveMoves.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-medium text-green-600 mb-1">✓ What Worked:</div>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {call.effectiveMoves.map((move, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="text-green-500">+</span> {move}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Missed Opportunities */}
                    {call.missedOpportunities.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-orange-600 mb-1">⚠ Missed Opportunities:</div>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {call.missedOpportunities.map((opp, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="text-orange-500">-</span> {opp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}

                {/* Overall Reasoning */}
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <h3 className="font-semibold text-purple-700 mb-2">🧠 AI Reasoning</h3>
                  <p className="text-sm text-purple-800 whitespace-pre-wrap">
                    {analysis.callAnalysis.overallReasoning}
                  </p>
                </div>
              </div>
            )}

            {/* Safety Tab */}
            {activeTab === "safety" && (
              <div className="space-y-4">
                {/* Status Badge */}
                <div className={`rounded-lg p-4 text-center ${
                  analysis.safetyCheck.passed ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                }`}>
                  <span className="text-4xl">{analysis.safetyCheck.passed ? "✅" : "⚠️"}</span>
                  <p className={`font-semibold mt-2 ${analysis.safetyCheck.passed ? "text-green-700" : "text-red-700"}`}>
                    {analysis.safetyCheck.passed ? "Safety Check Passed" : "Issues Detected"}
                  </p>
                </div>

                {/* Issues */}
                {analysis.safetyCheck.issues.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-700">Issues Found:</h3>
                    {analysis.safetyCheck.issues.map((issue, idx) => (
                      <div key={idx} className="bg-white rounded-lg p-4 border shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-2 h-2 rounded-full ${getSeverityColor(issue.severity)}`} />
                          <span className={`text-xs font-medium uppercase ${
                            issue.severity === "high" ? "text-red-600" :
                            issue.severity === "medium" ? "text-yellow-600" : "text-blue-600"
                          }`}>
                            {issue.severity} severity
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 font-medium mb-2">{issue.issue}</p>
                        <div className="bg-blue-50 rounded p-2">
                          <p className="text-xs text-blue-700">
                            <span className="font-medium">Recommendation:</span> {issue.recommendation}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-green-700">No safety issues detected. The agent behaved professionally.</p>
                  </div>
                )}

                {/* Reasoning */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-700 mb-2">🛡️ Safety Analysis</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {analysis.safetyCheck.reasoning}
                  </p>
                </div>
              </div>
            )}

            {/* Prompts Tab */}
            {activeTab === "prompts" && (
              <div className="space-y-4">
                {analysis.promptEnhancements.improvements.length > 0 ? (
                  <>
                    {analysis.promptEnhancements.improvements.map((imp, idx) => (
                      <div key={idx} className={`rounded-lg p-4 border ${getPriorityColor(imp.priority)}`}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold flex items-center gap-2">
                            <span>🎯</span> {imp.area}
                          </h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            imp.priority === "high" ? "bg-red-200 text-red-800" :
                            imp.priority === "medium" ? "bg-yellow-200 text-yellow-800" :
                            "bg-green-200 text-green-800"
                          }`}>
                            {imp.priority.toUpperCase()}
                          </span>
                        </div>

                        <div className="space-y-3 text-sm">
                          <div>
                            <div className="font-medium text-gray-500 text-xs mb-1">Current Behavior:</div>
                            <p className="text-gray-700">{imp.currentBehavior}</p>
                          </div>
                          <div className="bg-white bg-opacity-50 rounded p-2">
                            <div className="font-medium text-gray-500 text-xs mb-1">Suggested Improvement:</div>
                            <p className="text-gray-800 font-medium">{imp.suggestedImprovement}</p>
                          </div>
                          <div>
                            <div className="font-medium text-gray-500 text-xs mb-1">Expected Impact:</div>
                            <p className="text-gray-700">{imp.expectedImpact}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <span className="text-4xl">👍</span>
                    <p className="text-green-700 mt-2">The agent is performing well. No major improvements needed.</p>
                  </div>
                )}

                {/* Reasoning */}
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <h3 className="font-semibold text-purple-700 mb-2">✨ Enhancement Analysis</h3>
                  <p className="text-sm text-purple-800 whitespace-pre-wrap">
                    {analysis.promptEnhancements.reasoning}
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Idle State */}
      {!isLoading && !analysis && !error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <span className="text-4xl">🧠</span>
            <p className="mt-2">Learning analysis will appear here</p>
            <p className="text-sm">Complete vendor simulations to start</p>
          </div>
        </div>
      )}
    </div>
  );
}
