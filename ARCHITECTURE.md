# Negotiator AI - Multi-Agent Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              LANGGRAPH ORCHESTRATOR                              │
│                                                                                  │
│  ┌──────────┐     ┌─────────────────────────────────────┐     ┌──────────────┐ │
│  │  INTAKE  │────▶│          RESEARCH AGENT             │────▶│  NEGOTIATOR  │ │
│  │  AGENT   │     │  ┌─────────┐ ┌─────────┐ ┌───────┐ │     │    AGENT     │ │
│  └──────────┘     │  │ Price   │ │ Review  │ │Vendor │ │     │              │ │
│                   │  │ Intel   │ │Analyzer │ │Ranker │ │     │ ┌──────────┐ │ │
│                   │  └─────────┘ └─────────┘ └───────┘ │     │ │Human-in- │ │ │
│                   └─────────────────────────────────────┘     │ │the-loop  │ │ │
│                                                               │ └──────────┘ │ │
│                                                               │              │ │
│                                                               │ ┌──────────┐ │ │
│                                                               │ │Language  │ │ │
│                                                               │ │Switcher  │ │ │
│                                                               │ └──────────┘ │ │
│                                                               └───────┬──────┘ │
│                                                                       │        │
│                   ┌───────────────────────────────────────────────────┘        │
│                   │                                                            │
│                   ▼                                                            │
│  ┌─────────────────────┐     ┌─────────────────────────────────────────────┐  │
│  │   LEARNING AGENT    │     │           VERIFICATION AGENT                │  │
│  │                     │     │                                             │  │
│  │ • Analyze call      │     │ • Callback to confirm details               │  │
│  │ • Safety/toxicity   │     │ • Verify price, time, vehicle               │  │
│  │ • Enhance prompts   │     │ • Detect discrepancies                      │  │
│  │ • Update strategy   │     │ • Final confirmation                        │  │
│  └─────────────────────┘     └─────────────────────────────────────────────┘  │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │   SSE Stream    │
                              │  Agent Events   │
                              └────────┬────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │    Frontend     │
                              │  Agent Tracker  │
                              └─────────────────┘
```

## Agent Specifications

### 1. Intake Agent
**Purpose**: Gather user requirements through conversational interface

**Inputs**: User messages
**Outputs**: Structured requirements (service, from, to, date, time, passengers, preferences)

**State Updates**:
- `requirements`: UserRequirement object
- `isComplete`: boolean

---

### 2. Research Agent (with Sub-Agents)

**Purpose**: Deep research before negotiation to establish baseline and rank vendors

#### 2.1 Price Intel Sub-Agent
**Purpose**: Establish baseline pricing for the route

**Data Sources**:
- Google Maps distance/duration
- Ola/Uber API estimates (if available)
- Historical pricing data
- Fuel price calculations

**Outputs**:
```typescript
{
  estimatedDistance: number;      // km
  estimatedDuration: number;      // minutes
  baselinePrice: {
    low: number;                  // budget estimate
    mid: number;                  // standard estimate
    high: number;                 // premium estimate
  };
  factors: string[];              // "highway tolls", "night charges", etc.
}
```

#### 2.2 Review Analyzer Sub-Agent
**Purpose**: Analyze Google reviews for negotiation leverage

**Analysis Points**:
- Overall rating and trend
- Professionalism mentions
- Price mentions in reviews
- Common complaints
- Response to issues

**Outputs**:
```typescript
{
  businessId: string;
  rating: number;
  reviewCount: number;
  sentiment: "positive" | "neutral" | "negative";
  pricePerception: "cheap" | "fair" | "expensive" | "unknown";
  professionalism: "high" | "medium" | "low";
  redFlags: string[];
  negotiationLeverage: string[];  // "Reviews mention flexible pricing"
}
```

#### 2.3 Vendor Ranker Sub-Agent
**Purpose**: Rank vendors based on multiple factors

**Ranking Factors**:
- Proximity (distance from pickup)
- Rating & review quality
- Price perception from reviews
- Operating hours match
- Professionalism score

**Outputs**:
```typescript
{
  rankedVendors: Array<{
    business: Business;
    score: number;
    ranking: number;
    strengths: string[];
    weaknesses: string[];
    negotiationStrategy: string;  // "Push hard on price" or "Focus on service"
  }>;
}
```

---

### 3. Negotiator Agent

**Purpose**: Conduct voice negotiations with vendors

**Features**:
- Uses research data for informed negotiation
- Dynamic language switching (Kannada/Hindi/English)
- Human-in-the-loop for unknown questions
- Benchmark tracking across calls

#### 3.1 Language Switcher Module
**Trigger**: Detects language mismatch in conversation
**Action**: Switches TTS/STT and prompt language dynamically

**Supported Languages**:
- Kannada (default)
- Hindi
- English
- Telugu (future)

#### 3.2 Human-in-the-Loop Module
**Trigger**: Vendor asks question agent cannot answer
**Examples**:
- "What's your exact address?"
- "Do you need child seat?"
- "Can you pay in advance?"

**Flow**:
1. Agent detects unanswerable question
2. Pauses call (politely: "One moment please")
3. Sends interrupt to frontend
4. User provides answer
5. Agent resumes with answer

**State**:
```typescript
{
  interruptReason: string;
  vendorQuestion: string;
  awaitingHumanInput: boolean;
  humanResponse?: string;
}
```

---

### 4. Learning Agent

**Purpose**: Analyze each call and improve future negotiations

**Triggers**: After each call completes

#### 4.1 Call Analysis
**Analyzes**:
- What worked in negotiation
- What didn't work
- Vendor objections and responses
- Final outcome vs baseline

**Outputs**:
```typescript
{
  callId: string;
  effectiveness: number;          // 0-100
  successfulTactics: string[];
  failedTactics: string[];
  vendorPersonality: string;      // "aggressive", "flexible", "professional"
  lessonsLearned: string[];
}
```

#### 4.2 Safety & Toxicity Check
**Checks**:
- Inappropriate language from agent
- Aggressive tactics that backfired
- Vendor complaints about approach
- Cultural sensitivity issues

**Outputs**:
```typescript
{
  safetyScore: number;            // 0-100
  toxicityDetected: boolean;
  issues: string[];
  recommendations: string[];
}
```

#### 4.3 Prompt Enhancement
**Updates**:
- Negotiation strategy based on what worked
- Language patterns that were effective
- Objection handling improvements
- Cultural adjustments

**Storage**:
```typescript
// Stored in DB/file, loaded for next session
{
  version: number;
  lastUpdated: Date;
  enhancements: {
    effectivePhrases: string[];
    avoidPhrases: string[];
    objectionHandlers: Record<string, string>;
    culturalNotes: string[];
  };
  promptModifications: string;    // Actual prompt additions
}
```

---

### 5. Verification Agent

**Purpose**: Confirm negotiated details before finalizing

**Trigger**: After successful negotiation

**Verification Call Flow**:
1. Call vendor back
2. Confirm: "I'm calling to confirm our booking"
3. Verify each detail:
   - Price: "The agreed price was ₹X, correct?"
   - Time: "Pickup at X time on X date?"
   - Vehicle: "You'll send a X vehicle?"
   - Contact: "Driver will call on this number?"
4. Detect any discrepancies
5. Report to user

**Outputs**:
```typescript
{
  verified: boolean;
  discrepancies: Array<{
    field: string;
    negotiated: string;
    confirmed: string;
  }>;
  finalConfirmation: {
    price: number;
    time: string;
    vehicle: string;
    driverContact: string;
  };
}
```

---

## State Schema

```typescript
interface NegotiatorState {
  // Session
  sessionId: string;
  currentAgent: AgentType;
  agentHistory: AgentEvent[];

  // User Requirements
  requirements: UserRequirement;

  // Research Results
  research: {
    priceIntel: PriceIntelResult;
    reviewAnalysis: ReviewAnalysisResult[];
    vendorRanking: VendorRankingResult;
  };

  // Negotiation State
  negotiations: {
    currentVendorIndex: number;
    lowestPrice: number | null;
    calls: CallState[];
  };

  // Human-in-the-Loop
  humanInterrupt: {
    active: boolean;
    reason: string;
    question: string;
    response: string | null;
  };

  // Language
  currentLanguage: "kn" | "hi" | "en" | "te";

  // Learning
  learnings: {
    sessionLearnings: string[];
    promptEnhancements: string;
  };

  // Verification
  verification: {
    completed: boolean;
    result: VerificationResult | null;
  };

  // Final Result
  bestDeal: {
    vendor: Business;
    price: number;
    details: string;
  } | null;
}
```

---

## Event Types (for Frontend)

```typescript
type AgentEvent = {
  timestamp: Date;
  type:
    | "agent_started"
    | "agent_completed"
    | "handoff"
    | "sub_agent_started"
    | "sub_agent_completed"
    | "human_interrupt_requested"
    | "human_interrupt_resolved"
    | "language_switched"
    | "call_started"
    | "call_ended"
    | "learning_updated"
    | "verification_started"
    | "verification_completed"
    | "error";
  agent: string;
  message: string;
  data?: any;
};
```

---

## File Structure

```
src/
├── lib/
│   └── agents/
│       ├── types.ts              # All type definitions
│       ├── state.ts              # State schema and reducers
│       ├── graph.ts              # LangGraph definition
│       ├── intake/
│       │   └── agent.ts
│       ├── research/
│       │   ├── agent.ts          # Main research orchestrator
│       │   ├── price-intel.ts    # Price research sub-agent
│       │   ├── review-analyzer.ts # Review analysis sub-agent
│       │   └── vendor-ranker.ts  # Vendor ranking sub-agent
│       ├── negotiator/
│       │   ├── agent.ts          # Main negotiator
│       │   ├── language-switcher.ts
│       │   └── human-interrupt.ts
│       ├── learning/
│       │   ├── agent.ts
│       │   ├── call-analyzer.ts
│       │   ├── safety-checker.ts
│       │   └── prompt-enhancer.ts
│       └── verification/
│           └── agent.ts
├── app/
│   └── api/
│       ├── agent-stream/
│       │   └── route.ts          # SSE endpoint
│       └── human-response/
│           └── route.ts          # Human-in-the-loop response
└── components/
    ├── AgentTracker.tsx          # Visual agent pipeline
    ├── AgentEventLog.tsx         # Event timeline
    └── HumanInterruptModal.tsx   # Modal for human input
```

---

## Implementation Order

1. **Phase 1: Foundation**
   - Set up LangGraph
   - Create types and state schema
   - Build basic graph structure

2. **Phase 2: Research Agent**
   - Price Intel sub-agent
   - Review Analyzer sub-agent
   - Vendor Ranker sub-agent

3. **Phase 3: Negotiator Agent**
   - Basic negotiation with research data
   - Language switching
   - Human-in-the-loop

4. **Phase 4: Learning Agent**
   - Call analysis
   - Safety/toxicity checking
   - Prompt enhancement

5. **Phase 5: Verification Agent**
   - Confirmation call logic
   - Discrepancy detection

6. **Phase 6: Frontend**
   - Agent tracker UI
   - Event log
   - Human interrupt modal

7. **Phase 7: Integration & Testing**
   - End-to-end flow
   - Error handling
   - Performance optimization
