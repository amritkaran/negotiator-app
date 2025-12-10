/**
 * Call History Storage - Persists call records using Neon Serverless Postgres
 */

import { getDb, initializeDatabase } from "./db";

export interface CallHistoryRecord {
  id: string;
  callId: string;
  vendorName: string;
  vendorPhone: string;
  dateTime: string;
  duration: number;
  status: "completed" | "no_answer" | "busy" | "rejected" | "failed" | "in_progress";
  endedReason: string | null; // VAPI detailed reason (e.g., "customer-ended-call", "voicemail")

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

  quotedPrice: number | null;
  negotiatedPrice: number | null;
  transcript: string | null;
  recordingUrl: string | null;
  notes: string | null;

  sessionId: string;
}

// Ensure database is initialized
let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      dbInitialized = true;
    } catch (error) {
      console.error("[call-history] DB initialization failed:", error);
      // Continue anyway - table might already exist
    }
  }
}

// Convert database row to CallHistoryRecord
function rowToRecord(row: Record<string, unknown>): CallHistoryRecord {
  return {
    id: String(row.id),
    callId: row.call_id as string,
    vendorName: row.vendor_name as string,
    vendorPhone: row.vendor_phone as string,
    dateTime: row.date_time instanceof Date
      ? row.date_time.toISOString()
      : String(row.date_time),
    duration: row.duration as number,
    status: row.status as CallHistoryRecord["status"],
    endedReason: (row.ended_reason as string) || null,
    requirements: row.requirements as CallHistoryRecord["requirements"],
    quotedPrice: row.quoted_price ? Number(row.quoted_price) : null,
    negotiatedPrice: row.negotiated_price ? Number(row.negotiated_price) : null,
    transcript: row.transcript as string | null,
    recordingUrl: row.recording_url as string | null,
    notes: row.notes as string | null,
    sessionId: row.session_id as string,
  };
}

export async function saveCallRecord(
  record: Omit<CallHistoryRecord, "id">
): Promise<CallHistoryRecord> {
  await ensureDb();
  const sql = getDb();

  const result = await sql`
    INSERT INTO call_history (
      call_id, vendor_name, vendor_phone, date_time, duration, status, ended_reason,
      requirements, quoted_price, negotiated_price, transcript, recording_url, notes, session_id
    ) VALUES (
      ${record.callId},
      ${record.vendorName},
      ${record.vendorPhone},
      ${record.dateTime},
      ${record.duration},
      ${record.status},
      ${record.endedReason},
      ${JSON.stringify(record.requirements)},
      ${record.quotedPrice},
      ${record.negotiatedPrice},
      ${record.transcript},
      ${record.recordingUrl},
      ${record.notes},
      ${record.sessionId}
    )
    RETURNING *
  `;

  console.log(`[call-history] Saved call record: ${result[0].id}`);
  return rowToRecord(result[0]);
}

export async function updateCallRecord(
  id: string,
  updates: Partial<CallHistoryRecord>
): Promise<CallHistoryRecord | null> {
  await ensureDb();
  const sql = getDb();

  // Use COALESCE to only update provided fields
  const result = await sql`
    UPDATE call_history
    SET
      status = COALESCE(${updates.status ?? null}, status),
      ended_reason = COALESCE(${updates.endedReason ?? null}, ended_reason),
      duration = COALESCE(${updates.duration ?? null}, duration),
      quoted_price = COALESCE(${updates.quotedPrice ?? null}, quoted_price),
      negotiated_price = COALESCE(${updates.negotiatedPrice ?? null}, negotiated_price),
      transcript = COALESCE(${updates.transcript ?? null}, transcript),
      recording_url = COALESCE(${updates.recordingUrl ?? null}, recording_url),
      notes = COALESCE(${updates.notes ?? null}, notes),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  if (result.length === 0) {
    console.log(`[call-history] Record not found: ${id}`);
    return null;
  }

  console.log(`[call-history] Updated call record: ${id}`);
  return rowToRecord(result[0]);
}

export async function getCallRecord(id: string): Promise<CallHistoryRecord | null> {
  await ensureDb();
  const sql = getDb();

  const result = await sql`
    SELECT * FROM call_history WHERE id = ${id}
  `;

  if (result.length === 0) {
    return null;
  }

  return rowToRecord(result[0]);
}

export async function getCallRecordByCallId(
  callId: string
): Promise<CallHistoryRecord | null> {
  await ensureDb();
  const sql = getDb();

  const result = await sql`
    SELECT * FROM call_history WHERE call_id = ${callId}
  `;

  if (result.length === 0) {
    return null;
  }

  return rowToRecord(result[0]);
}

export async function getAllCallRecords(limit: number = 50): Promise<CallHistoryRecord[]> {
  await ensureDb();
  const sql = getDb();

  const result = await sql`
    SELECT * FROM call_history
    ORDER BY date_time DESC
    LIMIT ${limit}
  `;

  return result.map(rowToRecord);
}

export async function getCallRecordsBySession(
  sessionId: string
): Promise<CallHistoryRecord[]> {
  await ensureDb();
  const sql = getDb();

  const result = await sql`
    SELECT * FROM call_history
    WHERE session_id = ${sessionId}
    ORDER BY date_time DESC
  `;

  return result.map(rowToRecord);
}

export async function deleteCallRecord(id: string): Promise<boolean> {
  await ensureDb();
  const sql = getDb();

  const result = await sql`
    DELETE FROM call_history WHERE id = ${id}
    RETURNING id
  `;

  const deleted = result.length > 0;
  if (deleted) {
    console.log(`[call-history] Deleted call record: ${id}`);
  }
  return deleted;
}

export async function clearAllRecords(): Promise<void> {
  await ensureDb();
  const sql = getDb();
  await sql`DELETE FROM call_history`;
  console.log(`[call-history] Cleared all records`);
}
