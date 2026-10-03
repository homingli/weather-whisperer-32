// Build-time globals injected by the Vite `define` config (vite.config.ts).
// Kept import-free on purpose: a .d.ts without imports/exports is a global
// script, so these declares apply project-wide without being scoped to a
// module (vite-env.d.ts has imports, so declares there would not be global).
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
