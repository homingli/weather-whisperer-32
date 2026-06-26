import { useState, useEffect, useRef, type LatLngExpression } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Rectangle, Marker, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { CloudRain, AlertCircle, RefreshCw, Play, Pause } from 'lucide-react';
import { useLanguage, formatString } from '@/contexts/LanguageContext';
import 'leaflet/dist/leaflet.css';

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

interface RainfallData {
  lat: number;
  lon: number;
  value: number;
  bounds: [[number, number], [number, number]];
}

interface TimeStep {
  endTime: string;
  formattedTime: string;
  points: RainfallData[];
}

interface NowcastResult {
  timeSteps: TimeStep[];
  updateTime: string;
}

// Function to get color based on rainfall intensity (mm)
const getRainfallColor = (value: number) => {
  if (value <= 0.5) return '#a0c4ff'; // Light rain
  if (value <= 2) return '#4facfe'; // Moderate-light
  if (value <= 5) return '#00f2fe'; // Moderate
  if (value <= 10) return '#43e97b'; // Moderate-heavy
  if (value <= 20) return '#f6d365'; // Heavy
  if (value <= 30) return '#ff0844'; // Very heavy
  return '#9d0b0b'; // Extreme
};

// Blazing fast client-side CSV parser customized for HKO Gridded Rainfall data
const parseRainfallCSV = (csvText: string): NowcastResult => {
  const lines = csvText.split('\n');
  let updateTime = '';

  // Track all unique end times to ensure empty time steps are still represented
  const groups: Record<string, RainfallData[]> = {};

  // Skip header, loop through grid rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length >= 5) {
      const endTime = parts[1];
      if (!endTime) continue;

      if (!groups[endTime]) {
        groups[endTime] = [];
      }

      // Capture update time from first row
      if (i === 1 && parts[0]) {
        const lastUpdate = parts[0];
        if (lastUpdate.length >= 12) {
          const year = lastUpdate.substring(0, 4);
          const month = lastUpdate.substring(4, 6);
          const day = lastUpdate.substring(6, 8);
          const hour = lastUpdate.substring(8, 10);
          const min = lastUpdate.substring(10, 12);
          updateTime = `${year}-${month}-${day} ${hour}:${min}`;
        }
      }

      const value = parseFloat(parts[4]);
      if (value > 0) {
        const lat = parseFloat(parts[2]);
        const lon = parseFloat(parts[3]);

        // Bounding box dimensions approximating the 0.018 lat / 0.019 lon HKO grid resolution
        const bounds: [[number, number], [number, number]] = [
          [lat - 0.009, lon - 0.0095],
          [lat + 0.009, lon + 0.0095]
        ];

        groups[endTime].push({ lat, lon, value, bounds });
      }
    }
  }

  // Convert groups to sorted array of timesteps
  const sortedEndTimes = Object.keys(groups).sort();
  const timeSteps = sortedEndTimes.map(endTime => {
    // Format ending time (YYYYMMDDHHmm -> HH:mm)
    let formattedTime = endTime;
    if (endTime.length >= 12) {
      const hour = endTime.substring(8, 10);
      const min = endTime.substring(10, 12);
      formattedTime = `${hour}:${min}`;
    }
    return {
      endTime,
      formattedTime,
      points: groups[endTime]
    };
  });

  return { timeSteps, updateTime };
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
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Use React Query for caching & auto-refetching (5-min, aligned with weather queries)
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['hkoGriddedRainfallNowcast'],
    queryFn: fetchRainfallNowcast,
    staleTime: 5 * 60 * 1000,      // Keep cache fresh for 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refresh automatically every 5 minutes
    enabled: isLoaded,              // Only fetch when user explicitly clicks to load
  });

  const timeSteps = data?.timeSteps || [];
  const updateTime = data?.updateTime || '';
  const { t } = useLanguage();

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

  // Zoom behavior: user location → zoom 14; no location → HK bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userLocation) {
      // Zoom tightly to user's location
      map.setView([userLocation.latitude, userLocation.longitude], 14, { animate: true });
    } else {
      // Fit to HK coverage area when no user location
      const bounds: LatLngExpression = [
        [22.15, 113.82],
        [22.56, 114.43],
      ];
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [userLocation]);

  const activeStep = timeSteps[activeStepIndex];
  const activePoints = activeStep?.points || [];

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
          center={[22.3193, 114.1694]}
          zoom={10}
          scrollWheelZoom
          doubleClickZoom
          className="w-full h-full z-0"
          ref={mapRef}
        >
          <ZoomControl position="topright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          {activePoints.map((point, index) => (
            <Rectangle
              key={`${activeStepIndex}-${index}`}
              bounds={point.bounds}
              pathOptions={{
                color: getRainfallColor(point.value),
                fillColor: getRainfallColor(point.value),
                fillOpacity: 0.6,
                weight: 0 // No border
              }}
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
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: '#a0c4ff'}}></div>&lt; 0.5</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: '#4facfe'}}></div>0.5 - 2</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: '#00f2fe'}}></div>2 - 5</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: '#43e97b'}}></div>5 - 10</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: '#f6d365'}}></div>10 - 20</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: '#ff0844'}}></div>20 - 30</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{backgroundColor: '#9d0b0b'}}></div>&gt; 30</div>
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
                setIsPlaying(false); // Stop playing on manual drag
              }}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
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
