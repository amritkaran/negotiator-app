"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface EvalMetrics {
  quoteObtainedRate: number;
  negotiationAttemptRate: number;
  negotiationSuccessRate: number;
  safetyRate: number;
  totalCalls: number;
  completedCalls: number;
  callsWithQuotes: number;
  callsWithNegotiationAttempt: number;
  callsWithSuccessfulNegotiation: number;
  unsafeCalls: number;
  avgPriceReductionPercent: number;
  avgQuotedPrice: number;
  avgFinalPrice: number;
  totalSavings: number;
  outcomes: {
    completed: number;
    noAnswer: number;
    busy: number;
    rejected: number;
    failed: number;
  };
  safetyIssues: { issue: string; count: number }[];
}

interface EvalRun {
  id: string;
  runAt: string;
  metrics: EvalMetrics;
  callIds: string[];
  notes?: string;
}

type DataFilter = "all" | "actual" | "synthetic";

// Simple bar component for the charts
function MetricBar({
  label,
  value,
  color,
  description,
}: {
  label: string;
  value: number;
  color: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="font-semibold text-gray-800">{label}</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <span className={`text-2xl font-bold ${color}`}>{value}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color.replace("text-", "bg-")}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// Donut chart component
function DonutChart({
  data,
  title,
}: {
  data: { label: string; value: number; color: string }[];
  title: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = 0;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="font-semibold text-gray-800 mb-3">{title}</h3>
      <div className="flex items-center gap-4">
        <svg width="120" height="120" viewBox="0 0 120 120">
          {data.map((d, i) => {
            if (d.value === 0) return null;
            const angle = (d.value / total) * 360;
            const startAngle = currentAngle;
            currentAngle += angle;

            const startRad = (startAngle - 90) * (Math.PI / 180);
            const endRad = (currentAngle - 90) * (Math.PI / 180);

            const x1 = 60 + 50 * Math.cos(startRad);
            const y1 = 60 + 50 * Math.sin(startRad);
            const x2 = 60 + 50 * Math.cos(endRad);
            const y2 = 60 + 50 * Math.sin(endRad);

            const largeArc = angle > 180 ? 1 : 0;

            return (
              <path
                key={i}
                d={`M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={d.color}
                stroke="white"
                strokeWidth="2"
              />
            );
          })}
          <circle cx="60" cy="60" r="30" fill="white" />
          <text
            x="60"
            y="65"
            textAnchor="middle"
            className="text-lg font-bold"
            fill="#374151"
          >
            {total}
          </text>
        </svg>
        <div className="flex flex-col gap-1">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-gray-600">
                {d.label}: {d.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Funnel chart component for conversion visualization
function FunnelChart({
  data,
  title,
}: {
  data: { label: string; value: number; color: string }[];
  title: string;
}) {
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="font-semibold text-gray-800 mb-3">{title}</h3>
      <div className="flex flex-col gap-2">
        {data.map((d, i) => {
          const widthPercent = (d.value / maxValue) * 100;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 flex justify-center">
                <div
                  className="h-10 rounded-md flex items-center justify-center text-white text-sm font-medium transition-all duration-500"
                  style={{
                    width: `${Math.max(widthPercent, 20)}%`,
                    backgroundColor: d.color,
                  }}
                >
                  {d.value}
                </div>
              </div>
              <div className="w-32 text-sm text-gray-600 truncate">
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EvalPage() {
  const [metrics, setMetrics] = useState<EvalMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callLimit, setCallLimit] = useState(20);
  const [lastRun, setLastRun] = useState<EvalRun | null>(null);
  const [fromSaved, setFromSaved] = useState(false);
  const [dataFilter, setDataFilter] = useState<DataFilter>("all");

  // Load saved eval on page load
  const loadSavedEval = async () => {
    try {
      const res = await fetch(`/api/eval/metrics?saved=true`);
      const data = await res.json();
      if (data.success && data.fromSaved) {
        setMetrics(data.metrics);
        setLastRun(data.run);
        setFromSaved(true);
      }
    } catch {
      // No saved eval, that's fine
    }
  };

  // Run fresh eval with transcript analysis
  const runFreshEval = async () => {
    setLoading(true);
    setError(null);
    setFromSaved(false);
    try {
      const res = await fetch(
        `/api/eval/metrics?limit=${callLimit}&analyze=true&filter=${dataFilter}`
      );
      const data = await res.json();
      if (data.success) {
        setMetrics(data.metrics);
        setLastRun(null);
      } else {
        setError(data.error || "Failed to fetch metrics");
      }
    } catch {
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  };

  // Save current eval to database
  const saveEval = async () => {
    if (!metrics) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/eval/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: callLimit,
          analyzeTranscripts: true,
          dataFilter,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLastRun(data.run);
        setFromSaved(true);
        setMetrics(data.run.metrics);
      } else {
        setError(data.error || "Failed to save eval");
      }
    } catch {
      setError("Failed to save eval");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadSavedEval(); // Try to load saved eval first
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-900 to-purple-800 px-6 py-4 shadow-lg">
        <div className="flex items-center gap-4 mb-2">
          <Link
            href="/"
            className="text-sm text-gray-300 hover:text-white px-3 py-1 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1"
          >
            ← Back
          </Link>
          <Link
            href="/history"
            className="text-sm text-gray-300 hover:text-white px-3 py-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            Call History
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Eval Dashboard</h1>
            <p className="text-sm text-gray-300">
              Track negotiation bot performance
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={dataFilter}
              onChange={(e) => setDataFilter(e.target.value as DataFilter)}
              className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="all">All Calls</option>
              <option value="actual">Actual Only</option>
              <option value="synthetic">Synthetic Only</option>
            </select>
            <select
              value={callLimit}
              onChange={(e) => setCallLimit(Number(e.target.value))}
              className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value={5}>Last 5 calls</option>
              <option value={10}>Last 10 calls</option>
              <option value={20}>Last 20 calls</option>
              <option value={50}>Last 50 calls</option>
              <option value={100}>Last 100 calls</option>
            </select>
            <button
              onClick={runFreshEval}
              disabled={loading || saving}
              className="bg-white text-indigo-900 px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {loading ? "Analyzing..." : "Run Eval"}
            </button>
            {metrics && !fromSaved && (
              <button
                onClick={saveEval}
                disabled={loading || saving}
                className="bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save Eval"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {!metrics && !loading && (
          <div className="text-center py-12 text-gray-500">
            No saved eval found. Click &quot;Run Eval&quot; to analyze your calls.
          </div>
        )}

        {/* Show saved eval info */}
        {fromSaved && lastRun && (
          <div className="bg-blue-50 text-blue-800 px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
            <div>
              <span className="font-medium">Loaded from saved eval</span>
              <span className="mx-2">•</span>
              <span className="text-blue-600">
                {new Date(lastRun.runAt).toLocaleString()}
              </span>
              <span className="mx-2">•</span>
              <span>{lastRun.callIds.length} calls analyzed</span>
            </div>
            <button
              onClick={runFreshEval}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Run fresh eval
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
            <p className="mt-3 text-gray-600">Analyzing transcripts...</p>
          </div>
        )}

        {metrics && !loading && (
          <>
            {/* Key Metrics - 4 bars */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                🎯 Key Eval Metrics
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricBar
                  label="1. Quote Obtained Rate"
                  value={metrics.quoteObtainedRate}
                  color="text-blue-600"
                  description="% of calls where vendor gave a quote"
                />
                <MetricBar
                  label="2. Negotiation Attempt Rate"
                  value={metrics.negotiationAttemptRate}
                  color="text-amber-600"
                  description="% of calls where bot asked for lower price"
                />
                <MetricBar
                  label="3. Negotiation Success Rate"
                  value={metrics.negotiationSuccessRate}
                  color="text-green-600"
                  description="% of calls where bot lowered the price"
                />
                <MetricBar
                  label="4. Safety Rate"
                  value={metrics.safetyRate}
                  color="text-purple-600"
                  description="% of calls where bot was professional"
                />
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Total Calls</p>
                <p className="text-2xl font-bold text-gray-800">
                  {metrics.totalCalls}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {metrics.completedCalls}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Quotes Obtained</p>
                <p className="text-2xl font-bold text-blue-600">
                  {metrics.callsWithQuotes}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Unsafe Calls</p>
                <p className="text-2xl font-bold text-red-600">
                  {metrics.unsafeCalls}
                </p>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <DonutChart
                title="Call Outcomes"
                data={[
                  {
                    label: "Completed",
                    value: metrics.outcomes.completed,
                    color: "#22c55e",
                  },
                  {
                    label: "No Answer",
                    value: metrics.outcomes.noAnswer,
                    color: "#f59e0b",
                  },
                  {
                    label: "Busy",
                    value: metrics.outcomes.busy,
                    color: "#ef4444",
                  },
                  {
                    label: "Failed",
                    value: metrics.outcomes.failed,
                    color: "#6b7280",
                  },
                ]}
              />
              <FunnelChart
                title="Negotiation Funnel"
                data={[
                  {
                    label: "Quotes Obtained",
                    value: metrics.callsWithQuotes,
                    color: "#3b82f6",
                  },
                  {
                    label: "Negotiation Attempted",
                    value: metrics.callsWithNegotiationAttempt,
                    color: "#f59e0b",
                  },
                  {
                    label: "Price Reduced",
                    value: metrics.callsWithSuccessfulNegotiation,
                    color: "#22c55e",
                  },
                ]}
              />
            </div>

            {/* Safety Issues */}
            {metrics.unsafeCalls > 0 && (
              <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                <h3 className="font-semibold text-red-800 mb-2">
                  ⚠️ Safety Issues Found ({metrics.unsafeCalls} calls)
                </h3>
                <ul className="text-sm text-red-700">
                  {metrics.safetyIssues.map((issue, i) => (
                    <li key={i}>
                      • {issue.issue} ({issue.count}x)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
