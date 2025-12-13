/**
 * Eval System - Main exports
 *
 * Provides vendor persona extraction, synthetic vendor simulation,
 * and eval metrics tracking for the negotiation bot.
 */

// Vendor Personas
export {
  // Types
  type NegotiationStyle,
  type CommunicationStyle,
  type LanguageMix,
  type ObjectionType,
  type DealClosingBehavior,
  type VendorPersona,
  type PersonaExtractionResult,
  // Functions
  PERSONA_TEMPLATES,
  getPersonaTemplate,
  getAllPersonaTemplates,
  clusterIntoPersonas,
} from "./vendor-persona";

// Persona Extraction
export {
  extractPersonaFromTranscript,
  extractPersonasFromCalls,
  analyzePersonaDistribution,
} from "./persona-extractor";

// Synthetic Vendor Simulator
export {
  // Types
  type ConversationTurn,
  type SimulatedCallResult,
  type VendorSimulatorContext,
  // Functions
  generateVendorResponse,
  createSyntheticVendor,
  updateVendorState,
  generateSyntheticVendorBatch,
  simulateCall,
  runEvalBatch,
} from "./synthetic-vendor";

// Eval Metrics
export {
  // Types
  type CallAnalysisForEval,
  type EvalMetrics,
  type EvalRunResult,
  type EvalComparison,
  // Functions
  analyzeCallForEval,
  analyzeCallsForEval,
  calculateBasicMetrics,
  calculateMetrics,
  calculateMetricsByPeriod,
  compareMetrics,
  generateEvalReport,
  createEvalRun,
  getEvalRuns,
  getLatestEvalRun,
  getEvalRunById,
} from "./eval-metrics";
