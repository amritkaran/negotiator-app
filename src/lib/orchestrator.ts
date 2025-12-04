import { UserRequirement, Business, CallResult, AppStage } from "@/types";
import { extractRequirements } from "./openai";
import { searchNearbyBusinesses, rankBusinesses, geocodeAddress } from "./google-maps";
import { makeOutboundCall, waitForCallCompletion, processCallResult } from "./vapi";

export interface OrchestrationState {
  stage: AppStage;
  requirements: UserRequirement | null;
  businesses: Business[];
  callResults: CallResult[];
  error?: string;
}

export interface OrchestrationUpdate {
  type: "stage_change" | "message" | "businesses_found" | "call_started" | "call_completed" | "error";
  data: {
    stage?: AppStage;
    message?: string;
    businesses?: Business[];
    callResult?: CallResult;
    error?: string;
  };
}

type UpdateCallback = (update: OrchestrationUpdate) => void;

export class NegotiatorOrchestrator {
  private state: OrchestrationState;
  private conversationHistory: { role: "user" | "assistant"; content: string }[];
  private onUpdate: UpdateCallback;

  constructor(onUpdate: UpdateCallback) {
    this.state = {
      stage: "gathering_requirements",
      requirements: null,
      businesses: [],
      callResults: [],
    };
    this.conversationHistory = [];
    this.onUpdate = onUpdate;
  }

  private emit(update: OrchestrationUpdate) {
    this.onUpdate(update);
  }

  private setStage(stage: AppStage) {
    this.state.stage = stage;
    this.emit({ type: "stage_change", data: { stage } });
  }

  async processUserMessage(message: string): Promise<string> {
    this.conversationHistory.push({ role: "user", content: message });

    switch (this.state.stage) {
      case "gathering_requirements":
        return await this.handleRequirementGathering();

      default:
        return "I'm currently processing your request. Please wait...";
    }
  }

  private async handleRequirementGathering(): Promise<string> {
    const { requirements, followUpQuestion } = await extractRequirements(
      this.conversationHistory
    );

    this.state.requirements = requirements;

    if (!requirements.isComplete) {
      const response = followUpQuestion || "Could you provide more details?";
      this.conversationHistory.push({ role: "assistant", content: response });
      return response;
    }

    // Requirements complete - proceed to business search
    this.conversationHistory.push({
      role: "assistant",
      content: `Got it! I have all the details I need:\n- ${requirements.service} from ${requirements.from} to ${requirements.to}\n- Date: ${requirements.date} at ${requirements.time}\n- Passengers: ${requirements.passengers || "Not specified"}\n\nNow let me find the best service providers near you...`,
    });

    return this.conversationHistory[this.conversationHistory.length - 1].content;
  }

  async startBusinessSearch(): Promise<Business[]> {
    if (!this.state.requirements?.from) {
      throw new Error("No pickup location specified");
    }

    this.setStage("searching_businesses");
    this.emit({
      type: "message",
      data: { message: "Searching for nearby service providers..." },
    });

    // Geocode the pickup location
    const location = await geocodeAddress(this.state.requirements.from);
    if (!location) {
      throw new Error(`Could not find location: ${this.state.requirements.from}`);
    }

    this.state.requirements.userLocation = location;

    // Search for businesses
    const allBusinesses = await searchNearbyBusinesses(
      this.state.requirements.service,
      location,
      5 // 5km radius
    );

    if (allBusinesses.length === 0) {
      throw new Error("No service providers found in your area");
    }

    // Rank and select top 3 (prioritize preferred vendors if specified)
    const topBusinesses = await rankBusinesses(
      allBusinesses,
      3,
      this.state.requirements.preferredVendors
    );
    this.state.businesses = topBusinesses;

    this.emit({
      type: "businesses_found",
      data: { businesses: topBusinesses },
    });

    return topBusinesses;
  }

  async startCalling(): Promise<CallResult[]> {
    if (this.state.businesses.length === 0) {
      throw new Error("No businesses to call");
    }

    if (!this.state.requirements) {
      throw new Error("Requirements not gathered");
    }

    this.setStage("making_calls");
    this.emit({
      type: "message",
      data: {
        message: `Starting calls to ${this.state.businesses.length} service providers...`,
      },
    });

    const results: CallResult[] = [];
    let lowestPriceSoFar: number | undefined = undefined;

    // Make calls sequentially to track lowest price and use it in negotiations
    for (const business of this.state.businesses) {
      this.emit({
        type: "call_started",
        data: { message: `Calling ${business.name}...` },
      });

      try {
        const { callId } = await makeOutboundCall(business, this.state.requirements, lowestPriceSoFar);

        // Wait for call to complete
        const callResponse = await waitForCallCompletion(callId);

        // Process the result
        const result = await processCallResult(callResponse, business);
        results.push(result);

        // Update lowest price benchmark if we got a valid quote
        if (result.quotedPrice && result.status === "completed") {
          if (!lowestPriceSoFar || result.quotedPrice < lowestPriceSoFar) {
            lowestPriceSoFar = result.quotedPrice;
          }
        }

        this.emit({
          type: "call_completed",
          data: { callResult: result },
        });
      } catch (error) {
        console.error(`Call to ${business.name} failed:`, error);
        results.push({
          businessId: business.id,
          businessName: business.name,
          phone: business.phone,
          status: "failed",
          notes: error instanceof Error ? error.message : "Call failed",
        });
      }
    }

    this.state.callResults = results;
    this.setStage("presenting_results");

    return results;
  }

  getState(): OrchestrationState {
    return { ...this.state };
  }

  getRequirements(): UserRequirement | null {
    return this.state.requirements;
  }

  isRequirementsComplete(): boolean {
    return this.state.requirements?.isComplete || false;
  }
}

// Singleton for API routes
let orchestratorInstance: NegotiatorOrchestrator | null = null;
const updateQueue: OrchestrationUpdate[] = [];

export function getOrchestrator(): NegotiatorOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new NegotiatorOrchestrator((update) => {
      updateQueue.push(update);
    });
  }
  return orchestratorInstance;
}

export function resetOrchestrator(): void {
  orchestratorInstance = null;
  updateQueue.length = 0;
}

export function getAndClearUpdates(): OrchestrationUpdate[] {
  const updates = [...updateQueue];
  updateQueue.length = 0;
  return updates;
}
