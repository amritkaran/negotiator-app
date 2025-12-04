/**
 * Session Logger - Persists conversation transcripts and session data
 * Writes to JSON files for debugging and analysis
 */

import { promises as fs } from 'fs';
import path from 'path';

const LOGS_DIR = process.env.LOGS_DIR || './logs';

export interface SessionLog {
  sessionId: string;
  startedAt: Date;
  updatedAt: Date;
  requirements?: {
    service?: string;
    from?: string;
    to?: string;
    date?: string;
    time?: string;
    passengers?: number;
    vehicleType?: string;
  };
  research?: {
    businessesFound: number;
    priceIntel?: {
      low: number;
      mid: number;
      high: number;
    };
    duration?: number;
  };
  simulations: SimulationLog[];
  errors: ErrorLog[];
}

export interface SimulationLog {
  vendorId: string;
  vendorName: string;
  startedAt: Date;
  endedAt?: Date;
  messages: Array<{
    role: 'agent' | 'vendor';
    content: string;
    timestamp: Date;
    thinking?: string;
  }>;
  quotedPrice: number | null;
  targetPrice: number;
  success: boolean;
  notes?: string;
}

export interface ErrorLog {
  timestamp: Date;
  context: string;
  error: string;
  stack?: string;
}

// Ensure logs directory exists
async function ensureLogsDir(): Promise<void> {
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
  } catch (error) {
    console.error('[session-logger] Failed to create logs directory:', error);
  }
}

// Get log file path for a session
function getLogPath(sessionId: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOGS_DIR, `session_${date}_${sessionId.slice(0, 8)}.json`);
}

// Load existing session log or create new one
export async function loadSessionLog(sessionId: string): Promise<SessionLog> {
  await ensureLogsDir();
  const logPath = getLogPath(sessionId);

  try {
    const content = await fs.readFile(logPath, 'utf-8');
    const log = JSON.parse(content);
    // Convert date strings back to Date objects
    log.startedAt = new Date(log.startedAt);
    log.updatedAt = new Date(log.updatedAt);
    log.simulations = log.simulations?.map((sim: SimulationLog) => ({
      ...sim,
      startedAt: new Date(sim.startedAt),
      endedAt: sim.endedAt ? new Date(sim.endedAt) : undefined,
      messages: sim.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
    })) || [];
    log.errors = log.errors?.map((err: ErrorLog) => ({
      ...err,
      timestamp: new Date(err.timestamp),
    })) || [];
    return log;
  } catch {
    // File doesn't exist, create new log
    return {
      sessionId,
      startedAt: new Date(),
      updatedAt: new Date(),
      simulations: [],
      errors: [],
    };
  }
}

// Save session log to file
export async function saveSessionLog(log: SessionLog): Promise<void> {
  await ensureLogsDir();
  const logPath = getLogPath(log.sessionId);
  log.updatedAt = new Date();

  try {
    await fs.writeFile(logPath, JSON.stringify(log, null, 2), 'utf-8');
    console.log(`[session-logger] Saved session log: ${logPath}`);
  } catch (error) {
    console.error('[session-logger] Failed to save session log:', error);
  }
}

// Log requirements gathering
export async function logRequirements(
  sessionId: string,
  requirements: SessionLog['requirements']
): Promise<void> {
  const log = await loadSessionLog(sessionId);
  log.requirements = requirements;
  await saveSessionLog(log);
}

// Log research results
export async function logResearch(
  sessionId: string,
  research: SessionLog['research']
): Promise<void> {
  const log = await loadSessionLog(sessionId);
  log.research = research;
  await saveSessionLog(log);
}

// Start logging a simulation
export async function startSimulationLog(
  sessionId: string,
  vendorId: string,
  vendorName: string,
  targetPrice: number
): Promise<void> {
  const log = await loadSessionLog(sessionId);

  // Check if simulation already exists
  const existingIndex = log.simulations.findIndex(s => s.vendorId === vendorId);

  const simLog: SimulationLog = {
    vendorId,
    vendorName,
    startedAt: new Date(),
    messages: [],
    quotedPrice: null,
    targetPrice,
    success: false,
  };

  if (existingIndex >= 0) {
    log.simulations[existingIndex] = simLog;
  } else {
    log.simulations.push(simLog);
  }

  await saveSessionLog(log);
}

// Add message to simulation log
export async function logSimulationMessage(
  sessionId: string,
  vendorId: string,
  role: 'agent' | 'vendor',
  content: string,
  thinking?: string
): Promise<void> {
  const log = await loadSessionLog(sessionId);
  const sim = log.simulations.find(s => s.vendorId === vendorId);

  if (sim) {
    sim.messages.push({
      role,
      content,
      timestamp: new Date(),
      thinking,
    });
    await saveSessionLog(log);
  }
}

// Complete simulation log
export async function completeSimulationLog(
  sessionId: string,
  vendorId: string,
  quotedPrice: number | null,
  success: boolean,
  notes?: string
): Promise<void> {
  const log = await loadSessionLog(sessionId);
  const sim = log.simulations.find(s => s.vendorId === vendorId);

  if (sim) {
    sim.endedAt = new Date();
    sim.quotedPrice = quotedPrice;
    sim.success = success;
    sim.notes = notes;
    await saveSessionLog(log);
  }
}

// Log an error
export async function logError(
  sessionId: string,
  context: string,
  error: Error | string
): Promise<void> {
  const log = await loadSessionLog(sessionId);
  log.errors.push({
    timestamp: new Date(),
    context,
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
  });
  await saveSessionLog(log);
  console.error(`[session-logger] Error in ${context}:`, error);
}

// Get all session logs from the logs directory
export async function getAllSessionLogs(): Promise<SessionLog[]> {
  await ensureLogsDir();

  try {
    const files = await fs.readdir(LOGS_DIR);
    const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json'));

    const logs: SessionLog[] = [];
    for (const file of sessionFiles) {
      try {
        const content = await fs.readFile(path.join(LOGS_DIR, file), 'utf-8');
        logs.push(JSON.parse(content));
      } catch {
        // Skip invalid files
      }
    }

    // Sort by most recent first
    return logs.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

// Delete old logs (older than N days)
export async function cleanupOldLogs(daysToKeep: number = 7): Promise<number> {
  await ensureLogsDir();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  let deletedCount = 0;

  try {
    const files = await fs.readdir(LOGS_DIR);
    for (const file of files) {
      if (file.startsWith('session_') && file.endsWith('.json')) {
        const filePath = path.join(LOGS_DIR, file);
        const stats = await fs.stat(filePath);
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
    }
  } catch (error) {
    console.error('[session-logger] Cleanup failed:', error);
  }

  console.log(`[session-logger] Cleaned up ${deletedCount} old log files`);
  return deletedCount;
}
