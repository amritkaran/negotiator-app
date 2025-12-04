"use client";

import { Business } from "@/types";

interface Props {
  business: Business;
  index: number;
  callStatus?: {
    status: string;
    quote?: { price: number | null; notes: string } | null;
  };
}

// Format business type for display
function formatType(type: string): string {
  return type
    .replace(/_/g, " ")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function BusinessCard({ business, index, callStatus }: Props) {
  const status = callStatus?.status || "pending";

  // Get primary business type (filter out generic ones)
  const primaryType = business.types?.find(t =>
    !["point_of_interest", "establishment"].includes(t)
  ) || business.types?.[0];

  // Generate initials for placeholder
  const initials = business.name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="bg-white hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-200 last:border-b-0">
      <div className="flex p-3 gap-3">
        {/* Left: Image placeholder - Google Maps style square thumbnail */}
        <div className="flex-shrink-0 relative">
          <div className="w-[70px] h-[70px] bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
            {/* Placeholder with business initials */}
            <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
              <span className="text-gray-500 font-semibold text-lg">{initials}</span>
            </div>
          </div>
          {/* Index badge overlay - like Google Maps marker */}
          <div className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow-sm border-2 border-white">
            <span className="text-white text-xs font-bold">{index + 1}</span>
          </div>
        </div>

        {/* Right: Business details */}
        <div className="flex-1 min-w-0">
          {/* Business name */}
          <h3 className="font-normal text-[14px] text-[#1a0dab] leading-tight truncate hover:underline">
            {business.name}
          </h3>

          {/* Rating row - exact Google Maps style */}
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[13px] text-[#70757a]">
              {business.rating.toFixed(1)}
            </span>
            <div className="flex items-center">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className="w-3 h-3"
                  viewBox="0 0 24 24"
                  fill={star <= Math.round(business.rating) ? "#fbbc04" : "#dadce0"}
                >
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              ))}
            </div>
            <span className="text-[13px] text-[#70757a]">({business.reviewCount})</span>
          </div>

          {/* Type and distance - Google Maps style */}
          <div className="flex items-center gap-0 mt-0.5 text-[13px] text-[#70757a]">
            {primaryType && (
              <>
                <span>{formatType(primaryType)}</span>
                <span className="mx-1">·</span>
              </>
            )}
            <span>{business.distance} km</span>
          </div>

          {/* Address - Google Maps style */}
          <p className="text-[13px] text-[#70757a] mt-0.5 truncate">
            {business.address}
          </p>

          {/* Status indicator - subtle */}
          {status !== "pending" && (
            <div className={`inline-flex items-center gap-1 mt-1 text-xs font-medium ${
              status === "calling" ? "text-blue-600" :
              status === "completed" ? "text-green-600" :
              status === "failed" ? "text-red-600" :
              "text-orange-600"
            }`}>
              {status === "calling" && <span className="animate-pulse">●</span>}
              {status === "completed" && <span>✓</span>}
              {status === "failed" && <span>✗</span>}
              {status === "no-answer" && <span>!</span>}
              <span>
                {status === "calling" ? "Calling..." :
                 status === "completed" ? "Completed" :
                 status === "failed" ? "Failed" :
                 "No Answer"}
              </span>
            </div>
          )}
        </div>

        {/* Right side: Action buttons - Google Maps icon style */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          {/* Directions button */}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(business.address)}&destination_place_id=${business.placeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            title="Directions"
          >
            <svg className="w-5 h-5 text-[#1a73e8]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.43 10.59l-9.01-9.01c-.75-.75-2.07-.76-2.83 0l-9 9c-.78.78-.78 2.04 0 2.82l9 9.01c.39.39.9.58 1.41.58.51 0 1.02-.19 1.41-.58l9.01-9.01c.79-.78.79-2.04.01-2.81zM12.85 19L5 11.15l1.41-1.41 5.44 5.44V7h2v8.18l5.44-5.44L20.7 11.15 12.85 19z"/>
            </svg>
          </a>

          {/* Call button */}
          <a
            href={`tel:${business.phone}`}
            className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            title={`Call ${business.phone}`}
          >
            <svg className="w-5 h-5 text-[#1a73e8]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
            </svg>
          </a>
        </div>
      </div>

      {/* Quote result section - appears after call */}
      {callStatus?.quote && callStatus.quote.price && (
        <div className="mx-3 mb-3 px-3 py-2 bg-[#e6f4ea] rounded-lg border border-[#ceead6]">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#137333] font-medium">Quoted Price</span>
            <span className="text-[15px] font-semibold text-[#137333]">
              ₹{callStatus.quote.price.toLocaleString()}
            </span>
          </div>
          {callStatus.quote.notes && (
            <p className="text-[12px] text-[#5f6368] mt-1">{callStatus.quote.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
