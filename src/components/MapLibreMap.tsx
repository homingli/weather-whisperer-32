import { useEffect, useRef } from 'react';
import maplibregl, { type Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { RainfallFeatureCollection } from '@/lib/rainfallGeoJson';
import { cartoApiKey, cartoMapLibreRasterUrl, cartoStyleUrl } from '@/lib/carto';

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/**
 * Run `install` once the map's style is safe to add sources/layers to.
 *
 * MapLibre's `style.load` fires as soon as the style JSON is applied, but
 * `isStyleLoaded()` only turns true once the style's sources/tiles settle.
 * An effect that runs in that gap — overlay data arrived after
 * `style.load` fired but before the map finished loading — and waits on
 * `once('style.load')` is listening for an event that already passed, so
 * the install never runs and the overlay stays blank even though the
 * basemap renders. The map-level `load` event fires exactly once when the
 * map is fully loaded (`map.loaded()` first true) and therefore cannot be
 * missed while the map is still coming up; `style.load` is kept armed too
 * so a style swap (e.g. the raster error fallback) that happens while
 * waiting still installs as soon as the replacement style is ready.
 *
 * Returns a cleanup that cancels the pending listeners.
 */
function installWhenStyleReady(map: Map, install: () => void): () => void {
  if (map.isStyleLoaded()) {
    install();
    return () => {};
  }
  let cancelled = false;
  const onMapLoad = () => {
    if (!cancelled) install();
  };
  const onStyleLoad = () => {
    // style.load fires when the JSON applies; tiles may still be loading,
    // so defer to the map-level 'load' unless the style is fully settled.
    if (!cancelled && map.isStyleLoaded()) install();
  };
  map.once('load', onMapLoad);
  map.once('style.load', onStyleLoad);
  return () => {
    cancelled = true;
    map.off('load', onMapLoad);
    map.off('style.load', onStyleLoad);
  };
}

export interface MapLibreMapProps {
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
  interactive?: boolean;
  dark: boolean;
  ariaLabel: string;
  marker?: [number, number];
  rainfall?: RainfallFeatureCollection;
  wms?: { url: string; layer: string; style: string; time: string; opacity: number; nonce: number };
  onMap?: (map: Map | null) => void;
  onOverlayLoading?: () => void;
  onOverlayLoaded?: () => void;
  onOverlayError?: () => void;
}

export function MapLibreMap({ center, zoom, minZoom, maxZoom, dark, ariaLabel, interactive = true, marker, rainfall, wms, onMap, onOverlayLoading, onOverlayLoaded, onOverlayError }: MapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const fallbackRef = useRef(false);
  const wmsErrorHandlerRef = useRef<((event: { sourceId?: string }) => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    fallbackRef.current = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: cartoStyleUrl(dark ? 'dark-matter' : 'positron'),
      center,
      zoom,
      minZoom,
      maxZoom,
      attributionControl: { compact: true },
      transformRequest: (url) => {
        if (!cartoApiKey || !url.includes('cartocdn.com') || url.includes('key=')) return { url };
        return { url: `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(cartoApiKey)}` };
      },
    });
    mapRef.current = map;
    onMap?.(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    const canvas = map.getCanvas();
    const handleContextLost = (event: Event) => event.preventDefault();
    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    let styleLoaded = false;
    map.once('style.load', () => { styleLoaded = true; });
    map.on('error', () => {
      if (styleLoaded || fallbackRef.current) return;
      fallbackRef.current = true;
      map.setStyle({
        version: 8,
        sources: { carto: { type: 'raster', tiles: [cartoMapLibreRasterUrl(dark ? 'dark_all' : 'light_all')], tileSize: 256, attribution: ATTRIBUTION } },
        layers: [{ id: 'carto-raster', type: 'raster', source: 'carto' }],
      });
    });
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      map.remove();
      mapRef.current = null;
      onMap?.(null);
    };
    // Map recreated only when theme changes; dynamic layers are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handlers = [map.dragPan, map.scrollZoom, map.doubleClickZoom, map.boxZoom, map.keyboard];
    for (const handler of handlers) {
      if (interactive) handler.enable();
      else handler.disable();
    }
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !marker) return;
    markerRef.current?.remove();
    markerRef.current = new maplibregl.Marker({ color: '#2563eb' }).setLngLat(marker).addTo(map);
  }, [marker]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rainfall) return;
    const install = () => {
      if (map.getSource('hko-rainfall')) (map.getSource('hko-rainfall') as maplibregl.GeoJSONSource).setData(rainfall as never);
      else {
        map.addSource('hko-rainfall', { type: 'geojson', data: rainfall as never });
        map.addLayer({ id: 'hko-rainfall', type: 'fill', source: 'hko-rainfall', paint: { 'fill-color': ['case', ['<=', ['get', 'value'], 0.5], '#a0c4ff', ['<=', ['get', 'value'], 2], '#4facfe', ['<=', ['get', 'value'], 5], '#00f2fe', ['<=', ['get', 'value'], 10], '#43e97b', ['<=', ['get', 'value'], 20], '#f6d365', ['<=', ['get', 'value'], 30], '#ff0844', '#9d0b0b'], 'fill-opacity': ['case', ['>', ['get', 'value'], 0], 0.5, 0] } });
      }
    };
    return installWhenStyleReady(map, install);
  }, [rainfall, dark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !wms) return;
    if (wmsErrorHandlerRef.current) {
      map.off('error', wmsErrorHandlerRef.current);
      wmsErrorHandlerRef.current = null;
    }
    const install = () => {
      const url = `${wms.url}?service=WMS&request=GetMap&version=1.1.1&format=image/png&transparent=true&width=256&height=256&srs=EPSG:3857&layers=${encodeURIComponent(wms.layer)}&styles=${encodeURIComponent(wms.style)}&time=${encodeURIComponent(wms.time)}&bbox={bbox-epsg-3857}`;
      onOverlayLoading?.();
      if (map.getLayer('msc-wms')) map.removeLayer('msc-wms');
      if (map.getSource('msc-wms')) map.removeSource('msc-wms');
      map.addSource('msc-wms', { type: 'raster', tiles: [url], tileSize: 256 });
      map.addLayer({ id: 'msc-wms', type: 'raster', source: 'msc-wms', paint: { 'raster-opacity': wms.opacity } });
      const sourceError = (event: { sourceId?: string }) => {
        if (event.sourceId === 'msc-wms') onOverlayError?.();
      };
      wmsErrorHandlerRef.current = sourceError;
      map.on('error', sourceError);
      const done = () => { onOverlayLoaded?.(); map.off('idle', done); };
      map.once('idle', done);
    };
    const cancelWait = installWhenStyleReady(map, install);
    return () => {
      cancelWait();
      if (wmsErrorHandlerRef.current) {
        map.off('error', wmsErrorHandlerRef.current);
        wmsErrorHandlerRef.current = null;
      }
    };
  }, [wms, dark, onOverlayLoading, onOverlayLoaded, onOverlayError]);

  return <div ref={containerRef} role="application" aria-label={ariaLabel} className="w-full h-full" />;
}
