"use client";

import { ReactNode } from "react";
import { LoadScript } from "@react-google-maps/api";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

// Libraries to load with Google Maps
const libraries: ("places" | "geometry" | "drawing")[] = ["places"];

interface GoogleMapsProviderProps {
  children: ReactNode;
}

export function GoogleMapsProvider({ children }: GoogleMapsProviderProps) {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not found. Map features will be disabled.");
    return <>{children}</>;
  }

  return (
    <LoadScript
      googleMapsApiKey={GOOGLE_MAPS_API_KEY}
      libraries={libraries}
      loadingElement={
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading maps...</span>
        </div>
      }
    >
      {children}
    </LoadScript>
  );
}
