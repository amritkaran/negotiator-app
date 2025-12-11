"use client";

import { useState, useCallback, useEffect } from "react";
import { LocationAutocomplete, RoutePreviewMap, LocationResult } from "./maps";
import { UserRequirement } from "@/types";

interface PriceEstimate {
  distanceKm: number;
  durationMinutes: number;
  priceRange: {
    low: number;
    mid: number;
    high: number;
  };
  rationale: string[];
  confidence: "high" | "medium" | "low";
  disclaimer: string;
}

interface BookingFormProps {
  onSubmit: (requirements: UserRequirement) => void;
  isLoading?: boolean;
}

export function BookingForm({ onSubmit, isLoading = false }: BookingFormProps) {
  // Location state
  const [pickup, setPickup] = useState<LocationResult | null>(null);
  const [drop, setDrop] = useState<LocationResult | null>(null);

  // Route info
  const [distance, setDistance] = useState<string>("");
  const [duration, setDuration] = useState<string>("");

  // Form state - no pre-selected values
  const [date, setDate] = useState<string>("");
  const [hour, setHour] = useState<string>("");
  const [minute, setMinute] = useState<string>("");
  const [ampm, setAmpm] = useState<string>("");
  const [passengers, setPassengers] = useState<string>("");
  const [tripType, setTripType] = useState<"one-way" | "round-trip" | "">("");
  const [vehicleType, setVehicleType] = useState<string>("");
  const [tollPreference, setTollPreference] = useState<"ok" | "avoid" | "">("");

  // Return journey details (for round trip)
  const [returnDate, setReturnDate] = useState<string>("");
  const [returnHour, setReturnHour] = useState<string>("");
  const [returnMinute, setReturnMinute] = useState<string>("");
  const [returnAmpm, setReturnAmpm] = useState<string>("");

  // Additional details for vendor conversation
  const [pickupPoint, setPickupPoint] = useState<string>("");
  const [dropPoint, setDropPoint] = useState<string>("");
  const [specialInstructions, setSpecialInstructions] = useState<string>("");

  // Price estimate state
  const [priceEstimate, setPriceEstimate] = useState<PriceEstimate | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceExpanded, setPriceExpanded] = useState(false);

  const handleRouteCalculated = useCallback((dist: string, dur: string) => {
    setDistance(dist);
    setDuration(dur);
  }, []);

  // Check if all required fields before price estimate are filled
  const allFieldsBeforePriceReady = pickup && drop && vehicleType && tripType && tollPreference;

  // Fetch price estimate when all required fields are set (locations, vehicle type, trip type, toll preference)
  useEffect(() => {
    const fetchPriceEstimate = async () => {
      // Only fetch when all fields before price section are filled
      if (!pickup || !drop || !vehicleType || !tripType || !tollPreference) {
        setPriceEstimate(null);
        return;
      }

      setPriceLoading(true);
      setPriceError(null);

      try {
        // Parse distance from the distance string (e.g., "285 km" -> 285)
        const distanceMatch = distance.match(/[\d.]+/);
        const distanceKm = distanceMatch ? parseFloat(distanceMatch[0]) : undefined;

        // Parse duration from duration string (e.g., "4 hours 30 mins" -> 270)
        let durationMinutes: number | undefined;
        if (duration) {
          const hoursMatch = duration.match(/(\d+)\s*h/i);
          const minsMatch = duration.match(/(\d+)\s*m/i);
          const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
          const mins = minsMatch ? parseInt(minsMatch[1]) : 0;
          durationMinutes = hours * 60 + mins;
        }

        const response = await fetch("/api/price-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: pickup.address,
            to: drop.address,
            fromLat: pickup.lat,
            fromLng: pickup.lng,
            toLat: drop.lat,
            toLng: drop.lng,
            vehicleType,
            tripType,
            distanceKm,
            durationMinutes,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to get price estimate");
        }

        const data: PriceEstimate = await response.json();
        setPriceEstimate(data);
      } catch (err) {
        console.error("Price estimate error:", err);
        setPriceError("Could not estimate price");
      } finally {
        setPriceLoading(false);
      }
    };

    // Debounce the API call
    const timeoutId = setTimeout(fetchPriceEstimate, 500);
    return () => clearTimeout(timeoutId);
  }, [pickup, drop, vehicleType, tripType, tollPreference, distance, duration]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!pickup || !drop || !date) {
      return;
    }

    // Convert 12-hour to 24-hour format for storage
    let hour24 = parseInt(hour, 10);
    if (ampm === "PM" && hour24 !== 12) {
      hour24 += 12;
    } else if (ampm === "AM" && hour24 === 12) {
      hour24 = 0;
    }
    const time = `${hour24.toString().padStart(2, "0")}:${minute}`;

    const requirements: UserRequirement = {
      service: "cab",
      from: pickup.address,
      to: drop.address,
      date,
      time,
      passengers: parseInt(passengers, 10),
      tripType,
      vehicleType: vehicleType || undefined,
      tollPreference,
      userLocation: {
        lat: pickup.lat,
        lng: pickup.lng,
      },
      isComplete: true,
      missingFields: [],
      // Additional details for vendor conversation
      serviceFields: {
        pickupPoint: pickupPoint || undefined,
        dropPoint: dropPoint || undefined,
        specialInstructions: specialInstructions || undefined,
      },
      specialInstructions: specialInstructions || undefined,
    };

    onSubmit(requirements);
  };

  const isFormValid = pickup && drop && date && hour && minute && ampm && passengers && tripType && vehicleType && tollPreference;

  // Get today's date in YYYY-MM-DD format for min date
  const today = new Date().toISOString().split("T")[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Location Inputs */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Pickup Location
        </label>
        <LocationAutocomplete
          placeholder="Enter pickup location"
          icon="pickup"
          onChange={setPickup}
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Drop Location
        </label>
        <LocationAutocomplete
          placeholder="Enter drop location"
          icon="drop"
          onChange={setDrop}
        />
      </div>

      {/* Route Preview Map */}
      {pickup && drop && (
        <div className="mt-4">
          <RoutePreviewMap
            origin={pickup}
            destination={drop}
            onRouteCalculated={handleRouteCalculated}
            height="250px"
          />
        </div>
      )}

      {/* Trip Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Trip Type
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="tripType"
              value="one-way"
              checked={tripType === "one-way"}
              onChange={() => setTripType("one-way")}
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-gray-900">One Way</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="tripType"
              value="round-trip"
              checked={tripType === "round-trip"}
              onChange={() => setTripType("round-trip")}
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-gray-900">Round Trip</span>
          </label>
        </div>
      </div>

      {/* Vehicle Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Vehicle Type
        </label>
        <select
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
        >
          <option value="">Select</option>
          <option value="hatchback">Hatchback</option>
          <option value="sedan">Sedan</option>
          <option value="suv">SUV</option>
          <option value="innova">Innova</option>
          <option value="tempo">Tempo Traveller</option>
        </select>
      </div>

      {/* Toll Preference */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Toll Roads
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="toll"
              value="ok"
              checked={tollPreference === "ok"}
              onChange={() => setTollPreference("ok")}
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-gray-900">OK to use</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="toll"
              value="avoid"
              checked={tollPreference === "avoid"}
              onChange={() => setTollPreference("avoid")}
              className="w-4 h-4 text-blue-600"
            />
            <span className="text-gray-900">Avoid</span>
          </label>
        </div>
      </div>

      {/* Price Estimate Panel - Only shows after all fields before price section are filled */}
      {allFieldsBeforePriceReady && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 overflow-hidden shadow-sm">
          {/* Main Price Display - Always Visible */}
          <div
            className="p-4 cursor-pointer hover:bg-green-50/50 transition-colors"
            onClick={() => !priceLoading && priceEstimate && setPriceExpanded(!priceExpanded)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl">💰</span>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Expected Price</div>
                  {priceLoading ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                      <span className="text-sm">Calculating...</span>
                    </div>
                  ) : priceError ? (
                    <div className="text-red-600 text-sm">{priceError}</div>
                  ) : priceEstimate ? (
                    <div className="text-2xl font-bold text-green-800">
                      ₹{priceEstimate.priceRange.mid.toLocaleString()}
                    </div>
                  ) : null}
                </div>
              </div>

              {priceEstimate && (
                <div className="flex items-center gap-3">
                  <div className={`
                    px-2 py-1 rounded-full text-xs font-medium
                    ${priceEstimate.confidence === "high"
                      ? "bg-green-100 text-green-700"
                      : priceEstimate.confidence === "medium"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-600"
                    }
                  `}>
                    {priceEstimate.confidence === "high" ? "High" : priceEstimate.confidence === "medium" ? "Medium" : "Low"} confidence
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${priceExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              )}
            </div>

            {/* Price Range Summary - Always visible */}
            {priceEstimate && (
              <div className="mt-2 text-sm text-gray-600">
                Range: ₹{priceEstimate.priceRange.low.toLocaleString()} - ₹{priceEstimate.priceRange.high.toLocaleString()}
                <span className="mx-2">•</span>
                {priceEstimate.distanceKm} km
                <span className="mx-2">•</span>
                {Math.floor(priceEstimate.durationMinutes / 60)}h {priceEstimate.durationMinutes % 60}m travel
              </div>
            )}
          </div>

          {/* Expandable Details */}
          {priceEstimate && priceExpanded && (
            <div className="border-t border-green-200 p-4 bg-white/50">
              {/* Price Factors */}
              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Price Breakdown</div>
                <ul className="text-sm text-gray-700 space-y-1">
                  {priceEstimate.rationale.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Disclaimer */}
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="flex items-start gap-2">
                  <span className="text-amber-500">⚠️</span>
                  <p className="text-xs text-amber-800">{priceEstimate.disclaimer}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Date, Time, and Passengers - Only show after price estimate is loaded */}
      {priceEstimate && (
        <>
          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {tripType === "round-trip" ? "Departure Date" : "Date"}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={today}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {tripType === "round-trip" ? "Departure Time" : "Time"}
              </label>
              <div className="flex gap-2">
                <select
                  value={hour}
                  onChange={(e) => setHour(e.target.value)}
                  className="flex-1 px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                >
                  <option value="">HH</option>
                  {["12", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"].map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span className="flex items-center text-gray-500">:</span>
                <select
                  value={minute}
                  onChange={(e) => setMinute(e.target.value)}
                  className="flex-1 px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                >
                  <option value="">MM</option>
                  {["00", "15", "30", "45"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select
                  value={ampm}
                  onChange={(e) => setAmpm(e.target.value)}
                  className="px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 font-medium"
                >
                  <option value="">--</option>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>

          {/* Return Date & Time - Only for Round Trip */}
          {tripType === "round-trip" && (
            <div className="grid grid-cols-2 gap-4 bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-2">
                  Return Date
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  min={date || today}
                  className="w-full px-4 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-2">
                  Return Time
                </label>
                <div className="flex gap-2">
                  <select
                    value={returnHour}
                    onChange={(e) => setReturnHour(e.target.value)}
                    className="flex-1 px-3 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                  >
                    <option value="">HH</option>
                    {["12", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"].map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="flex items-center text-blue-500">:</span>
                  <select
                    value={returnMinute}
                    onChange={(e) => setReturnMinute(e.target.value)}
                    className="flex-1 px-3 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                  >
                    <option value="">MM</option>
                    {["00", "15", "30", "45"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={returnAmpm}
                    onChange={(e) => setReturnAmpm(e.target.value)}
                    className="px-3 py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 font-medium"
                  >
                    <option value="">--</option>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Passengers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Passengers
            </label>
            <select
              value={passengers}
              onChange={(e) => setPassengers(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
            >
              <option value="">Select</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "Passenger" : "Passengers"}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Additional Details for Vendor - Only show after price estimate is loaded */}
      {priceEstimate && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Additional Details for Vendor</h3>

          {/* Pickup Point */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pickup Point (e.g., Gate number, landmark)
            </label>
            <input
              type="text"
              value={pickupPoint}
              onChange={(e) => setPickupPoint(e.target.value)}
              placeholder="e.g., Main gate, Near temple, Building A entrance"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Drop Point */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Drop Point (e.g., Terminal, specific location)
            </label>
            <input
              type="text"
              value={dropPoint}
              onChange={(e) => setDropPoint(e.target.value)}
              placeholder="e.g., Terminal 1, Building entrance, Gate 3"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Special Instructions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Special Instructions for Vendor
            </label>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="e.g., Extra luggage, need child seat, early morning pickup call required"
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400 resize-none"
            />
          </div>
        </div>
      )}

      {/* Summary */}
      {isFormValid && distance && (
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h3 className="font-medium text-blue-900 mb-2">Trip Summary</h3>
          <div className="text-sm text-blue-800 space-y-1">
            <p><strong>From:</strong> {pickup.address}</p>
            <p><strong>To:</strong> {drop.address}</p>
            <p><strong>Distance:</strong> {distance} | <strong>Est. Time:</strong> {duration}</p>
            <p><strong>Date:</strong> {date} at {hour}:{minute} {ampm}</p>
            {tripType === "round-trip" && returnDate && (
              <p><strong>Return:</strong> {returnDate} at {returnHour}:{returnMinute} {returnAmpm}</p>
            )}
            <p><strong>Type:</strong> {tripType === "round-trip" ? "Round Trip" : "One Way"}</p>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!isFormValid || isLoading}
        className={`
          w-full py-4 px-6 rounded-lg font-medium text-white
          flex items-center justify-center gap-2
          transition-all duration-200
          ${
            isFormValid && !isLoading
              ? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
              : "bg-gray-400 cursor-not-allowed"
          }
        `}
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            <span>Searching...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Find Providers</span>
          </>
        )}
      </button>
    </form>
  );
}
