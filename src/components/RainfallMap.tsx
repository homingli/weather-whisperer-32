import { useState, useEffect, useRef, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, GeoJSON, Marker, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';
import { CloudRain, AlertCircle, RefreshCw, Play, Pause } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import { PRD_BOUNDS, isInRainfallRegion } from '@/lib/hko-weather';

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
const polygonStyle = (color: string) => ({
  fillColor: hexToRgba(color, FILL_ALPHA),
  fillOpacity: 1,
  color: hexToRgba(color, 1),
  weight: 0.5,
});

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

const fetchRainfallNowcast = async (): Promise<NowcastResult> => {
  const response = await fetch('/hko-data/F3/Gridded_rainfall_nowcast.csv');
  if (!response.ok) throw new Error('Failed to fetch gridded rainfall nowcast');
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

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['hkoGriddedRainfallNowcast'],
    queryFn: fetchRainfallNowcast,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: isLoaded,
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
      }, 1500);
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

  // Region gate — the HKO gridded nowcast only covers the Pearl River Delta.
  // Show a static note (not the lazy-load button) when the user is outside
  // this coverage area so the map and button stay interactive for in-region users.
  const inRegion = userLocation ? isInRainfallRegion(userLocation.latitude, userLocation.longitude) : true;
  if (userLocation && !inRegion) {
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
        </div>
        <div className="h-[400px] w-full flex flex-col items-center justify-center bg-muted/20 text-center px-6">
          <CloudRain className="w-10 h-10 text-muted-foreground mb-3 opacity-60" />
          <p className="text-sm text-muted-foreground max-w-sm">
            {t('nowcast.outOfRegion')}
          </p>
        </div>
      </div>
    );
  }

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

      {isLoaded && !isLoading && timeSteps.length > 0 && (
        <div className="px-6 py-5 bg-background/50 border-b border-border/50 flex flex-col md:flex-row items-center gap-6">
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

      <div className="relative h-[400px] w-full bg-muted/20">
        {!isLoaded && (
          <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-background/85 pointer-events-none">
            <CloudRain className="w-12 h-12 text-primary mb-4 opacity-80" />
            <h3 className="text-xl font-semibold mb-2">{t('nowcast.view')}</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-sm">
              {t('nowcast.desc')}
            </p>
            <button
              type="button"
              onClick={() => setIsLoaded(true)}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-sm font-medium pointer-events-auto"
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
          className="w-full h-full"
          ref={mapRef}
          aria-label={t('nowcast.mapLabel')}
          role="application"
        >
          <ZoomControl position="topright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
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

        {isLoaded && !isLoading && (
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
};
