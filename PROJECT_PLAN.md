# PROJECT_PLAN.md

## Analysis
- Code base solid. React Query handles state well.
- PWA storage logic split across `weather.ts` and `hko-weather.ts`. Violates DRY.
- Dual-source fetching logic could be centralized into a single "Weather Gateway".
- `localStorage` usage is manual/messy. Replace with unified caching utility.

## Refactor Roadmap

### 1. Unified Storage/Cache (DONE)
- Create `src/lib/cache.ts`.
- Centralize `localStorage` JSON read/write.
- Standardize expiration logic.

### 2. Weather Gateway (Architectural Cleanup)
- Refactor `src/lib/weather.ts` and `hko-weather.ts` into a unified controller `src/lib/weather-manager.ts`.
- Single interface: `fetchWeather(lat, lon)`. 
- Logic: `if (isHK(lat, lon)) return hkoClient.fetch() else return openMeteoClient.fetch()`.
- Use `src/lib/cache.ts` for all storage operations.

### 3. PWA Cleanup
- Confirm `public/icons` files existence.
- Add missing icons.

### 4. Code Hygiene
- Remove unused `src/components/ui` components.
- Standardize `use-toast` location.

## Next Steps
1. Consolidate `localStorage` calls into `src/lib/cache.ts`.
2. Implement `WeatherManager` interface in `src/lib/weather-manager.ts`.
3. Update UI to use `WeatherManager`.
4. Remove unused `ui` components.
