import { NextRequest, NextResponse } from "next/server";
import {
  getCallRecord,
  updateCallRecord,
  deleteCallRecord,
} from "@/lib/call-history";

// GET /api/call-history/[id] - Get single call record
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const record = await getCallRecord(id);

    if (!record) {
      return NextResponse.json(
        { error: "Call record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ record });
  } catch (error) {
    console.error("[call-history] GET by ID error:", error);
    return NextResponse.json(
      { error: "Failed to fetch call record" },
      { status: 500 }
    );
  }
}

// PATCH /api/call-history/[id] - Update call record
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await request.json();

    const record = await updateCallRecord(id, updates);

    if (!record) {
      return NextResponse.json(
        { error: "Call record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ record });
  } catch (error) {
    console.error("[call-history] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update call record" },
      { status: 500 }
    );
  }
}

// DELETE /api/call-history/[id] - Delete call record
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteCallRecord(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Call record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[call-history] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete call record" },
      { status: 500 }
    );
  }
}
