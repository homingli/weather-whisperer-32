import { Skeleton } from "@/components/ui/skeleton";

export function WeatherSkeleton() {
  return (
    <div className="space-y-6">
      {/* Current weather skeleton */}
      <div className="text-center py-8">
        <Skeleton className="h-20 w-20 rounded-full mx-auto mb-4" />
        <Skeleton className="h-24 w-40 mx-auto mb-2" />
        <Skeleton className="h-6 w-32 mx-auto mb-6" />
        <Skeleton className="h-16 w-80 mx-auto rounded-2xl" />
      </div>

      {/* Hourly forecast skeleton */}
      <div className="glass-card p-4">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 min-w-[72px]">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </div>

      {/* Daily forecast skeleton */}
      <div className="glass-card p-4">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-1.5 flex-1 rounded-full" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
