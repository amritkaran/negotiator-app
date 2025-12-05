/**
 * Call History Storage - Persists call records using Vercel Postgres
 */

import { sql } from "@vercel/postgres";
import { initializeDatabase } from "./db";

export interface CallHistoryRecord {
  id: string;
  callId: string;
  vendorName: string;
  vendorPhone: string;
  dateTime: string;
  duration: number;
  status: "completed" | "no_answer" | "busy" | "rejected" | "failed" | "in_progress";

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
    dateTime: (row.date_time as Date).toISOString(),
    duration: row.duration as number,
    status: row.status as CallHistoryRecord["status"],
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

  const result = await sql`
    INSERT INTO call_history (
      call_id, vendor_name, vendor_phone, date_time, duration, status,
      requirements, quoted_price, negotiated_price, transcript, recording_url, notes, session_id
    ) VALUES (
      ${record.callId},
      ${record.vendorName},
      ${record.vendorPhone},
      ${record.dateTime},
      ${record.duration},
      ${record.status},
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

  console.log(`[call-history] Saved call record: ${result.rows[0].id}`);
  return rowToRecord(result.rows[0]);
}

export async function updateCallRecord(
  id: string,
  updates: Partial<CallHistoryRecord>
): Promise<CallHistoryRecord | null> {
  await ensureDb();

  // Build dynamic update query
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.duration !== undefined) {
    setClauses.push(`duration = $${paramIndex++}`);
    values.push(updates.duration);
  }
  if (updates.quotedPrice !== undefined) {
    setClauses.push(`quoted_price = $${paramIndex++}`);
    values.push(updates.quotedPrice);
  }
  if (updates.negotiatedPrice !== undefined) {
    setClauses.push(`negotiated_price = $${paramIndex++}`);
    values.push(updates.negotiatedPrice);
  }
  if (updates.transcript !== undefined) {
    setClauses.push(`transcript = $${paramIndex++}`);
    values.push(updates.transcript);
  }
  if (updates.recordingUrl !== undefined) {
    setClauses.push(`recording_url = $${paramIndex++}`);
    values.push(updates.recordingUrl);
  }
  if (updates.notes !== undefined) {
    setClauses.push(`notes = $${paramIndex++}`);
    values.push(updates.notes);
  }

  setClauses.push(`updated_at = NOW()`);

  if (setClauses.length === 1) {
    // Only updated_at, nothing to update
    const existing = await getCallRecord(id);
    return existing;
  }

  // Use sql template for the update
  const result = await sql`
    UPDATE call_history
    SET
      status = COALESCE(${updates.status}, status),
      duration = COALESCE(${updates.duration}, duration),
      quoted_price = COALESCE(${updates.quotedPrice}, quoted_price),
      negotiated_price = COALESCE(${updates.negotiatedPrice}, negotiated_price),
      transcript = COALESCE(${updates.transcript}, transcript),
      recording_url = COALESCE(${updates.recordingUrl}, recording_url),
      notes = COALESCE(${updates.notes}, notes),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  if (result.rows.length === 0) {
    console.log(`[call-history] Record not found: ${id}`);
    return null;
  }

  console.log(`[call-history] Updated call record: ${id}`);
  return rowToRecord(result.rows[0]);
}

export async function getCallRecord(id: string): Promise<CallHistoryRecord | null> {
  await ensureDb();

  const result = await sql`
    SELECT * FROM call_history WHERE id = ${id}
  `;

  if (result.rows.length === 0) {
    return null;
  }

  return rowToRecord(result.rows[0]);
}

export async function getCallRecordByCallId(
  callId: string
): Promise<CallHistoryRecord | null> {
  await ensureDb();

  const result = await sql`
    SELECT * FROM call_history WHERE call_id = ${callId}
  `;

  if (result.rows.length === 0) {
    return null;
  }

  return rowToRecord(result.rows[0]);
}

export async function getAllCallRecords(limit: number = 50): Promise<CallHistoryRecord[]> {
  await ensureDb();

  const result = await sql`
    SELECT * FROM call_history
    ORDER BY date_time DESC
    LIMIT ${limit}
  `;

  return result.rows.map(rowToRecord);
}

export async function getCallRecordsBySession(
  sessionId: string
): Promise<CallHistoryRecord[]> {
  await ensureDb();

  const result = await sql`
    SELECT * FROM call_history
    WHERE session_id = ${sessionId}
    ORDER BY date_time DESC
  `;

  return result.rows.map(rowToRecord);
}

export async function deleteCallRecord(id: string): Promise<boolean> {
  await ensureDb();

  const result = await sql`
    DELETE FROM call_history WHERE id = ${id}
    RETURNING id
  `;

  const deleted = result.rows.length > 0;
  if (deleted) {
    console.log(`[call-history] Deleted call record: ${id}`);
  }
  return deleted;
}

export async function clearAllRecords(): Promise<void> {
  await ensureDb();
  await sql`DELETE FROM call_history`;
  console.log(`[call-history] Cleared all records`);
}
