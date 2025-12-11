"use client";

import { useState, useCallback } from "react";
import { LocationAutocomplete, RoutePreviewMap, LocationResult } from "./maps";
import { UserRequirement } from "@/types";

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

  // Form state
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [passengers, setPassengers] = useState<string>("1");
  const [tripType, setTripType] = useState<"one-way" | "round-trip">("one-way");
  const [vehicleType, setVehicleType] = useState<string>("");
  const [tollPreference, setTollPreference] = useState<"ok" | "avoid" | "no-preference">("ok");

  const handleRouteCalculated = useCallback((dist: string, dur: string) => {
    setDistance(dist);
    setDuration(dur);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!pickup || !drop || !date || !time) {
      return;
    }

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
    };

    onSubmit(requirements);
  };

  const isFormValid = pickup && drop && date && time;

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

      {/* Date & Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={today}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Time
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
      </div>

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
            <span className="text-gray-700">One Way</span>
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
            <span className="text-gray-700">Round Trip</span>
          </label>
        </div>
      </div>

      {/* Passengers & Vehicle */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Passengers
          </label>
          <select
            value={passengers}
            onChange={(e) => setPassengers(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "Passenger" : "Passengers"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Vehicle Type
          </label>
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Any</option>
            <option value="hatchback">Hatchback</option>
            <option value="sedan">Sedan</option>
            <option value="suv">SUV</option>
            <option value="innova">Innova</option>
            <option value="tempo">Tempo Traveller</option>
          </select>
        </div>
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
            <span className="text-gray-700">OK to use</span>
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
            <span className="text-gray-700">Avoid</span>
          </label>
        </div>
      </div>

      {/* Summary */}
      {isFormValid && distance && (
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h3 className="font-medium text-blue-900 mb-2">Trip Summary</h3>
          <div className="text-sm text-blue-800 space-y-1">
            <p><strong>From:</strong> {pickup.address}</p>
            <p><strong>To:</strong> {drop.address}</p>
            <p><strong>Distance:</strong> {distance} | <strong>Est. Time:</strong> {duration}</p>
            <p><strong>Date:</strong> {date} at {time}</p>
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
