"use client";

import { useState, useMemo } from "react";

interface PromptChange {
  area: string;
  currentBehavior: string;
  suggestedImprovement: string;
  expectedImpact: string;
  priority: "low" | "medium" | "high";
}

interface PromptChangeReviewProps {
  currentPrompt: string;
  suggestedChanges: PromptChange[];
  onAccept: (newPrompt: string, appliedChanges: string[]) => void;
  onReject: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function PromptChangeReview({
  currentPrompt,
  suggestedChanges,
  onAccept,
  onReject,
  isOpen,
  onClose,
}: PromptChangeReviewProps) {
  const [selectedChanges, setSelectedChanges] = useState<Set<number>>(
    new Set(suggestedChanges.map((_, idx) => idx)) // All selected by default
  );
  const [showDiff, setShowDiff] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);

  const toggleChange = (idx: number) => {
    setSelectedChanges((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
    setGeneratedPrompt(null); // Reset generated prompt when selection changes
  };

  const selectedImprovements = useMemo(() => {
    return suggestedChanges.filter((_, idx) => selectedChanges.has(idx));
  }, [suggestedChanges, selectedChanges]);

  const handleGenerateNewPrompt = async () => {
    if (selectedImprovements.length === 0) return;

    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPrompt,
          improvements: selectedImprovements,
        }),
      });

      const data = await response.json();
      if (data.newPrompt) {
        setGeneratedPrompt(data.newPrompt);
      }
    } catch (error) {
      console.error("Failed to generate new prompt:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (generatedPrompt) {
      const appliedChangeDescriptions = selectedImprovements.map(
        (imp) => `${imp.area}: ${imp.suggestedImprovement}`
      );
      onAccept(generatedPrompt, appliedChangeDescriptions);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-700 border-red-200";
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "low":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const renderDiff = () => {
    if (!generatedPrompt) return null;

    // Simple line-by-line diff
    const currentLines = currentPrompt.split("\n");
    const newLines = generatedPrompt.split("\n");

    return (
      <div className="font-mono text-xs max-h-96 overflow-y-auto bg-gray-900 rounded-lg p-3">
        {/* Show removed lines from current */}
        <div className="mb-4">
          <div className="text-gray-400 mb-2 font-sans text-sm">Current Prompt (will be replaced):</div>
          <div className="bg-red-900/30 rounded p-2 max-h-40 overflow-y-auto">
            {currentLines.slice(0, 20).map((line, idx) => (
              <div key={`old-${idx}`} className="text-red-300">
                <span className="text-red-500 mr-2">-</span>
                {line || " "}
              </div>
            ))}
            {currentLines.length > 20 && (
              <div className="text-gray-500">... and {currentLines.length - 20} more lines</div>
            )}
          </div>
        </div>

        {/* Show added lines in new */}
        <div>
          <div className="text-gray-400 mb-2 font-sans text-sm">New Prompt (with improvements):</div>
          <div className="bg-green-900/30 rounded p-2 max-h-40 overflow-y-auto">
            {newLines.slice(0, 30).map((line, idx) => (
              <div key={`new-${idx}`} className="text-green-300">
                <span className="text-green-500 mr-2">+</span>
                {line || " "}
              </div>
            ))}
            {newLines.length > 30 && (
              <div className="text-gray-500">... and {newLines.length - 30} more lines</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✨</span>
              <div>
                <h2 className="font-bold text-lg">Review Prompt Changes</h2>
                <p className="text-purple-200 text-sm">
                  Select improvements to apply to the negotiation prompt
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Suggested Changes */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span>🎯</span> Suggested Improvements ({selectedChanges.size}/{suggestedChanges.length} selected)
            </h3>
            <div className="space-y-3">
              {suggestedChanges.map((change, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg p-4 border-2 cursor-pointer transition-all ${
                    selectedChanges.has(idx)
                      ? "border-purple-500 bg-purple-50"
                      : "border-gray-200 bg-gray-50 opacity-60"
                  }`}
                  onClick={() => toggleChange(idx)}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                        selectedChanges.has(idx)
                          ? "bg-purple-600 border-purple-600 text-white"
                          : "border-gray-300"
                      }`}
                    >
                      {selectedChanges.has(idx) && "✓"}
                    </div>

                    {/* Change Details */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-gray-800">{change.area}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${getPriorityColor(
                            change.priority
                          )}`}
                        >
                          {change.priority.toUpperCase()}
                        </span>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-gray-500">Current:</span>
                          <span className="ml-2 text-gray-700">{change.currentBehavior}</span>
                        </div>
                        <div className="bg-white rounded p-2 border border-purple-200">
                          <span className="text-purple-600 font-medium">Improvement:</span>
                          <span className="ml-2 text-gray-800">{change.suggestedImprovement}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Expected Impact:</span>
                          <span className="ml-2 text-green-700">{change.expectedImpact}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          {selectedChanges.size > 0 && !generatedPrompt && (
            <div className="mb-6">
              <button
                onClick={handleGenerateNewPrompt}
                disabled={isGenerating}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Generating new prompt with GPT-4o...
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    Generate Updated Prompt ({selectedChanges.size} improvements)
                  </>
                )}
              </button>
            </div>
          )}

          {/* Diff View */}
          {generatedPrompt && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                  <span>📝</span> Prompt Changes Preview
                </h3>
                <button
                  onClick={() => setShowDiff(!showDiff)}
                  className="text-sm text-purple-600 hover:underline"
                >
                  {showDiff ? "Hide diff" : "Show diff"}
                </button>
              </div>

              {showDiff && renderDiff()}

              {/* Full new prompt */}
              <details className="mt-3">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  View full new prompt
                </summary>
                <pre className="mt-2 bg-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {generatedPrompt}
                </pre>
              </details>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 p-4 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {generatedPrompt
              ? "Review the changes above before applying"
              : `${selectedChanges.size} improvement${selectedChanges.size !== 1 ? "s" : ""} selected`}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                onReject();
                onClose();
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            {generatedPrompt ? (
              <button
                onClick={handleAccept}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center gap-2"
              >
                <span>✓</span>
                Apply Changes
              </button>
            ) : (
              <button
                onClick={handleGenerateNewPrompt}
                disabled={selectedChanges.size === 0 || isGenerating}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-400"
              >
                Preview Changes
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
