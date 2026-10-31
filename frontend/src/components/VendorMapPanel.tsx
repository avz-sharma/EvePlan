import React, { useEffect, useRef, useState } from "react";
import type { VendorSearchResult } from "../api/types";

type MapHandle = { setCenter: (position: { lat: number; lng: number }) => void };
type MarkerHandle = { setMap: (map: MapHandle | null) => void };
type MapCoordinate = { lat: () => number; lng: () => number };
type MapBounds = { getCenter: () => MapCoordinate; getNorthEast: () => MapCoordinate };
type IdleListener = { remove: () => void };
type Viewport = { lat: number; lng: number; radius_m: number };
type MapHandleWithViewport = MapHandle & {
  getBounds: () => MapBounds | null;
  addListener: (event: "idle", callback: () => void) => IdleListener;
};
type MapsLibrary = {
  Map: new (container: HTMLElement, options: { center: { lat: number; lng: number }; zoom: number }) => MapHandleWithViewport;
  Marker: new (options: { map: MapHandle; position: { lat: number; lng: number }; title: string }) => MarkerHandle;
};
type GoogleMapsWindow = { google?: { maps?: { importLibrary: (name: string) => Promise<unknown> } } };
let loaderPromise: Promise<void> | null = null;

async function loadGoogleMaps(key: string): Promise<void> {
  const browser = window as unknown as GoogleMapsWindow;
  if (browser.google?.maps?.importLibrary) return;
  if (!loaderPromise) loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps could not load."));
    document.head.append(script);
  });
  await loaderPromise;
  if (!browser.google?.maps?.importLibrary) throw new Error("Google Maps importLibrary is unavailable.");
}

interface Props {
  results: VendorSearchResult[];
  enabled: boolean;
  centerOnResults: boolean;
  onUnavailable: () => void;
  onReady: () => void;
  onViewportChange: (viewport: Viewport) => void;
}

const distanceMeters = (from: MapCoordinate, to: MapCoordinate) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(from.lat());
  const lat2 = radians(to.lat());
  const latDistance = lat2 - lat1;
  const lngDistance = radians(to.lng() - from.lng());
  const haversine = Math.sin(latDistance / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDistance / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const VendorMapPanel: React.FC<Props> = ({ results, enabled, centerOnResults, onUnavailable, onReady, onViewportChange }) => {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapHandle | null>(null);
  const markers = useRef<MarkerHandle[]>([]);
  const idleListener = useRef<IdleListener | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const browserKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;

  useEffect(() => {
    if (!enabled || !browserKey || !host.current) return;
    let cancelled = false;
    void loadGoogleMaps(browserKey).then(async () => {
      const browser = window as unknown as GoogleMapsWindow;
      const library = await browser.google?.maps?.importLibrary("maps") as MapsLibrary | undefined;
      if (!library || !host.current || cancelled) throw new Error("Google Maps library could not be loaded.");
      map.current = new library.Map(host.current, { center: { lat: 20.5937, lng: 78.9629 }, zoom: 5 });
      const mapWithViewport = map.current as MapHandleWithViewport;
      idleListener.current = mapWithViewport.addListener("idle", () => {
        const bounds = mapWithViewport.getBounds();
        if (!bounds) return;
        const center = bounds.getCenter();
        const radius = distanceMeters(center, bounds.getNorthEast());
        onViewportChange({
          lat: center.lat(),
          lng: center.lng(),
          radius_m: Math.max(100, Math.min(50_000, Math.round(radius))),
        });
      });
      setReady(true);
      onReady();
    }).catch(() => {
      if (!cancelled) { setError("The Google map could not be loaded. Use the Maps search link instead."); onUnavailable(); }
    });
    return () => {
      cancelled = true;
      idleListener.current?.remove(); idleListener.current = null;
      markers.current.forEach((marker) => marker.setMap(null)); markers.current = [];
    };
  }, [browserKey, enabled, onReady, onUnavailable, onViewportChange]);

  useEffect(() => {
    let cancelled = false;
    if (!ready || !map.current) return;
    markers.current.forEach((marker) => marker.setMap(null)); markers.current = [];
    void (async () => {
      const browser = window as unknown as GoogleMapsWindow;
      const library = await browser.google?.maps?.importLibrary("maps") as MapsLibrary | undefined;
      if (!library || !map.current || cancelled) return;
      const visible = results.filter((result) => result.location.lat !== null && result.location.lng !== null);
      markers.current = visible.map((result) => new library.Marker({
        map: map.current as MapHandle,
        position: { lat: result.location.lat as number, lng: result.location.lng as number },
        title: result.display_name,
      }));
      if (centerOnResults && visible[0]?.location.lat !== null && visible[0]?.location.lng !== null) {
        map.current.setCenter({ lat: visible[0].location.lat as number, lng: visible[0].location.lng as number });
      }
    })();
    return () => { cancelled = true; };
  }, [centerOnResults, ready, results]);

  if (!enabled || !browserKey) return <div className="flex min-h-72 items-center justify-center rounded-2xl border border-line bg-white/55 p-5 text-center text-sm text-muted">Google Maps is not configured. Use the map search link or enter a vendor manually.</div>;
  return <div className="relative min-h-72 overflow-hidden rounded-2xl border border-line/80 bg-white/65 lg:sticky lg:top-40 lg:h-[65vh]">
    <div ref={host} className="absolute inset-0" aria-label="Google map with vendor results" />
    {!ready && !error && <p className="absolute inset-0 grid place-items-center bg-white/75 text-sm text-muted">Loading Google map…</p>}
    {error && <p role="alert" className="absolute inset-x-3 bottom-3 rounded-xl bg-white/95 p-3 text-sm text-danger">{error}</p>}
  </div>;
};
