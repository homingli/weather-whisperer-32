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

### 2. Weather Gateway (DONE)
- Refactor `src/lib/weather.ts` and `hko-weather.ts` into `src/lib/weather-manager.ts`.
- Single interface: `fetchWeather(lat, lon)`. 
- Logic: `isInHongKong(lat, lon)` check routing.
- Used `src/lib/cache.ts` for storage.

### 3. PWA Cleanup (DONE)
- Confirm `public/icons` files existence.
- Add missing icons (Confirmed present).

### 4. Code Hygiene (DONE)
- Remove unused `src/components/ui` components.
- Standardize `use-toast` location.

### 5. Test Suite Implementation (DONE)
- Created `src/lib/hko-weather.test.ts` for API parsing validation.
- Created `src/lib/weather-manager.test.ts` for gateway integration validation.
- Verified HKO warning signals coverage.

### 6. Environment Stabilizing (DONE)
- Fixed Vite/Vitest version mismatch.
- Executed `npm audit fix` for security updates.

## Next Steps
1. Final verification of PWA icons in the build (DONE).
2. Commit hygiene and cleanup of scratch files (DONE).
3. Merge to main.
