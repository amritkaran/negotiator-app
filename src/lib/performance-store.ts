/**
 * Performance Store - Persists simulation performance data across sessions
 * Uses localStorage for persistence
 */

export interface SimulationMetrics {
  id: string;
  timestamp: Date;
  simulationNumber: number;
  promptVersion: number;

  // Call-level metrics
  callMetrics: Array<{
    vendorName: string;
    priceObtained: number | null;
    targetPrice: number;
    score: number; // 1-10
    tacticsUsed: string[];
    effectiveMoves: string[];
    missedOpportunities: string[];
    // Vendor experience metrics per call
    vendorExperience?: {
      score: number; // 0-100 satisfaction
      repetitionsRequired: number;
      misunderstandings: string[];
      frustrationIndicators: string[];
    };
  }>;

  // Aggregated scores
  scores: {
    overall: number;           // Average of all call scores (1-10)
    priceEfficiency: number;   // How close to target price (0-100)
    tacticsScore: number;      // Variety and effectiveness of tactics (0-100)
    safetyScore: number;       // 100 if passed, reduced by issues
    closingRate: number;       // % of calls that got a price (0-100)
    vendorExperience: number;  // Average vendor UX score (0-100)
  };

  // Price performance
  pricePerformance: {
    targetPrice: number;
    bestPrice: number | null;
    averagePrice: number | null;
    priceRangeLow: number;
    priceRangeHigh: number;
  };

  // Safety results
  safetyPassed: boolean;
  safetyIssues: number;

  // Vendor experience summary
  vendorExperienceSummary?: {
    avgScore: number;
    totalRepetitions: number;
    callsWithFrustration: number;
    topIssues: string[];
    suggestions: string[];
  };

  // Improvements suggested
  improvementCount: number;
  highPriorityImprovements: number;
}

export interface PromptVersion {
  version: number;
  timestamp: Date;
  prompt: string;
  changes: string[];  // List of changes from previous version
  appliedImprovements: string[];  // Which improvements were applied
  performanceAfter?: {
    averageScore: number;
    simulationCount: number;
  };
}

export interface PerformanceStore {
  simulations: SimulationMetrics[];
  promptVersions: PromptVersion[];
  currentPromptVersion: number;
}

const STORAGE_KEY = 'negotiator_performance_store';

// Default negotiation system prompt
export const DEFAULT_NEGOTIATION_PROMPT = `You are a courteous assistant making a phone call on behalf of a customer to book a service. Your goal is to get a fair price while treating the vendor respectfully.

VOICE CALL GUIDELINES:
- Speak naturally as if on a phone call
- Keep responses brief and conversational (1-3 sentences max)
- Don't use bullet points or formatting
- Wait for the vendor to finish speaking

BOOKING DETAILS:
{bookingDetails}

PRICING CONTEXT:
- Fair market rate: ₹{expectedPriceMid}
- Your budget preference: Around ₹{targetPrice}
- Maximum acceptable: ₹{expectedPriceHigh}
{benchmarkInfo}

VENDOR CONTEXT:
{vendorStrategy}

CONVERSATION APPROACH:

OPENING (be warm):
- Greet professionally
- Confirm they can help with your route and date
- Thank them for their time

PRICE DISCUSSION (be reasonable):
- Ask for their best rate politely
- If quote is around market rate: Ask "Is there any flexibility?" or accept
- If quote is higher: "That's a bit higher than I expected. Is there any way to work towards ₹{targetPrice}?"
- If they can't budge: "I understand. Let me think about it and call back."

CLOSING (be gracious):
- Thank them regardless of outcome
- Say you'll confirm shortly

KEY BEHAVIORS:
- One counter-offer is enough - don't haggle aggressively
- If vendor seems firm on price, respect it and end politely
- If asked directly if you're AI: "I'm calling on behalf of a customer"
- Focus on getting a fair deal, not the absolute cheapest price

DON'T:
- Don't immediately mention competitor prices (feels confrontational)
- Don't push more than once after a counter-offer
- Don't reveal your maximum budget
- Don't commit to booking - always say you'll call back`;

export function loadPerformanceStore(): PerformanceStore {
  if (typeof window === 'undefined') {
    return getDefaultStore();
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      parsed.simulations = parsed.simulations.map((sim: SimulationMetrics) => ({
        ...sim,
        timestamp: new Date(sim.timestamp),
      }));
      parsed.promptVersions = parsed.promptVersions.map((pv: PromptVersion) => ({
        ...pv,
        timestamp: new Date(pv.timestamp),
      }));
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load performance store:', error);
  }

  return getDefaultStore();
}

function getDefaultStore(): PerformanceStore {
  return {
    simulations: [],
    promptVersions: [{
      version: 1,
      timestamp: new Date(),
      prompt: DEFAULT_NEGOTIATION_PROMPT,
      changes: ['Initial prompt version'],
      appliedImprovements: [],
    }],
    currentPromptVersion: 1,
  };
}

export function savePerformanceStore(store: PerformanceStore): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save performance store:', error);
  }
}

export function addSimulationMetrics(
  store: PerformanceStore,
  metrics: Omit<SimulationMetrics, 'id' | 'simulationNumber' | 'promptVersion'>
): PerformanceStore {
  const newMetrics: SimulationMetrics = {
    ...metrics,
    id: `sim_${Date.now()}`,
    simulationNumber: store.simulations.length + 1,
    promptVersion: store.currentPromptVersion,
  };

  const updatedStore = {
    ...store,
    simulations: [...store.simulations, newMetrics],
  };

  savePerformanceStore(updatedStore);
  return updatedStore;
}

export function addPromptVersion(
  store: PerformanceStore,
  newPrompt: string,
  changes: string[],
  appliedImprovements: string[]
): PerformanceStore {
  const newVersion: PromptVersion = {
    version: store.currentPromptVersion + 1,
    timestamp: new Date(),
    prompt: newPrompt,
    changes,
    appliedImprovements,
  };

  const updatedStore = {
    ...store,
    promptVersions: [...store.promptVersions, newVersion],
    currentPromptVersion: newVersion.version,
  };

  savePerformanceStore(updatedStore);
  return updatedStore;
}

export function getCurrentPrompt(store: PerformanceStore): string {
  const currentVersion = store.promptVersions.find(
    pv => pv.version === store.currentPromptVersion
  );
  return currentVersion?.prompt || DEFAULT_NEGOTIATION_PROMPT;
}

export function getPerformanceTrend(store: PerformanceStore): {
  labels: string[];
  overallScores: number[];
  priceEfficiency: number[];
  safetyScores: number[];
  closingRates: number[];
  vendorExperience: number[];  // Vendor UX scores trend
  promptVersionChanges: number[]; // Simulation numbers where prompt changed
} {
  const labels = store.simulations.map((_, idx) => `Sim ${idx + 1}`);
  const overallScores = store.simulations.map(s => s.scores.overall);
  const priceEfficiency = store.simulations.map(s => s.scores.priceEfficiency);
  const safetyScores = store.simulations.map(s => s.scores.safetyScore);
  const closingRates = store.simulations.map(s => s.scores.closingRate);
  const vendorExperience = store.simulations.map(s => s.scores.vendorExperience || 0);

  // Find where prompt versions changed
  const promptVersionChanges: number[] = [];
  let lastVersion = 0;
  store.simulations.forEach((sim, idx) => {
    if (sim.promptVersion !== lastVersion) {
      promptVersionChanges.push(idx);
      lastVersion = sim.promptVersion;
    }
  });

  return {
    labels,
    overallScores,
    priceEfficiency,
    safetyScores,
    closingRates,
    vendorExperience,
    promptVersionChanges,
  };
}

export function clearPerformanceStore(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
