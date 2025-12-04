"use client";

import { useMemo } from "react";
import { PerformanceStore, SimulationMetrics } from "@/lib/performance-store";

interface PerformanceGraphsProps {
  store: PerformanceStore;
  currentSimulation?: SimulationMetrics | null;
}

export function PerformanceGraphs({ store, currentSimulation }: PerformanceGraphsProps) {
  const allSimulations = useMemo(() => {
    if (currentSimulation && !store.simulations.find(s => s.id === currentSimulation.id)) {
      return [...store.simulations, currentSimulation];
    }
    return store.simulations;
  }, [store.simulations, currentSimulation]);

  const trend = useMemo(() => {
    const labels = allSimulations.map((_, idx) => `${idx + 1}`);
    const overallScores = allSimulations.map(s => s.scores.overall);
    const priceEfficiency = allSimulations.map(s => s.scores.priceEfficiency);
    const safetyScores = allSimulations.map(s => s.scores.safetyScore);
    const closingRates = allSimulations.map(s => s.scores.closingRate);
    const tacticsScores = allSimulations.map(s => s.scores.tacticsScore);
    const vendorExperience = allSimulations.map(s => s.scores.vendorExperience || 0);

    // Find prompt version changes
    const promptChanges: number[] = [];
    let lastVersion = 0;
    allSimulations.forEach((sim, idx) => {
      if (sim.promptVersion !== lastVersion && lastVersion !== 0) {
        promptChanges.push(idx);
      }
      lastVersion = sim.promptVersion;
    });

    return { labels, overallScores, priceEfficiency, safetyScores, closingRates, tacticsScores, vendorExperience, promptChanges };
  }, [allSimulations]);

  const latestMetrics = allSimulations[allSimulations.length - 1];
  const previousMetrics = allSimulations.length > 1 ? allSimulations[allSimulations.length - 2] : null;

  const getChangeIndicator = (current: number, previous: number | undefined) => {
    if (previous === undefined) return null;
    const diff = current - previous;
    if (Math.abs(diff) < 0.5) return <span className="text-gray-400 text-xs">→</span>;
    if (diff > 0) return <span className="text-green-500 text-xs">↑ +{diff.toFixed(1)}</span>;
    return <span className="text-red-500 text-xs">↓ {diff.toFixed(1)}</span>;
  };

  // Simple SVG line chart
  const renderLineChart = (
    data: number[],
    color: string,
    maxValue: number = 100,
    height: number = 60
  ) => {
    if (data.length === 0) return null;

    const width = 200;
    const padding = 5;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const points = data.map((value, idx) => {
      const x = padding + (idx / Math.max(data.length - 1, 1)) * chartWidth;
      const y = padding + chartHeight - (value / maxValue) * chartHeight;
      return `${x},${y}`;
    }).join(' ');

    // Area fill points
    const areaPoints = [
      `${padding},${height - padding}`,
      ...data.map((value, idx) => {
        const x = padding + (idx / Math.max(data.length - 1, 1)) * chartWidth;
        const y = padding + chartHeight - (value / maxValue) * chartHeight;
        return `${x},${y}`;
      }),
      `${width - padding},${height - padding}`,
    ].join(' ');

    return (
      <svg width={width} height={height} className="overflow-visible">
        {/* Grid lines */}
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />

        {/* Area fill */}
        <polygon points={areaPoints} fill={color} fillOpacity="0.1" />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {data.map((value, idx) => {
          const x = padding + (idx / Math.max(data.length - 1, 1)) * chartWidth;
          const y = padding + chartHeight - (value / maxValue) * chartHeight;
          const isLatest = idx === data.length - 1;
          return (
            <circle
              key={idx}
              cx={x}
              cy={y}
              r={isLatest ? 4 : 2}
              fill={isLatest ? color : "white"}
              stroke={color}
              strokeWidth="2"
            />
          );
        })}

        {/* Prompt change markers */}
        {trend.promptChanges.map((idx) => {
          const x = padding + (idx / Math.max(data.length - 1, 1)) * chartWidth;
          return (
            <line
              key={`change-${idx}`}
              x1={x}
              y1={padding}
              x2={x}
              y2={height - padding}
              stroke="#8b5cf6"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
          );
        })}
      </svg>
    );
  };

  if (allSimulations.length === 0) {
    return (
      <div className="bg-white rounded-lg p-4 border">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span>📊</span> Performance Tracking
        </h3>
        <div className="text-center text-gray-400 py-8">
          <div className="text-3xl mb-2">📈</div>
          <p className="text-sm">No simulation data yet</p>
          <p className="text-xs">Complete a simulation to see performance metrics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
          <span>📊</span> Performance Tracking
        </h3>
        <span className="text-xs text-gray-500">
          {allSimulations.length} simulation{allSimulations.length !== 1 ? 's' : ''} | Prompt v{store.currentPromptVersion}
        </span>
      </div>

      {/* Current Scores Summary */}
      {latestMetrics && (
        <div className="grid grid-cols-6 gap-2 mb-4">
          <div className="bg-blue-50 rounded p-2 text-center">
            <div className="text-lg font-bold text-blue-600">
              {latestMetrics.scores.overall.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500">Overall</div>
            {previousMetrics && getChangeIndicator(latestMetrics.scores.overall, previousMetrics.scores.overall)}
          </div>
          <div className="bg-green-50 rounded p-2 text-center">
            <div className="text-lg font-bold text-green-600">
              {latestMetrics.scores.priceEfficiency.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">Price</div>
            {previousMetrics && getChangeIndicator(latestMetrics.scores.priceEfficiency, previousMetrics.scores.priceEfficiency)}
          </div>
          <div className="bg-purple-50 rounded p-2 text-center">
            <div className="text-lg font-bold text-purple-600">
              {latestMetrics.scores.tacticsScore.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">Tactics</div>
            {previousMetrics && getChangeIndicator(latestMetrics.scores.tacticsScore, previousMetrics.scores.tacticsScore)}
          </div>
          <div className="bg-yellow-50 rounded p-2 text-center">
            <div className="text-lg font-bold text-yellow-600">
              {latestMetrics.scores.closingRate.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">Closing</div>
            {previousMetrics && getChangeIndicator(latestMetrics.scores.closingRate, previousMetrics.scores.closingRate)}
          </div>
          <div className="bg-orange-50 rounded p-2 text-center">
            <div className={`text-lg font-bold ${
              (latestMetrics.scores.vendorExperience || 0) >= 70 ? 'text-green-600' :
              (latestMetrics.scores.vendorExperience || 0) >= 50 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {(latestMetrics.scores.vendorExperience || 0).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">Vendor UX</div>
            {previousMetrics && getChangeIndicator(latestMetrics.scores.vendorExperience || 0, previousMetrics.scores.vendorExperience || 0)}
          </div>
          <div className={`rounded p-2 text-center ${latestMetrics.safetyPassed ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className={`text-lg font-bold ${latestMetrics.safetyPassed ? 'text-green-600' : 'text-red-600'}`}>
              {latestMetrics.safetyPassed ? '✓' : '✗'}
            </div>
            <div className="text-xs text-gray-500">Safety</div>
          </div>
        </div>
      )}

      {/* Trend Charts */}
      {allSimulations.length > 1 && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Performance Trend</div>

          <div className="grid grid-cols-2 gap-4">
            {/* Overall Score Trend */}
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-600 mb-1">Overall Score (0-10)</div>
              {renderLineChart(trend.overallScores, '#3b82f6', 10, 50)}
            </div>

            {/* Price Efficiency Trend */}
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-600 mb-1">Price Efficiency (%)</div>
              {renderLineChart(trend.priceEfficiency, '#22c55e', 100, 50)}
            </div>

            {/* Tactics Score Trend */}
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-600 mb-1">Tactics Score (%)</div>
              {renderLineChart(trend.tacticsScores, '#8b5cf6', 100, 50)}
            </div>

            {/* Closing Rate Trend */}
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-600 mb-1">Closing Rate (%)</div>
              {renderLineChart(trend.closingRates, '#f59e0b', 100, 50)}
            </div>

            {/* Vendor Experience Trend */}
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-600 mb-1">Vendor UX (%)</div>
              {renderLineChart(trend.vendorExperience, '#f97316', 100, 50)}
            </div>
          </div>

          {/* Legend */}
          {trend.promptChanges.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-4 h-0 border-t-2 border-dashed border-purple-500"></div>
                <span>Prompt updated</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Price Performance */}
      {latestMetrics && latestMetrics.pricePerformance.bestPrice && (
        <div className="mt-4 pt-3 border-t">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Latest Price Performance</div>
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="text-gray-500">Target:</span>
              <span className="ml-1 font-medium">₹{latestMetrics.pricePerformance.targetPrice}</span>
            </div>
            <div>
              <span className="text-gray-500">Best:</span>
              <span className={`ml-1 font-bold ${
                latestMetrics.pricePerformance.bestPrice <= latestMetrics.pricePerformance.targetPrice
                  ? 'text-green-600'
                  : 'text-orange-600'
              }`}>
                ₹{latestMetrics.pricePerformance.bestPrice}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Avg:</span>
              <span className="ml-1 font-medium">
                ₹{latestMetrics.pricePerformance.averagePrice?.toFixed(0) || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Experience Details */}
      {latestMetrics?.vendorExperienceSummary && (
        <div className="mt-4 pt-3 border-t">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Vendor Experience Details</div>
          <div className="bg-orange-50 rounded p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Repetitions Required:</span>
              <span className={`font-medium ${
                latestMetrics.vendorExperienceSummary.totalRepetitions === 0 ? 'text-green-600' :
                latestMetrics.vendorExperienceSummary.totalRepetitions <= 2 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {latestMetrics.vendorExperienceSummary.totalRepetitions}x
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Calls with Frustration:</span>
              <span className={`font-medium ${
                latestMetrics.vendorExperienceSummary.callsWithFrustration === 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {latestMetrics.vendorExperienceSummary.callsWithFrustration}
              </span>
            </div>
            {latestMetrics.vendorExperienceSummary.topIssues.length > 0 && (
              <div className="text-xs">
                <div className="text-gray-500 mb-1">Top Issues:</div>
                <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                  {latestMetrics.vendorExperienceSummary.topIssues.slice(0, 3).map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            {latestMetrics.vendorExperienceSummary.suggestions.length > 0 && (
              <div className="text-xs">
                <div className="text-gray-500 mb-1">Suggestions:</div>
                <ul className="list-disc list-inside text-orange-700 space-y-0.5">
                  {latestMetrics.vendorExperienceSummary.suggestions.slice(0, 2).map((suggestion, idx) => (
                    <li key={idx}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Simulation History */}
      {allSimulations.length > 3 && (
        <div className="mt-4 pt-3 border-t">
          <details className="text-xs">
            <summary className="text-gray-500 cursor-pointer hover:text-gray-700">
              View all {allSimulations.length} simulations
            </summary>
            <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
              {allSimulations.map((sim, idx) => (
                <div key={sim.id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                  <span>Sim {idx + 1} (v{sim.promptVersion})</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${sim.scores.overall >= 7 ? 'text-green-600' : sim.scores.overall >= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {sim.scores.overall.toFixed(1)}/10
                    </span>
                    {sim.scores.vendorExperience !== undefined && (
                      <span className={`text-xs ${
                        sim.scores.vendorExperience >= 70 ? 'text-green-500' :
                        sim.scores.vendorExperience >= 50 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        UX:{sim.scores.vendorExperience}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
