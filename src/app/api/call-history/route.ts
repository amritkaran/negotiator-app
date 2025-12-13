import { NextRequest, NextResponse } from "next/server";
import {
  getAllCallRecords,
  saveCallRecord,
  CallHistoryRecord,
} from "@/lib/call-history";

// GET /api/call-history - Get all call records
export async function GET() {
  try {
    const records = await getAllCallRecords(100);
    return NextResponse.json({ records });
  } catch (error) {
    console.error("[call-history] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch call history" },
      { status: 500 }
    );
  }
}

// POST /api/call-history - Create a new call record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const record: Omit<CallHistoryRecord, "id"> = {
      callId: body.callId,
      vendorName: body.vendorName,
      vendorPhone: body.vendorPhone,
      dateTime: body.dateTime || new Date().toISOString(),
      duration: body.duration || 0,
      status: body.status || "in_progress",
      endedReason: body.endedReason || null,
      requirements: {
        service: body.requirements?.service || "cab",
        from: body.requirements?.from || "",
        to: body.requirements?.to || "",
        date: body.requirements?.date || "",
        time: body.requirements?.time || "",
        passengers: body.requirements?.passengers,
        vehicleType: body.requirements?.vehicleType,
        tripType: body.requirements?.tripType,
      },
      quotedPrice: body.quotedPrice || null,
      negotiatedPrice: body.negotiatedPrice || null,
      transcript: body.transcript || null,
      recordingUrl: body.recordingUrl || null,
      notes: body.notes || null,
      sessionId: body.sessionId || "unknown",
      isSynthetic: body.isSynthetic ?? false,
    };

    const savedRecord = await saveCallRecord(record);
    return NextResponse.json({ record: savedRecord }, { status: 201 });
  } catch (error) {
    console.error("[call-history] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create call record" },
      { status: 500 }
    );
  }
}
