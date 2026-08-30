// Central registry of browser storage keys and related event names.
// Keeping these in one place avoids silent key collisions or typos when a
// value is read in one module and written in another.
export const CART_STORAGE_KEY = "phase4-cart";
export const THEME_STORAGE_KEY = "theme";
export const LAB_LOCAL_KEY = "phase5-preference";
export const LAB_SESSION_KEY = "phase5-session";
export const LANGUAGE_STORAGE_KEY = "phase5-language";
export const PROGRESS_STORAGE_PREFIX = "e2e-test-lab:progress:v1:user:";
export const PROGRESS_CHANGE_EVENT = "e2e-test-lab:progress-change";
