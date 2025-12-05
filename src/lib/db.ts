import { sql } from "@vercel/postgres";

// Initialize the database tables
export async function initializeDatabase() {
  try {
    // Create call_history table
    await sql`
      CREATE TABLE IF NOT EXISTS call_history (
        id SERIAL PRIMARY KEY,
        call_id VARCHAR(255) UNIQUE NOT NULL,
        vendor_name VARCHAR(255) NOT NULL,
        vendor_phone VARCHAR(50) NOT NULL,
        date_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        duration INTEGER DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'in_progress',

        -- Requirements as JSON
        requirements JSONB,

        -- Call results
        quoted_price DECIMAL(10, 2),
        negotiated_price DECIMAL(10, 2),
        transcript TEXT,
        recording_url TEXT,
        notes TEXT,

        -- Session info
        session_id VARCHAR(255),

        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // Create index on call_id for faster lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_call_history_call_id ON call_history(call_id);
    `;

    // Create index on session_id
    await sql`
      CREATE INDEX IF NOT EXISTS idx_call_history_session_id ON call_history(session_id);
    `;

    // Create index on date_time for sorting
    await sql`
      CREATE INDEX IF NOT EXISTS idx_call_history_date_time ON call_history(date_time DESC);
    `;

    console.log("[db] Database initialized successfully");
    return true;
  } catch (error) {
    console.error("[db] Failed to initialize database:", error);
    throw error;
  }
}

// Check if database is connected
export async function checkConnection() {
  try {
    const result = await sql`SELECT 1 as connected`;
    return result.rows[0]?.connected === 1;
  } catch (error) {
    console.error("[db] Connection check failed:", error);
    return false;
  }
}
