"use client";

import { useState, useEffect, useRef } from "react";
import { getEndedReasonDisplay } from "@/lib/ended-reason-display";

interface CallHistoryRecord {
  id: string;
  callId: string;
  vendorName: string;
  vendorPhone: string;
  dateTime: string;
  duration: number;
  status: "completed" | "no_answer" | "busy" | "rejected" | "failed" | "in_progress";
  endedReason: string | null;
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

interface CallHistoryProps {
  refreshTrigger?: number; // Increment to trigger refresh
}

export default function CallHistory({ refreshTrigger }: CallHistoryProps) {
  const [records, setRecords] = useState<CallHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch call history
  const fetchHistory = async () => {
    try {
      const response = await fetch("/api/call-history");
      const data = await response.json();
      setRecords(data.records || []);
    } catch (error) {
      console.error("Failed to fetch call history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshTrigger]);

  // Format duration as mm:ss
  const formatDuration = (seconds: number): string => {
    if (!seconds) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Format date/time
  const formatDateTime = (isoString: string): { date: string; time: string } => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      time: date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  };

  // Get status color and label
  const getStatusDisplay = (status: string): { color: string; label: string } => {
    switch (status) {
      case "completed":
        return { color: "bg-green-100 text-green-800", label: "Completed" };
      case "in_progress":
        return { color: "bg-blue-100 text-blue-800", label: "In Progress" };
      case "no_answer":
        return { color: "bg-yellow-100 text-yellow-800", label: "No Answer" };
      case "busy":
        return { color: "bg-orange-100 text-orange-800", label: "Busy" };
      case "rejected":
        return { color: "bg-red-100 text-red-800", label: "Rejected" };
      case "failed":
        return { color: "bg-red-100 text-red-800", label: "Failed" };
      default:
        return { color: "bg-gray-100 text-gray-800", label: status };
    }
  };

  // Handle audio playback
  const handlePlayRecording = (record: CallHistoryRecord) => {
    if (!record.recordingUrl) return;

    if (playingId === record.id) {
      // Stop current playback
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      // Start new playback
      if (audioRef.current) {
        audioRef.current.src = record.recordingUrl;
        audioRef.current.play();
        setPlayingId(record.id);
      }
    }
  };

  // Handle audio ended
  const handleAudioEnded = () => {
    setPlayingId(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Call History</h2>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Call History</h2>
        <button
          onClick={fetchHistory}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />

      {records.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
          <p className="mt-2">No calls placed yet</p>
          <p className="text-sm">Calls will appear here once you start negotiating</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date / Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vendor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quote
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {records.map((record) => {
                const { date, time } = formatDateTime(record.dateTime);
                const statusDisplay = getStatusDisplay(record.status);
                const isExpanded = expandedId === record.id;

                return (
                  <>
                    <tr
                      key={record.id}
                      className={`hover:bg-gray-50 cursor-pointer ${
                        isExpanded ? "bg-blue-50" : ""
                      }`}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : record.id)
                      }
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {date}
                        </div>
                        <div className="text-sm text-gray-500">{time}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {record.vendorName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {record.vendorPhone}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {formatDuration(record.duration)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${statusDisplay.color}`}
                        >
                          {statusDisplay.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {record.endedReason ? (
                          (() => {
                            const reasonDisplay = getEndedReasonDisplay(record.endedReason);
                            return (
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded-full ${reasonDisplay.color}`}
                                title={reasonDisplay.description}
                              >
                                {reasonDisplay.icon} {reasonDisplay.label}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="text-gray-400 text-xs">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {record.quotedPrice ? (
                          <span className="font-medium text-green-600">
                            ₹{record.quotedPrice}
                          </span>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {record.recordingUrl && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlayRecording(record);
                              }}
                              className={`p-1.5 rounded-full ${
                                playingId === record.id
                                  ? "bg-red-100 text-red-600"
                                  : "bg-blue-100 text-blue-600"
                              } hover:opacity-80`}
                              title={
                                playingId === record.id
                                  ? "Stop"
                                  : "Play Recording"
                              }
                            >
                              {playingId === record.id ? (
                                <svg
                                  className="w-4 h-4"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <rect x="6" y="4" width="4" height="16" />
                                  <rect x="14" y="4" width="4" height="16" />
                                </svg>
                              ) : (
                                <svg
                                  className="w-4 h-4"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              )}
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(isExpanded ? null : record.id);
                            }}
                            className="p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                            title="View Details"
                          >
                            <svg
                              className={`w-4 h-4 transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Details Row */}
                    {isExpanded && (
                      <tr key={`${record.id}-details`}>
                        <td colSpan={7} className="px-4 py-4 bg-gray-50">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Requirements Summary */}
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">
                                Trip Requirements
                              </h4>
                              <div className="space-y-1 text-sm">
                                <p>
                                  <span className="text-gray-500">Service:</span>{" "}
                                  <span className="text-gray-800">{record.requirements.service}</span>
                                </p>
                                <p>
                                  <span className="text-gray-500">From:</span>{" "}
                                  <span className="text-gray-800">{record.requirements.from}</span>
                                </p>
                                <p>
                                  <span className="text-gray-500">To:</span>{" "}
                                  <span className="text-gray-800">{record.requirements.to}</span>
                                </p>
                                <p>
                                  <span className="text-gray-500">Date:</span>{" "}
                                  <span className="text-gray-800">{record.requirements.date}</span>
                                </p>
                                <p>
                                  <span className="text-gray-500">Time:</span>{" "}
                                  <span className="text-gray-800">{record.requirements.time}</span>
                                </p>
                                {record.requirements.passengers && (
                                  <p>
                                    <span className="text-gray-500">
                                      Passengers:
                                    </span>{" "}
                                    <span className="text-gray-800">{record.requirements.passengers}</span>
                                  </p>
                                )}
                                {record.requirements.vehicleType && (
                                  <p>
                                    <span className="text-gray-500">
                                      Vehicle:
                                    </span>{" "}
                                    <span className="text-gray-800">{record.requirements.vehicleType}</span>
                                  </p>
                                )}
                                {record.requirements.tripType && (
                                  <p>
                                    <span className="text-gray-500">
                                      Trip Type:
                                    </span>{" "}
                                    <span className="text-gray-800">{record.requirements.tripType}</span>
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Quote & Notes */}
                            <div>
                              <h4 className="font-medium text-gray-900 mb-2">
                                Negotiation Result
                              </h4>
                              <div className="space-y-1 text-sm">
                                <p>
                                  <span className="text-gray-500">
                                    Quoted Price:
                                  </span>{" "}
                                  {record.quotedPrice ? (
                                    <span className="font-medium text-green-600">
                                      ₹{record.quotedPrice}
                                    </span>
                                  ) : (
                                    <span className="text-gray-600 italic">
                                      Not quoted
                                    </span>
                                  )}
                                </p>
                                {record.negotiatedPrice &&
                                  record.negotiatedPrice !==
                                    record.quotedPrice && (
                                    <p>
                                      <span className="text-gray-500">
                                        Negotiated:
                                      </span>{" "}
                                      <span className="font-medium text-green-600">
                                        ₹{record.negotiatedPrice}
                                      </span>
                                    </p>
                                  )}
                                {record.notes && (
                                  <p>
                                    <span className="text-gray-500">Notes:</span>{" "}
                                    <span className="text-gray-800">{record.notes}</span>
                                  </p>
                                )}
                                {record.endedReason && (
                                  <p>
                                    <span className="text-gray-500">Call Ended:</span>{" "}
                                    {(() => {
                                      const reasonDisplay = getEndedReasonDisplay(record.endedReason);
                                      return (
                                        <span className={`inline-flex items-center gap-1 ${reasonDisplay.color.replace('bg-', 'text-').replace('-100', '-700')}`}>
                                          {reasonDisplay.icon} {reasonDisplay.label}
                                          <span className="text-gray-500 font-normal"> - {reasonDisplay.description}</span>
                                        </span>
                                      );
                                    })()}
                                  </p>
                                )}
                              </div>

                              {/* Audio Player */}
                              {record.recordingUrl && (
                                <div className="mt-4">
                                  <h4 className="font-medium text-gray-900 mb-2">
                                    Call Recording
                                  </h4>
                                  <audio
                                    controls
                                    className="w-full"
                                    src={record.recordingUrl}
                                  >
                                    Your browser does not support audio playback.
                                  </audio>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Transcript */}
                          {record.transcript && (
                            <div className="mt-4">
                              <h4 className="font-medium text-gray-900 mb-2">
                                Call Transcript
                              </h4>
                              <div className="bg-white rounded-lg border border-gray-200 p-4 max-h-60 overflow-y-auto">
                                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                                  {record.transcript}
                                </pre>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
