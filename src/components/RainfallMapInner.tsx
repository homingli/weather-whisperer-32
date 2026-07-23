import { useState, useEffect, useRef, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, GeoJSON, Marker, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import { AlertCircle, RefreshCw, Play, Pause, Layers } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { PRD_BOUNDS } from '@/lib/hko-weather';
import { TIMING } from '@/lib/constants';
import { fetchWithTimeout } from '@/lib/fetch-utils';

const EMPTY_STEPS: StepData[] = [];

interface UserLocation {
  latitude: number;
  longitude: number;
}

const locationIcon = new L.Icon({
  iconUrl: '/icons/marker-icon-2x-blue.png',
  shadowUrl: '/icons/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

interface NowcastResult {
  timeSteps: StepData[];
  updateTime: string;
  lastModified: number;
  globalBounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

interface StepData {
  endTime: string;
  formattedTime: string;
  cellsByColor: Map<string, FeatureCollection>;
}

const RAINFALL_BANDS = [
  { max: 0.5, color: '#a0c4ff', label: '< 0.5' },
  { max: 2, color: '#4facfe', label: '0.5 - 2' },
  { max: 5, color: '#00f2fe', label: '2 - 5' },
  { max: 10, color: '#43e97b', label: '5 - 10' },
  { max: 20, color: '#f6d365', label: '10 - 20' },
  { max: 30, color: '#ff0844', label: '20 - 30' },
  { max: Infinity, color: '#9d0b0b', label: '> 30' },
] as const;

type Basemap = 'positron' | 'voyager' | 'osm';

const BASEMAPS: Record<Basemap, { url: string; label: string; attribution: string }> = {
  positron: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png',
    label: 'Positron',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  voyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    label: 'Voyager',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    label: 'OpenStreetMap',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
};

const BASEMAP_ORDER: Basemap[] = ['positron', 'voyager', 'osm'];

const nextBasemap = (current: Basemap): Basemap => {
  const idx = BASEMAP_ORDER.indexOf(current);
  return BASEMAP_ORDER[(idx + 1) % BASEMAP_ORDER.length];
};

const getRainfallColor = (value: number): string => {
  for (const band of RAINFALL_BANDS) {
    if (value <= band.max) return band.color;
  }
  return RAINFALL_BANDS[RAINFALL_BANDS.length - 1].color;
};

// weight: 0.5 + color matching fill fills the anti-aliasing gap between
// adjacent polygons. Alpha is baked into the RGBA color so fillOpacity stays at 1
// — using fillOpacity < 1 produces horizontal scan-line banding in Leaflet's SVG renderer.
const hexToRgba = (hex: string, alpha: number) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const FILL_ALPHA = 0.4;

// Per-color style cache. react-leaflet invokes style once per feature inside the
// canvas/SVG render loop, so we memoize by hex color to keep the returned object
// reference stable across features and re-renders.
const polygonStyleCache = new Map<string, ReturnType<typeof polygonStyle>>();
const polygonStyle = (color: string) => {
  const cached = polygonStyleCache.get(color);
  if (cached) return cached;
  const style = {
    fillColor: hexToRgba(color, FILL_ALPHA),
    fillOpacity: 1,
    color: hexToRgba(color, 1),
    weight: 0.5,
  };
  polygonStyleCache.set(color, style);
  return style;
};

const ColorGeoLayer = memo(({ color, data, stepIndex }: {
  color: string;
  data: FeatureCollection;
  stepIndex: number;
}) => (
  <GeoJSON
    key={`${stepIndex}-${color}`}
    data={data}
    style={polygonStyle(color)}
    renderer={L.canvas({ padding: 0.5 })}
  />
), (prev, next) =>
  prev.stepIndex === next.stepIndex && prev.color === next.color && prev.data === next.data
);

const parseRainfallCSV = (csvText: string): NowcastResult => {
  const lines = csvText.split('\n');
  let updateTime = '';
  let updateTimeFound = false;

  let globalMinLat = Infinity, globalMaxLat = -Infinity;
  let globalMinLon = Infinity, globalMaxLon = -Infinity;
  const temp: Record<string, Record<string, FeatureCollection>> = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;

    const value = parseFloat(parts[4]);
    if (value <= 0) continue;

    const lat = parseFloat(parts[2]);
    const lon = parseFloat(parts[3]);

    if (!updateTimeFound && parts[0] && parts[0].length >= 12) {
      updateTime = `${parts[0].substring(0, 4)}-${parts[0].substring(4, 6)}-${parts[0].substring(6, 8)} ${parts[0].substring(8, 10)}:${parts[0].substring(10, 12)}`;
      updateTimeFound = true;
    }

    if (lat < globalMinLat) globalMinLat = lat;
    if (lat > globalMaxLat) globalMaxLat = lat;
    if (lon < globalMinLon) globalMinLon = lon;
    if (lon > globalMaxLon) globalMaxLon = lon;

    const endTime = parts[1];
    if (!endTime) continue;

    const color = getRainfallColor(value);

    const feature: L.GeoJSON.IGeoJSONFeature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [lon - 0.0095, lat - 0.009],
          [lon + 0.0095, lat - 0.009],
          [lon + 0.0095, lat + 0.009],
          [lon - 0.0095, lat + 0.009],
          [lon - 0.0095, lat - 0.009],
        ]],
      },
      properties: null,
    };

    if (!temp[endTime]) temp[endTime] = {};
    if (!temp[endTime][color]) {
      temp[endTime][color] = { type: 'FeatureCollection', features: [] };
    }
    temp[endTime][color].features.push(feature);
  }

  const sortedEndTimes = Object.keys(temp).sort();
  const timeSteps: StepData[] = sortedEndTimes.map(endTime => {
    const byColor = temp[endTime];
    const cellsByColor = new Map<string, FeatureCollection>();
    for (const [color, fc] of Object.entries(byColor)) {
      cellsByColor.set(color, fc);
    }
    const formattedTime = endTime.length >= 12
      ? `${endTime.substring(8, 10)}:${endTime.substring(10, 12)}`
      : endTime;
    return { endTime, formattedTime, cellsByColor };
  });

  const latPad = (globalMaxLat - globalMinLat) * 0.02;
  const lonPad = (globalMaxLon - globalMinLon) * 0.02;

  return {
    timeSteps,
    updateTime,
    globalBounds: {
      minLat: globalMinLat - latPad,
      maxLat: globalMaxLat + latPad,
      minLon: globalMinLon - lonPad,
      maxLon: globalMaxLon + lonPad,
    },
  };
};

type ProgressCallback = (received: number, total: number) => void;

const fetchRainfallNowcast = async (onProgress?: ProgressCallback): Promise<NowcastResult> => {
  const response = await fetchWithTimeout('/hko-data/F3/Gridded_rainfall_nowcast.csv', {
    timeout: TIMING.NOWCAST_TIMEOUT_MS,
  });
  if (!response.ok) throw new Error('Failed to fetch gridded rainfall nowcast');

  // Parse last-modified header for adaptive refetch scheduling
  const lmHeader = response.headers.get('last-modified');
  const lastModified = lmHeader ? new Date(lmHeader).getTime() : Date.now();

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  // Stream with progress tracking when Content-Length and ReadableStream are available
  if (total > 0 && response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.(received, total);
    }

    // Yield to React so it can render the final progress state
    // before synchronous parsing blocks the main thread.
    await new Promise(resolve => setTimeout(resolve, 0));

    // Concatenate all chunks into one typed array
    const allChunks = new Uint8Array(received);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    return { ...parseRainfallCSV(new TextDecoder().decode(allChunks)), lastModified };
  }

  // Fallback: no Content-Length or ReadableStream (unlikely — HKO always sends it)
  const csvText = await response.text();
  return { ...parseRainfallCSV(csvText), lastModified };
};

export default function RainfallMapInner({ userLocation }: { userLocation?: UserLocation }) {
  const mapRef = useRef<L.Map | null>(null);
  const viewportInit = useRef(false);
  const prevUserLoc = useRef<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>('positron');

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['hkoGriddedRainfallNowcast'],
    queryFn: async () => {
      setDownloadProgress(0);
      return await fetchRainfallNowcast((received, total) => {
        setDownloadProgress(Math.round((received / total) * 100));
      });
    },
    staleTime: TIMING.STALE_TIME_MS,
    refetchInterval: (query) => {
      const lm = query.state.data?.lastModified;
      if (!lm) return TIMING.NOWCAST_REFETCH_INTERVAL_MS;
      // HKO generates every 30 min; add 5-min grace period so the first
      // post-grace poll is at 35 min, then floors to 5 min.
      const GRACE_MS = 5 * 60 * 1000;
      const timeUntilNext = lm + TIMING.NOWCAST_REFETCH_INTERVAL_MS - Date.now() + GRACE_MS;
      return Math.max(timeUntilNext, GRACE_MS);
    },
    retry: 0,
  });

  const timeSteps = data?.timeSteps || EMPTY_STEPS;
  const updateTime = data?.updateTime || '';
  const { t } = useLanguage();
  const dataBounds = data?.globalBounds ?? null;

  useEffect(() => {
    if (timeSteps.length > 0) setActiveStepIndex(0);
  }, [data]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && timeSteps.length > 0) {
      interval = setInterval(() => {
        setActiveStepIndex((prevIndex) => (prevIndex + 1) % timeSteps.length);
      }, TIMING.RAINFALL_AUTOPLAY_MS);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isPlaying, timeSteps]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const locKey = userLocation ? `${userLocation.latitude},${userLocation.longitude}` : null;
    const userChanged = locKey && locKey !== prevUserLoc.current;

    if (!viewportInit.current || userChanged) {
      if (userLocation) {
        map.setView([userLocation.latitude, userLocation.longitude], 12, { animate: true });
        prevUserLoc.current = locKey;
        viewportInit.current = true;
      } else if (dataBounds) {
        map.fitBounds(
          [[dataBounds.minLat, dataBounds.minLon], [dataBounds.maxLat, dataBounds.maxLon]],
          { padding: [50, 50] }
        );
        viewportInit.current = true;
      } else {
        map.fitBounds(
          [[PRD_BOUNDS.minLat, PRD_BOUNDS.minLon], [PRD_BOUNDS.maxLat, PRD_BOUNDS.maxLon]],
          { padding: [50, 50] }
        );
        viewportInit.current = true;
      }
    }
  }, [userLocation, dataBounds]);

  // Lock the map while rainfall grid data is still being fetched; unlock once
  // the CSV is parsed and the cells are on screen. This prevents the user from
  // panning/zooming a blank basemap that would mislead them about coverage.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ready = !!data && !isLoading;
    if (ready) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
    } else {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
    }
  }, [data, isLoading]);

  const activeStep = timeSteps[activeStepIndex];
  const activeCellsByColor = activeStep?.cellsByColor || null;

  return (
    <div className="absolute inset-0 flex flex-col">
      {!isLoading && timeSteps.length > 0 && (
        <div className="px-6 py-5 bg-background/50 border-b border-border/50 flex flex-row items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors shadow-sm"
              title={isPlaying ? 'Pause' : 'Play timeline'}
              aria-label={isPlaying ? t('nowcast.pause') : t('nowcast.play')}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>
            <div className="flex flex-col min-w-[80px]">
              <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Forecast Step</span>
              <span className="text-lg font-bold text-foreground">{activeStep.formattedTime}</span>
            </div>
          </div>

          <div className="flex-1 w-full flex flex-col gap-2">
            <input
              type="range"
              min={0}
              max={timeSteps.length - 1}
              value={activeStepIndex}
              onChange={(e) => {
                setActiveStepIndex(parseInt(e.target.value));
                setIsPlaying(false);
              }}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
              aria-label={t('nowcast.slider')}
            />
            <div className="flex justify-between text-xs font-semibold text-muted-foreground px-1">
              {timeSteps.map((step, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setActiveStepIndex(index);
                    setIsPlaying(false);
                  }}
                  className={`hover:text-primary transition-colors ${
                    index === activeStepIndex ? 'text-primary font-bold' : ''
                  }`}
                >
                  {step.formattedTime}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* flex-1 = fills the remaining height after step controls; the parent
          uses absolute inset-0 to anchor to the outer rain-map-area in
          RainfallMap.tsx, which has explicit height (h-[min(70vh,800px)]
          min-h-[400px]). no-swipe yields touch events to Leaflet. */}
      <div className="rainfall-map-area no-swipe relative flex-1 min-h-0 w-full bg-muted/20">
        {/* Top-right control cluster: updated time + basemap switcher + refresh.
            Bottom-left is reserved for the swiper pagination dots on mobile, so
            these buttons live at the top-right where nothing else competes.
            z-[600] = above the leaflet pane (400), below dialog content. */}
        <div className="absolute top-2 right-2 z-[600] flex items-center gap-2 text-xs text-muted-foreground bg-background/90 backdrop-blur-sm p-1.5 rounded-md border border-border/50 shadow-sm">
          {updateTime && (
            <span className="px-1 tabular-nums">{formatString(t('nowcast.updated'), updateTime)}</span>
          )}
          <button
            onClick={() => setBasemap(nextBasemap(basemap))}
            className="p-1 hover:bg-muted/50 rounded transition-colors"
            aria-label={`Switch basemap (current: ${BASEMAPS[basemap].label})`}
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-muted/50 rounded transition-colors disabled:opacity-50"
            disabled={isFetching}
            title="Refresh gridded nowcast"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>
        {/* First load: spinner briefly → progress bar during streaming */}
        {isLoading && (
          <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-background/50 backdrop-blur-sm">
            {downloadProgress !== null ? (
              <div className="w-80 flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>{t('nowcast.downloading')}</span>
                  <span className="tabular-nums">{downloadProgress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            )}
          </div>
        )}

        {/* Background refetch: thin bar at top of map */}
        {!isLoading && isFetching && downloadProgress !== null && (
          <div className="absolute top-0 left-0 right-0 z-10 h-1 bg-muted/60">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-6 text-center">
            <AlertCircle className="w-10 h-10 text-destructive mb-2" />
            <p className="text-lg font-medium text-foreground mb-1">Failed to load data</p>
            <p className="text-muted-foreground mb-4">{t('nowcast.error')}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        <MapContainer
          center={[22.40, 114.10]}
          zoom={9}
          minZoom={8}
          maxZoom={16}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          dragging={false}
          zoomControl={false}
          className="w-full h-full"
          ref={mapRef}
          aria-label={t('nowcast.mapLabel')}
          role="application"
        >
          <ZoomControl position="topleft" />
          <TileLayer
            key={basemap}
            attribution={BASEMAPS[basemap].attribution}
            url={BASEMAPS[basemap].url}
          />

          {activeCellsByColor && Array.from(activeCellsByColor.entries()).map(([color, featureCollection]) => (
            <ColorGeoLayer
              key={`${activeStepIndex}-${color}`}
              color={color}
              data={featureCollection}
              stepIndex={activeStepIndex}
            />
          ))}

          {userLocation && (
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={locationIcon}
              zIndexOffset={1000}
            />
          )}
        </MapContainer>

        {!isLoading && (
          <div className="absolute bottom-4 right-4 z-[400] bg-background/90 backdrop-blur-sm p-3 rounded-lg border border-border shadow-lg text-xs">
            <div className="font-semibold mb-2">{t('nowcast.legend')}</div>
            <div className="flex flex-col gap-1.5">
              {RAINFALL_BANDS.map(({ color, label }) => (
                <div key={color} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }}></div>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}