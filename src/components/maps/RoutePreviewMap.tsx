"use client";

import { useState, useCallback, useEffect } from "react";
import {
  GoogleMap,
  DirectionsRenderer,
  Marker,
} from "@react-google-maps/api";
import { LocationResult } from "./LocationAutocomplete";

interface RoutePreviewMapProps {
  origin: LocationResult;
  destination: LocationResult;
  onRouteCalculated?: (distance: string, duration: string) => void;
  height?: string;
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
  borderRadius: "12px",
};

const defaultCenter = {
  lat: 28.6139, // Delhi
  lng: 77.209,
};

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  styles: [
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }],
    },
  ],
};

export function RoutePreviewMap({
  origin,
  destination,
  onRouteCalculated,
  height = "300px",
}: RoutePreviewMapProps) {
  const [directions, setDirections] =
    useState<google.maps.DirectionsResult | null>(null);
  const [distance, setDistance] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Calculate route when origin or destination changes
  useEffect(() => {
    if (!origin || !destination) {
      setDirections(null);
      setDistance("");
      setDuration("");
      return;
    }

    const directionsService = new google.maps.DirectionsService();

    directionsService.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
          setError("");

          // Extract distance and duration
          const leg = result.routes[0]?.legs[0];
          if (leg) {
            const dist = leg.distance?.text || "";
            const dur = leg.duration?.text || "";
            setDistance(dist);
            setDuration(dur);
            onRouteCalculated?.(dist, dur);
          }
        } else {
          setError("Could not calculate route");
          console.error("Directions request failed:", status);
        }
      }
    );
  }, [origin, destination, onRouteCalculated]);

  const onLoad = useCallback((map: google.maps.Map) => {
    // Fit bounds to show both markers if no directions yet
    if (origin && destination && !directions) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: origin.lat, lng: origin.lng });
      bounds.extend({ lat: destination.lat, lng: destination.lng });
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }
  }, [origin, destination, directions]);

  // Calculate center
  const center = origin
    ? { lat: origin.lat, lng: origin.lng }
    : defaultCenter;

  return (
    <div className="rounded-xl overflow-hidden shadow-lg border border-gray-200">
      {/* Map */}
      <div style={{ height }}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={10}
          options={mapOptions}
          onLoad={onLoad}
        >
          {/* Show directions if available */}
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: false,
                polylineOptions: {
                  strokeColor: "#4285F4",
                  strokeWeight: 5,
                  strokeOpacity: 0.8,
                },
              }}
            />
          )}

          {/* Show markers if no directions */}
          {!directions && origin && (
            <Marker
              position={{ lat: origin.lat, lng: origin.lng }}
              label={{ text: "A", color: "white" }}
            />
          )}
          {!directions && destination && (
            <Marker
              position={{ lat: destination.lat, lng: destination.lng }}
              label={{ text: "B", color: "white" }}
            />
          )}
        </GoogleMap>
      </div>

      {/* Route Info Panel */}
      {(distance || duration || error) && (
        <div className="bg-white px-4 py-3 border-t border-gray-200">
          {error ? (
            <div className="text-red-600 text-sm">{error}</div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Origin */}
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-gray-600 truncate max-w-[120px]">
                    {origin.address.split(",")[0]}
                  </span>
                </div>

                {/* Arrow */}
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>

                {/* Destination */}
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-600 truncate max-w-[120px]">
                    {destination.address.split(",")[0]}
                  </span>
                </div>
              </div>

              {/* Distance & Duration */}
              <div className="flex items-center gap-4 text-sm font-medium">
                <div className="flex items-center gap-1 text-gray-700">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span>{distance}</span>
                </div>
                <div className="flex items-center gap-1 text-blue-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{duration}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
