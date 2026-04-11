import { Skeleton } from "@/components/ui/skeleton";

export function WeatherSkeleton() {
  return (
    <div className="space-y-6 lg:space-y-8 w-full">
      {/* Top Row: Current weather skeleton (Full Width) */}
      <div className="glass-card p-6 flex flex-col items-center py-8">
        <div className="grid grid-cols-1 md:grid-cols-[25%_50%_25%] gap-6 md:gap-4 w-full items-center">
          <div className="flex flex-col items-center md:items-start gap-4 md:border-r md:border-border/50 md:pr-6">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="flex flex-col items-center justify-center">
            <Skeleton className="h-4 w-40 mb-2" />
            <Skeleton className="h-10 w-48 mb-6" />
            <div className="flex items-center gap-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-20 w-32" />
              </div>
            </div>
          </div>
          <div className="flex flex-row md:flex-col items-center justify-around gap-4 md:border-l md:border-border/50 md:pl-6">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-16 w-16 rounded-full" />
          </div>
        </div>
      </div>

      {/* Secondary Row: Split Forecasts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
        {/* Hourly forecast skeleton */}
        <div className="glass-card p-6 h-[324px]">
          <Skeleton className="h-6 w-32 mb-6" />
          <div className="flex gap-4 overflow-hidden mt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-4 min-w-[72px]">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="h-24 w-1 bg-muted/20 rounded-full" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
        </div>

        {/* Daily Forecast skeleton */}
        <div className="glass-card p-6 h-[324px]">
          <Skeleton className="h-6 w-32 mb-6" />
          <div className="space-y-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 flex-1 max-w-[100px]" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
