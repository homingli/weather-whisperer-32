import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, GeoJSON, Marker, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { CloudRain, AlertCircle, RefreshCw, Play, Pause } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { PRD_BOUNDS } from '@/lib/hko-weather';
import 'leaflet/dist/leaflet.css';

// Module-level empty array to avoid allocations
const EMPTY_POINTS: StepData[] = [];

interface UserLocation {
  latitude: number;
  longitude: number;
}

// Local blue location pin icon — replaces external CDN URLs for reliability
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
  globalBounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

// Color scale for legend rendering
const COLOR_SCALE = [
  { color: '#a0c4ff', label: '< 0.5' },
  { color: '#4facfe', label: '0.5 - 2' },
  { color: '#00f2fe', label: '2 - 5' },
  { color: '#43e97b', label: '5 - 10' },
  { color: '#f6d365', label: '10 - 20' },
  { color: '#ff0844', label: '20 - 30' },
  { color: '#9d0b0b', label: '> 30' },
] as const;

// Color buckets per timestep: maps rainfall color to array of [lat, lon] pairs
interface StepData {
  endTime: string;
  formattedTime: string;
  /** color -> [cellCoords, ...] where each cellCoords is 4 [lat,lon] corners */
  cellsByColor: Map<string, [number, number][][]>;
}

// Memoized color function — called once per cell at parse time
const getRainfallColor = ((value: number): string => {
  if (value <= 0.5) return '#a0c4ff';
  if (value <= 2) return '#4facfe';
  if (value <= 5) return '#00f2fe';
  if (value <= 10) return '#43e97b';
  if (value <= 20) return '#f6d365';
  if (value <= 30) return '#ff0844';
  return '#9d0b0b';
}) satisfies (value: number) => string;

// GeoJSON layer for one color bucket — memoized so React skips re-render when data unchanged
const ColorGeoLayer = memo(({ color, coordinates, stepIndex }: {
  color: string;
  coordinates: [number, number][][];
  stepIndex: number;
}) => {
  const geoJSONData = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: coordinates.map(coords => ({
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [coords] },
    })),
  }), [coordinates]);

  return (
    <GeoJSON
      key={`${stepIndex}-${color}`}
      data={geoJSONData}
      style={() => ({ fillColor: color, fillOpacity: 0.6, color: color, weight: 0 })}
    />
  );
}, (prev, next) =>
  prev.stepIndex === next.stepIndex && prev.color === next.color && prev.coordinates === next.coordinates
);

// CSV parser: two-pass, builds color-bucketed steps + global bounds in O(n)
const parseRainfallCSV = (csvText: string): NowcastResult => {
  const lines = csvText.split('\n');
  let updateTime = '';

  // Global bounds across all timesteps
  let globalMinLat = Infinity, globalMaxLat = -Infinity;
  let globalMinLon = Infinity, globalMaxLon = -Infinity;

  // Pass 1: collect bounds + update time
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;

    const value = parseFloat(parts[4]);
    if (value <= 0) continue;

    const lat = parseFloat(parts[2]);
    const lon = parseFloat(parts[3]);

    if (i === 1 && parts[0] && parts[0].length >= 12) {
      updateTime = `${parts[0].substring(0, 4)}-${parts[0].substring(4, 6)}-${parts[0].substring(6, 8)} ${parts[0].substring(8, 10)}:${parts[0].substring(10, 12)}`;
    }

    if (lat < globalMinLat) globalMinLat = lat;
    if (lat > globalMaxLat) globalMaxLat = lat;
    if (lon < globalMinLon) globalMinLon = lon;
    if (lon > globalMaxLon) globalMaxLon = lon;
  }

  // Pass 2: bucket cells by endTime + color
  const temp: Record<string, Record<string, [number, number][][]>> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;

    const endTime = parts[1];
    if (!endTime) continue;

    const value = parseFloat(parts[4]);
    if (value <= 0) continue;

    const lat = parseFloat(parts[2]);
    const lon = parseFloat(parts[3]);
    const color = getRainfallColor(value);

    // Cell corners as GeoJSON [lon, lat] (GeoJSON spec requires lon-first order)
    const cellCoords: [number, number][] = [
      [lon - 0.0095, lat - 0.009],
      [lon + 0.0095, lat - 0.009],
      [lon + 0.0095, lat + 0.009],
      [lon - 0.0095, lat + 0.009],
    ];

    if (!temp[endTime]) temp[endTime] = {};
    if (!temp[endTime][color]) temp[endTime][color] = [];
    temp[endTime][color].push(cellCoords);
  }

  // Convert to sorted steps with per-step color buckets
  const sortedEndTimes = Object.keys(temp).sort();
  const timeSteps: StepData[] = sortedEndTimes.map(endTime => {
    const byColor = temp[endTime];
    const cellsByColor = new Map<string, [number, number][][]>();

    for (const [color, coordsArray] of Object.entries(byColor)) {
      cellsByColor.set(color, coordsArray);
    }

    const formattedTime = endTime.length >= 12
      ? `${endTime.substring(8, 10)}:${endTime.substring(10, 12)}`
      : endTime;

    return { endTime, formattedTime, cellsByColor };
  });

  const latPad = (globalMaxLat - globalMinLat) * 0.02;
  const lonPad = (globalMaxLon - globalMinLon) * 0.02;

  return { timeSteps, updateTime, globalBounds: {
    minLat: globalMinLat - latPad,
    maxLat: globalMaxLat + latPad,
    minLon: globalMinLon - lonPad,
    maxLon: globalMaxLon + lonPad,
  }};
};

const fetchRainfallNowcast = async (): Promise<NowcastResult> => {
  const response = await fetch('/hko-data/F3/Gridded_rainfall_nowcast.csv');
  if (!response.ok) {
    throw new Error('Failed to fetch gridded rainfall nowcast');
  }
  const csvText = await response.text();
  return parseRainfallCSV(csvText);
};

export const RainfallMap = ({ userLocation }: { userLocation?: UserLocation }) => {
  const mapRef = useRef<L.Map | null>(null);
  const viewportInit = useRef(false);
  const prevUserLoc = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Use React Query for caching & auto-refetching (5-min, aligned with weather queries)
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['hkoGriddedRainfallNowcast'],
    queryFn: fetchRainfallNowcast,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isLoaded,
  });

  const timeSteps = data?.timeSteps || EMPTY_POINTS;
  const updateTime = data?.updateTime || '';
  const { t } = useLanguage();

  // Global bounds computed at parse time — O(1) lookup
  const dataBounds = useMemo(() => {
    if (!data) return null;
    return data.globalBounds;
  }, [data]);

  // Reset active step index when data is refetched
  useEffect(() => {
    if (timeSteps.length > 0) {
      setActiveStepIndex(0);
    }
  }, [data]);

  // Autoplay handler for the time steps
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && timeSteps.length > 0) {
      interval = setInterval(() => {
        setActiveStepIndex((prevIndex) => (prevIndex + 1) % timeSteps.length);
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, timeSteps]);

  // Zoom behavior: set view ONCE on init. Never re-zoom on data load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const locKey = userLocation ? `${userLocation.latitude},${userLocation.longitude}` : null;
    const userChanged = locKey && locKey !== prevUserLoc.current;

    if (!viewportInit.current || userChanged) {
      if (userLocation) {
        map.setView([userLocation.latitude, userLocation.longitude], 14, { animate: true });
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

  const activeStep = timeSteps[activeStepIndex];
  const activeCellsByColor = activeStep?.cellsByColor || null;

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50 flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CloudRain className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">{t('nowcast.title')}</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {t('nowcast.subtitle')}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {updateTime && <span>{formatString(t('nowcast.updated'), updateTime)}</span>}
          {isLoaded && (
            <button
              onClick={() => refetch()}
              className="p-1.5 hover:bg-muted/50 rounded-md transition-colors"
              disabled={isFetching}
              title="Refresh gridded nowcast"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
            </button>
          )}
        </div>
      </div>

      <div className="relative h-[400px] w-full bg-muted/20">
        {!isLoaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm">
            <CloudRain className="w-12 h-12 text-primary mb-4 opacity-80" />
            <h3 className="text-xl font-semibold mb-2">{t('nowcast.view')}</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-sm">
              {t('nowcast.desc')}
            </p>
            <button
              onClick={() => setIsLoaded(true)}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-sm font-medium"
            >
              {t('nowcast.load')}
            </button>
          </div>
        )}

        {isLoading && isLoaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
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
          scrollWheelZoom
          doubleClickZoom
          className="w-full h-full z-0"
          ref={mapRef}
          aria-label={t('nowcast.mapLabel')}
          role="application"
        >
          <ZoomControl position="topright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />

          {/* Color-bucketed GeoJSON layers: ~7 components instead of ~2,000 Rectangles */}
          {activeCellsByColor && Array.from(activeCellsByColor.entries()).map(([color, cellCoordsArray]) => (
            <ColorGeoLayer
              key={`${activeStepIndex}-${color}`}
              color={color}
              coordinates={cellCoordsArray}
              stepIndex={activeStepIndex}
            />
          ))}

          {/* Current location indicator */}
          {userLocation && (
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={locationIcon}
              zIndexOffset={1000}
            />
          )}
        </MapContainer>

        {/* Legend */}
        {isLoaded && !isLoading && (
          <div className="absolute bottom-4 right-4 z-[400] bg-background/90 backdrop-blur-sm p-3 rounded-lg border border-border shadow-lg text-xs">
            <div className="font-semibold mb-2">{t('nowcast.legend')}</div>
            <div className="flex flex-col gap-1.5">
              {COLOR_SCALE.map(({ color, label }) => (
                <div key={color} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }}></div>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Time Slider Controls */}
      {isLoaded && !isLoading && timeSteps.length > 0 && (
        <div className="px-6 py-5 bg-background/50 border-t border-border/50 flex flex-col md:flex-row items-center gap-6">
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
    </div>
  );
};
