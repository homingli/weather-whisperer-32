import { useState, useEffect, useRef } from "react";
import { Search, MapPin, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchCities, GeoLocation, setDefaultCity } from "@/lib/weather";

interface CitySearchProps {
  currentCity: GeoLocation | null;
  onCitySelect: (city: GeoLocation) => void;
}

export function CitySearch({ currentCity, onCitySelect }: CitySearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        setIsLoading(true);
        try {
          const cities = await searchCities(query);
          setResults(cities);
          setIsOpen(true);
        } catch (error) {
          console.error("Failed to search cities:", error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (city: GeoLocation) => {
    setDefaultCity(city);
    onCitySelect(city);
    setQuery("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md mx-auto">
      <div className="glass-card flex items-center gap-3 px-4 py-3">
        <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <Input
          type="text"
          placeholder="Search for a city..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border-0 bg-transparent p-0 h-auto text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {currentCity && !isOpen && (
        <div className="flex items-center justify-center gap-2 mt-3 text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span className="text-sm">
            {currentCity.name}, {currentCity.admin1 ? `${currentCity.admin1}, ` : ''}{currentCity.country}
          </span>
        </div>
      )}

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-card overflow-hidden z-50">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Searching...</div>
          ) : results.length > 0 ? (
            <ul className="divide-y divide-border/30">
              {results.map((city, index) => (
                <li key={`${city.name}-${city.latitude}-${city.longitude}-${index}`}>
                  <button
                    onClick={() => handleSelect(city)}
                    className="w-full px-4 py-3 text-left hover:bg-secondary/50 transition-colors flex items-center gap-3"
                  >
                    <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-medium">{city.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {city.admin1 ? `${city.admin1}, ` : ''}{city.country}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center text-muted-foreground">No cities found</div>
          )}
        </div>
      )}
    </div>
  );
}
