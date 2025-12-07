"use client";

import CallHistory from "@/components/CallHistory";
import Link from "next/link";

export default function HistoryPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 flex items-center justify-between shadow-lg">
        <div>
          <h1 className="text-xl font-bold text-white">Call History</h1>
          <p className="text-sm text-gray-400">View past negotiations and recordings</p>
        </div>
        <Link
          href="/"
          className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          ← Back to Negotiator
        </Link>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <CallHistory />
      </div>
    </div>
  );
}
