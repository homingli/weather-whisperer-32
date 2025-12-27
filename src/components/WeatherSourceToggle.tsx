import { useWeatherSource, WeatherSource } from '@/contexts/WeatherSourceContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Check } from 'lucide-react';

const sources: { value: WeatherSource; label: string; description: string }[] = [
  {
    value: 'open-meteo',
    label: 'Open-Meteo',
    description: 'Global weather data',
  },
  {
    value: 'hko',
    label: 'HK Observatory',
    description: 'Hong Kong only',
  },
];

export function WeatherSourceToggle() {
  const { source, setSource } = useWeatherSource();

  const currentSource = sources.find(s => s.value === source) || sources[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
          <span className="text-xs">{currentSource.label}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[180px]">
        {sources.map((s) => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => setSource(s.value)}
            className="flex items-center justify-between gap-2"
          >
            <div>
              <div className="font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.description}</div>
            </div>
            {source === s.value && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
