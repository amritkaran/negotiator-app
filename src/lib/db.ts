import { neon } from "@neondatabase/serverless";

// Get database connection
function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return neon(databaseUrl);
}

// Initialize the database tables
export async function initializeDatabase() {
  try {
    const sql = getDb();

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
        ended_reason VARCHAR(100), -- VAPI detailed reason (e.g., "customer-ended-call", "voicemail")

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

        -- Call type (actual vs synthetic)
        is_synthetic BOOLEAN DEFAULT FALSE,

        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // Add ended_reason column if it doesn't exist (for existing databases)
    await sql`
      ALTER TABLE call_history ADD COLUMN IF NOT EXISTS ended_reason VARCHAR(100);
    `;

    // Add is_synthetic column if it doesn't exist (for existing databases)
    await sql`
      ALTER TABLE call_history ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN DEFAULT FALSE;
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

    // Create eval_runs table for persisting eval results
    await sql`
      CREATE TABLE IF NOT EXISTS eval_runs (
        id SERIAL PRIMARY KEY,
        run_id VARCHAR(255) UNIQUE NOT NULL,
        run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

        -- The 4 key metrics
        quote_obtained_rate INTEGER NOT NULL DEFAULT 0,
        negotiation_attempt_rate INTEGER NOT NULL DEFAULT 0,
        negotiation_success_rate INTEGER NOT NULL DEFAULT 0,
        safety_rate INTEGER NOT NULL DEFAULT 0,

        -- Supporting metrics
        total_calls INTEGER NOT NULL DEFAULT 0,
        completed_calls INTEGER NOT NULL DEFAULT 0,
        calls_with_quotes INTEGER NOT NULL DEFAULT 0,
        calls_with_negotiation_attempt INTEGER NOT NULL DEFAULT 0,
        calls_with_successful_negotiation INTEGER NOT NULL DEFAULT 0,
        unsafe_calls INTEGER NOT NULL DEFAULT 0,

        -- Price metrics
        avg_price_reduction_percent INTEGER DEFAULT 0,
        avg_quoted_price INTEGER DEFAULT 0,
        avg_final_price INTEGER DEFAULT 0,
        total_savings INTEGER DEFAULT 0,

        -- Full metrics and call IDs as JSON
        metrics JSONB NOT NULL,
        call_ids JSONB NOT NULL,

        -- Config and notes
        notes TEXT,
        config JSONB,

        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // Create index on run_at for sorting
    await sql`
      CREATE INDEX IF NOT EXISTS idx_eval_runs_run_at ON eval_runs(run_at DESC);
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
    const sql = getDb();
    const result = await sql`SELECT 1 as connected`;
    return result[0]?.connected === 1;
  } catch (error) {
    console.error("[db] Connection check failed:", error);
    return false;
  }
}

// Export getDb for use in other modules
export { getDb };
