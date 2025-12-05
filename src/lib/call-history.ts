/**
 * Call History Storage - Persists call records for review
 * Uses in-memory storage with optional file persistence
 */

export interface CallHistoryRecord {
  id: string;
  callId: string; // VAPI call ID
  vendorName: string;
  vendorPhone: string;
  dateTime: string; // ISO timestamp
  duration: number; // seconds
  status: "completed" | "no_answer" | "busy" | "rejected" | "failed" | "in_progress";

  // User requirements summary
  requirements: {
    service: string;
    from: string;
    to: string;
    date: string;
    time: string;
    passengers?: number;
    vehicleType?: string;
    tripType?: string;
  };

  // Call results
  quotedPrice: number | null;
  negotiatedPrice: number | null;
  transcript: string | null;
  recordingUrl: string | null;
  notes: string | null;

  // Session info
  sessionId: string;
}

// In-memory store (persists across requests in serverless, but resets on cold start)
// For true persistence, integrate with Vercel KV or Postgres
const callHistoryStore: Map<string, CallHistoryRecord> = new Map();

// Generate unique ID
function generateId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function saveCallRecord(record: Omit<CallHistoryRecord, "id">): Promise<CallHistoryRecord> {
  const id = generateId();
  const fullRecord: CallHistoryRecord = { ...record, id };
  callHistoryStore.set(id, fullRecord);
  console.log(`[call-history] Saved call record: ${id}`);
  return fullRecord;
}

export async function updateCallRecord(id: string, updates: Partial<CallHistoryRecord>): Promise<CallHistoryRecord | null> {
  const existing = callHistoryStore.get(id);
  if (!existing) {
    console.log(`[call-history] Record not found: ${id}`);
    return null;
  }

  const updated = { ...existing, ...updates };
  callHistoryStore.set(id, updated);
  console.log(`[call-history] Updated call record: ${id}`);
  return updated;
}

export async function getCallRecord(id: string): Promise<CallHistoryRecord | null> {
  return callHistoryStore.get(id) || null;
}

export async function getCallRecordByCallId(callId: string): Promise<CallHistoryRecord | null> {
  for (const record of callHistoryStore.values()) {
    if (record.callId === callId) {
      return record;
    }
  }
  return null;
}

export async function getAllCallRecords(limit: number = 50): Promise<CallHistoryRecord[]> {
  const records = Array.from(callHistoryStore.values());
  // Sort by date descending (most recent first)
  records.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
  return records.slice(0, limit);
}

export async function getCallRecordsBySession(sessionId: string): Promise<CallHistoryRecord[]> {
  const records: CallHistoryRecord[] = [];
  for (const record of callHistoryStore.values()) {
    if (record.sessionId === sessionId) {
      records.push(record);
    }
  }
  // Sort by date descending
  records.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
  return records;
}

export async function deleteCallRecord(id: string): Promise<boolean> {
  const deleted = callHistoryStore.delete(id);
  if (deleted) {
    console.log(`[call-history] Deleted call record: ${id}`);
  }
  return deleted;
}

// Clear all records (for testing)
export async function clearAllRecords(): Promise<void> {
  callHistoryStore.clear();
  console.log(`[call-history] Cleared all records`);
}
