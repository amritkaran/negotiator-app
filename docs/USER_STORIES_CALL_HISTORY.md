# Call History Feature - User Stories

## Epic: Call History & Recording Playback
As a user of the Negotiator app, I want to view a history of all calls placed by the AI agent, including recordings and transcripts, so I can review past negotiations and track vendor quotes.

---

## User Stories

### US-1: View Call History List
**As a** user
**I want to** see a list of all calls that were placed through the app
**So that** I can review past negotiations and their outcomes

**Acceptance Criteria:**
- [ ] Display a "Call History" section on the main page
- [ ] Show a table with columns: Date/Time, Vendor Name, Phone, Duration, Status, Quoted Price
- [ ] Sort by most recent call first (descending order)
- [ ] Show call status with visual indicators (completed=green, failed=red, no answer=yellow)
- [ ] Display duration in mm:ss format
- [ ] Show "No calls yet" message when history is empty

**Priority:** High

---

### US-2: View Call Details & Summary
**As a** user
**I want to** click on a call record to see the full details
**So that** I can review exactly what was discussed and agreed upon

**Acceptance Criteria:**
- [ ] Expandable row or modal showing full call details
- [ ] Display user requirements summary:
  - Service type (cab/taxi)
  - From location
  - To location
  - Date and time
  - Number of passengers
  - Vehicle type preference
  - Trip type (one-way/round-trip)
- [ ] Display vendor information:
  - Vendor name
  - Phone number
- [ ] Display negotiation outcome:
  - Quoted price from vendor
  - Final negotiated price (if different)
  - Call outcome notes
- [ ] Display full call transcript

**Priority:** High

---

### US-3: Play Call Recording
**As a** user
**I want to** play the audio recording of any completed call
**So that** I can hear exactly what the AI agent and vendor discussed

**Acceptance Criteria:**
- [ ] Show a "Play Recording" button for calls that have recordings
- [ ] Audio player with:
  - Play/Pause button
  - Progress bar showing current position
  - Duration display (current time / total time)
  - Volume control
- [ ] Disable/hide button if no recording available
- [ ] Show loading state while recording loads

**Priority:** High

---

### US-4: Persist Call History Across Sessions
**As a** user
**I want to** see my call history even after closing and reopening the app
**So that** I don't lose track of past negotiations

**Acceptance Criteria:**
- [ ] Call records are saved when a call is initiated
- [ ] Call records are updated when call completes with:
  - Final status
  - Duration
  - Transcript
  - Recording URL
  - Quoted price
- [ ] History persists across browser refreshes
- [ ] History is available on deployed Vercel app
- [ ] Store at least last 100 calls

**Priority:** High

---

### US-5: Real-time Call Status Updates
**As a** user
**I want to** see the call status update in real-time while a call is in progress
**So that** I know what's happening without refreshing

**Acceptance Criteria:**
- [ ] Show "In Progress" status for active calls
- [ ] Update status automatically when call ends
- [ ] Show duration updating in real-time during call
- [ ] Update with transcript and recording when available

**Priority:** Medium

---

---

## Technical Notes

### Data Model: CallHistoryRecord
```typescript
interface CallHistoryRecord {
  id: string;              // Unique record ID
  callId: string;          // VAPI call ID
  vendorName: string;
  vendorPhone: string;
  dateTime: string;        // ISO timestamp
  duration: number;        // seconds
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
```

### API Endpoints
- `GET /api/call-history` - Get all call records
- `GET /api/call-history/[id]` - Get single call record
- `POST /api/call-history` - Create new call record
- `PATCH /api/call-history/[id]` - Update call record

### Storage Options
1. **In-memory** (current) - Simple but resets on cold start
2. **Vercel KV** - Redis-based, persistent, recommended for production
3. **Vercel Postgres** - Full SQL database, most robust

---

## Implementation Order
1. US-1: View Call History List (table UI)
2. US-4: Persist Call History (storage + API)
3. US-2: View Call Details (expandable rows)
4. US-3: Play Call Recording (audio player)
5. US-5: Real-time Updates (polling)
