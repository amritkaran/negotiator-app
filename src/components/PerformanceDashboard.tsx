"use client";

import { useState, useMemo } from "react";
import { PerformanceStore, SimulationMetrics, clearPerformanceStore } from "@/lib/performance-store";

interface PerformanceDashboardProps {
  store: PerformanceStore;
  onClose: () => void;
  onStoreCleared: () => void;
}

type TimeRange = "all" | "7d" | "30d" | "90d";
type MetricType = "overall" | "priceEfficiency" | "tacticsScore" | "closingRate" | "vendorExperience" | "safetyScore";

const METRIC_CONFIG: Record<MetricType, { label: string; color: string; maxValue: number; unit: string }> = {
  overall: { label: "Overall Score", color: "#3b82f6", maxValue: 10, unit: "/10" },
  priceEfficiency: { label: "Price Efficiency", color: "#22c55e", maxValue: 100, unit: "%" },
  tacticsScore: { label: "Tactics Score", color: "#8b5cf6", maxValue: 100, unit: "%" },
  closingRate: { label: "Closing Rate", color: "#f59e0b", maxValue: 100, unit: "%" },
  vendorExperience: { label: "Vendor UX", color: "#f97316", maxValue: 100, unit: "%" },
  safetyScore: { label: "Safety Score", color: "#10b981", maxValue: 100, unit: "%" },
};

export function PerformanceDashboard({ store, onClose, onStoreCleared }: PerformanceDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(["overall", "priceEfficiency", "vendorExperience"]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Filter simulations by time range
  const filteredSimulations = useMemo(() => {
    if (timeRange === "all") return store.simulations;

    const now = new Date();
    const daysMap: Record<TimeRange, number> = { "7d": 7, "30d": 30, "90d": 90, "all": 0 };
    const cutoff = new Date(now.getTime() - daysMap[timeRange] * 24 * 60 * 60 * 1000);

    return store.simulations.filter(sim => new Date(sim.timestamp) >= cutoff);
  }, [store.simulations, timeRange]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (filteredSimulations.length === 0) return null;

    const metrics: Record<MetricType, number[]> = {
      overall: filteredSimulations.map(s => s.scores.overall),
      priceEfficiency: filteredSimulations.map(s => s.scores.priceEfficiency),
      tacticsScore: filteredSimulations.map(s => s.scores.tacticsScore),
      closingRate: filteredSimulations.map(s => s.scores.closingRate),
      vendorExperience: filteredSimulations.map(s => s.scores.vendorExperience || 0),
      safetyScore: filteredSimulations.map(s => s.scores.safetyScore),
    };

    const calcStats = (arr: number[]) => ({
      current: arr[arr.length - 1] || 0,
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      min: Math.min(...arr),
      max: Math.max(...arr),
      trend: arr.length > 1 ? arr[arr.length - 1] - arr[0] : 0,
    });

    return Object.fromEntries(
      Object.entries(metrics).map(([key, values]) => [key, calcStats(values)])
    ) as Record<MetricType, { current: number; avg: number; min: number; max: number; trend: number }>;
  }, [filteredSimulations]);

  // Group simulations by date for time-series
  const timeSeriesData = useMemo(() => {
    const grouped = new Map<string, SimulationMetrics[]>();

    filteredSimulations.forEach(sim => {
      const date = new Date(sim.timestamp).toLocaleDateString();
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date)!.push(sim);
    });

    return Array.from(grouped.entries()).map(([date, sims]) => ({
      date,
      timestamp: new Date(sims[0].timestamp),
      simCount: sims.length,
      overall: sims.reduce((s, sim) => s + sim.scores.overall, 0) / sims.length,
      priceEfficiency: sims.reduce((s, sim) => s + sim.scores.priceEfficiency, 0) / sims.length,
      tacticsScore: sims.reduce((s, sim) => s + sim.scores.tacticsScore, 0) / sims.length,
      closingRate: sims.reduce((s, sim) => s + sim.scores.closingRate, 0) / sims.length,
      vendorExperience: sims.reduce((s, sim) => s + (sim.scores.vendorExperience || 0), 0) / sims.length,
      safetyScore: sims.reduce((s, sim) => s + sim.scores.safetyScore, 0) / sims.length,
    })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [filteredSimulations]);

  const toggleMetric = (metric: MetricType) => {
    setSelectedMetrics(prev =>
      prev.includes(metric)
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    );
  };

  const handleClearData = () => {
    clearPerformanceStore();
    onStoreCleared();
    setShowClearConfirm(false);
  };

  // SVG Chart renderer
  const renderTimeSeriesChart = () => {
    if (timeSeriesData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-2">📊</div>
            <p>No data available for selected time range</p>
          </div>
        </div>
      );
    }

    const width = 800;
    const height = 300;
    const padding = { top: 20, right: 30, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find min/max for Y axis (use 0-100 for percentage metrics, 0-10 for overall)
    const maxY = selectedMetrics.some(m => m === "overall") && selectedMetrics.length === 1 ? 10 : 100;

    const getX = (idx: number) => padding.left + (idx / Math.max(timeSeriesData.length - 1, 1)) * chartWidth;
    const getY = (value: number, metric: MetricType) => {
      const config = METRIC_CONFIG[metric];
      const normalizedValue = metric === "overall" ? (value / 10) * 100 : value;
      return padding.top + chartHeight - (normalizedValue / 100) * chartHeight;
    };

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(pct => (
          <g key={pct}>
            <line
              x1={padding.left}
              y1={padding.top + chartHeight - (pct / 100) * chartHeight}
              x2={width - padding.right}
              y2={padding.top + chartHeight - (pct / 100) * chartHeight}
              stroke="#e5e7eb"
              strokeDasharray={pct === 0 ? "0" : "4,4"}
            />
            <text
              x={padding.left - 10}
              y={padding.top + chartHeight - (pct / 100) * chartHeight + 4}
              textAnchor="end"
              className="text-xs fill-gray-400"
            >
              {selectedMetrics.length === 1 && selectedMetrics[0] === "overall"
                ? (pct / 10).toFixed(0)
                : pct}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {timeSeriesData.map((point, idx) => {
          // Show fewer labels if many data points
          const showLabel = timeSeriesData.length <= 10 || idx % Math.ceil(timeSeriesData.length / 10) === 0;
          if (!showLabel) return null;
          return (
            <text
              key={idx}
              x={getX(idx)}
              y={height - 10}
              textAnchor="middle"
              className="text-xs fill-gray-400"
            >
              {point.date.split("/").slice(0, 2).join("/")}
            </text>
          );
        })}

        {/* Lines for each selected metric */}
        {selectedMetrics.map(metric => {
          const config = METRIC_CONFIG[metric];
          const points = timeSeriesData.map((point, idx) => {
            const value = point[metric as keyof typeof point] as number;
            return `${getX(idx)},${getY(value, metric)}`;
          }).join(" ");

          // Area fill
          const areaPoints = [
            `${padding.left},${padding.top + chartHeight}`,
            ...timeSeriesData.map((point, idx) => {
              const value = point[metric as keyof typeof point] as number;
              return `${getX(idx)},${getY(value, metric)}`;
            }),
            `${getX(timeSeriesData.length - 1)},${padding.top + chartHeight}`,
          ].join(" ");

          return (
            <g key={metric}>
              <polygon points={areaPoints} fill={config.color} fillOpacity="0.1" />
              <polyline
                points={points}
                fill="none"
                stroke={config.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Data points */}
              {timeSeriesData.map((point, idx) => {
                const value = point[metric as keyof typeof point] as number;
                return (
                  <circle
                    key={idx}
                    cx={getX(idx)}
                    cy={getY(value, metric)}
                    r={timeSeriesData.length > 20 ? 2 : 4}
                    fill="white"
                    stroke={config.color}
                    strokeWidth="2"
                  />
                );
              })}
            </g>
          );
        })}

        {/* Prompt version markers */}
        {filteredSimulations.map((sim, idx) => {
          if (idx === 0) return null;
          const prevSim = filteredSimulations[idx - 1];
          if (sim.promptVersion !== prevSim.promptVersion) {
            const x = getX(idx);
            return (
              <g key={`prompt-${idx}`}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + chartHeight}
                  stroke="#8b5cf6"
                  strokeWidth="2"
                  strokeDasharray="6,4"
                />
                <text x={x} y={padding.top - 5} textAnchor="middle" className="text-xs fill-purple-600">
                  v{sim.promptVersion}
                </text>
              </g>
            );
          }
          return null;
        })}
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[95vw] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span>📈</span> Performance Dashboard
            </h2>
            <p className="text-blue-100 text-sm">
              {store.simulations.length} total simulations | Prompt v{store.currentPromptVersion}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 border-b bg-gray-50 flex flex-wrap items-center gap-4">
          {/* Time Range Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Time Range:</span>
            <div className="flex bg-white rounded-lg border overflow-hidden">
              {(["all", "7d", "30d", "90d"] as TimeRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    timeRange === range
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {range === "all" ? "All Time" : `Last ${range}`}
                </button>
              ))}
            </div>
          </div>

          {/* Metric Toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600">Metrics:</span>
            {(Object.keys(METRIC_CONFIG) as MetricType[]).map(metric => {
              const config = METRIC_CONFIG[metric];
              const isSelected = selectedMetrics.includes(metric);
              return (
                <button
                  key={metric}
                  onClick={() => toggleMetric(metric)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
                    isSelected
                      ? "border-transparent text-white"
                      : "border-gray-300 text-gray-600 hover:border-gray-400"
                  }`}
                  style={isSelected ? { backgroundColor: config.color } : {}}
                >
                  {config.label}
                </button>
              );
            })}
          </div>

          {/* Clear Data Button */}
          <div className="ml-auto">
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
            >
              Clear All Data
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {(Object.keys(METRIC_CONFIG) as MetricType[]).map(metric => {
                const config = METRIC_CONFIG[metric];
                const stat = stats[metric];
                const trendUp = stat.trend > 0;
                const trendDown = stat.trend < 0;
                return (
                  <div
                    key={metric}
                    className={`bg-white rounded-lg border-2 p-4 ${
                      selectedMetrics.includes(metric) ? "shadow-md" : ""
                    }`}
                    style={selectedMetrics.includes(metric) ? { borderColor: config.color } : { borderColor: "#e5e7eb" }}
                  >
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                      {config.label}
                    </div>
                    <div className="text-2xl font-bold" style={{ color: config.color }}>
                      {metric === "overall" ? stat.current.toFixed(1) : stat.current.toFixed(0)}
                      <span className="text-sm font-normal text-gray-400">{config.unit}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">
                        Avg: {metric === "overall" ? stat.avg.toFixed(1) : stat.avg.toFixed(0)}
                      </span>
                      {stat.trend !== 0 && (
                        <span className={`text-xs font-medium ${trendUp ? "text-green-500" : trendDown ? "text-red-500" : "text-gray-400"}`}>
                          {trendUp ? "↑" : trendDown ? "↓" : "→"}
                          {Math.abs(stat.trend).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Time Series Chart */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-700">Performance Over Time</h3>
              <div className="flex items-center gap-4 text-xs">
                {selectedMetrics.map(metric => (
                  <div key={metric} className="flex items-center gap-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: METRIC_CONFIG[metric].color }}
                    />
                    <span className="text-gray-600">{METRIC_CONFIG[metric].label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <div className="w-4 h-0 border-t-2 border-dashed border-purple-500" />
                  <span className="text-gray-600">Prompt Update</span>
                </div>
              </div>
            </div>
            {renderTimeSeriesChart()}
          </div>

          {/* Simulation History Table */}
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-700">Simulation History</h3>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-600">#</th>
                    <th className="px-4 py-2 text-left text-gray-600">Date</th>
                    <th className="px-4 py-2 text-center text-gray-600">Overall</th>
                    <th className="px-4 py-2 text-center text-gray-600">Price</th>
                    <th className="px-4 py-2 text-center text-gray-600">Tactics</th>
                    <th className="px-4 py-2 text-center text-gray-600">Closing</th>
                    <th className="px-4 py-2 text-center text-gray-600">Vendor UX</th>
                    <th className="px-4 py-2 text-center text-gray-600">Safety</th>
                    <th className="px-4 py-2 text-center text-gray-600">Prompt</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSimulations.slice().reverse().map((sim, idx) => (
                    <tr key={sim.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500">{filteredSimulations.length - idx}</td>
                      <td className="px-4 py-2 text-gray-700" suppressHydrationWarning>
                        {new Date(sim.timestamp).toLocaleDateString()}{" "}
                        <span className="text-gray-400 text-xs">
                          {new Date(sim.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`font-medium ${sim.scores.overall >= 7 ? "text-green-600" : sim.scores.overall >= 5 ? "text-yellow-600" : "text-red-600"}`}>
                          {sim.scores.overall.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">{sim.scores.priceEfficiency.toFixed(0)}%</td>
                      <td className="px-4 py-2 text-center">{sim.scores.tacticsScore.toFixed(0)}%</td>
                      <td className="px-4 py-2 text-center">{sim.scores.closingRate.toFixed(0)}%</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`${(sim.scores.vendorExperience || 0) >= 70 ? "text-green-600" : (sim.scores.vendorExperience || 0) >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                          {(sim.scores.vendorExperience || 0).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {sim.safetyPassed ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="text-red-600">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-purple-600">v{sim.promptVersion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSimulations.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No simulations in selected time range
                </div>
              )}
            </div>
          </div>

          {/* Vendor Experience Details (if available) */}
          {filteredSimulations.some(s => s.vendorExperienceSummary) && (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold text-gray-700 mb-4">Vendor Experience Insights</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {/* Aggregate Issues */}
                <div className="bg-orange-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-orange-800 mb-2">Common Issues</h4>
                  <ul className="text-sm text-orange-700 space-y-1">
                    {Array.from(new Set(
                      filteredSimulations
                        .flatMap(s => s.vendorExperienceSummary?.topIssues || [])
                    )).slice(0, 5).map((issue, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-orange-400">•</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Aggregate Suggestions */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">Improvement Suggestions</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    {Array.from(new Set(
                      filteredSimulations
                        .flatMap(s => s.vendorExperienceSummary?.suggestions || [])
                    )).slice(0, 5).map((suggestion, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-blue-400">•</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Clear Confirmation Modal */}
        {showClearConfirm && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Clear All Data?</h3>
              <p className="text-gray-600 mb-4">
                This will permanently delete all {store.simulations.length} simulations and reset the prompt to default. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearData}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
