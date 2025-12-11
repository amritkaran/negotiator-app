"use client";

import { useRef, useCallback } from "react";
import { Autocomplete } from "@react-google-maps/api";

export interface LocationResult {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
}

interface LocationAutocompleteProps {
  placeholder?: string;
  value?: string;
  onChange: (location: LocationResult | null) => void;
  onInputChange?: (value: string) => void;
  icon?: "pickup" | "drop";
  className?: string;
  disabled?: boolean;
}

export function LocationAutocomplete({
  placeholder = "Enter location",
  value,
  onChange,
  onInputChange,
  icon = "pickup",
  className = "",
  disabled = false,
}: LocationAutocompleteProps) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onLoad = useCallback((autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete;

    // Bias results towards India
    autocomplete.setComponentRestrictions({ country: "in" });

    // Set fields to retrieve
    autocomplete.setFields([
      "formatted_address",
      "geometry",
      "place_id",
      "name",
    ]);
  }, []);

  const onPlaceChanged = useCallback(() => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();

      if (place.geometry?.location) {
        const location: LocationResult = {
          address: place.formatted_address || place.name || "",
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          placeId: place.place_id,
        };
        onChange(location);
      }
    }
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onInputChange?.(e.target.value);
    // Clear the location if input is manually cleared
    if (!e.target.value) {
      onChange(null);
    }
  };

  const iconColor = icon === "pickup" ? "text-green-600" : "text-red-600";
  const iconBg = icon === "pickup" ? "bg-green-50" : "bg-red-50";

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center">
        <div className={`flex items-center justify-center w-10 h-10 rounded-l-lg ${iconBg}`}>
          <svg
            className={`w-5 h-5 ${iconColor}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
        <Autocomplete
          onLoad={onLoad}
          onPlaceChanged={onPlaceChanged}
          className="flex-1"
        >
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            defaultValue={value}
            onChange={handleInputChange}
            disabled={disabled}
            className={`
              w-full px-4 py-3 border border-l-0 border-gray-300 rounded-r-lg
              focus:ring-2 focus:ring-blue-500 focus:border-transparent
              disabled:bg-gray-100 disabled:cursor-not-allowed
              text-gray-900 placeholder-gray-500
            `}
          />
        </Autocomplete>
      </div>
    </div>
  );
}
