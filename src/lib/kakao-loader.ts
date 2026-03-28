/**
 * Kakao Map SDK lazy loader
 *
 * Injects the Kakao Map script asynchronously to avoid blocking initial page load.
 * Uses a singleton promise to ensure the SDK is only loaded once across all components.
 */

const KAKAO_SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js';

// Singleton promise for script loading state
let sdkLoadPromise: Promise<void> | null = null;

/**
 * Returns true if the Kakao Maps SDK is already fully loaded and ready
 */
export function isKakaoMapsReady(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.kakao !== 'undefined' &&
    typeof window.kakao.maps !== 'undefined' &&
    typeof window.kakao.maps.Map !== 'undefined'
  );
}

/**
 * Lazily loads the Kakao Map JavaScript SDK by injecting an async script tag.
 *
 * - Uses `autoload=false` so we control when initialization happens
 * - Calls `kakao.maps.load()` to trigger deferred initialization
 * - Caches the promise so multiple callers share one load attempt
 *
 * @param appKey - Kakao JavaScript App Key (from Kakao Developers console)
 * @returns Promise that resolves when the SDK is ready to use
 */
export function loadKakaoMapSDK(appKey: string): Promise<void> {
  // Already loaded
  if (isKakaoMapsReady()) {
    return Promise.resolve();
  }

  // Return existing load promise if already in progress
  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Kakao Map SDK can only be loaded in browser environment'));
      return;
    }

    if (!appKey) {
      reject(new Error('Kakao Map App Key is required'));
      return;
    }

    // Construct SDK URL with autoload=false for manual control
    const scriptSrc = `${KAKAO_SDK_URL}?appkey=${encodeURIComponent(appKey)}&autoload=false`;

    // Check if script tag already exists (e.g. added by another mechanism)
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src*="dapi.kakao.com"]`
    );

    if (existingScript) {
      // Script tag exists; wait for kakao.maps.load()
      waitForKakaoLoad(resolve, reject);
      return;
    }

    // Create script element with async loading attributes
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = scriptSrc;
    script.async = true;        // Non-blocking download
    script.defer = false;       // Execute as soon as downloaded (we need it ASAP for maps)
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      // SDK script downloaded; now initialize the maps module
      if (typeof window.kakao !== 'undefined' && typeof window.kakao.maps?.load === 'function') {
        window.kakao.maps.load(() => {
          resolve();
        });
      } else {
        reject(new Error('Kakao SDK loaded but kakao.maps.load is not available'));
      }
    };

    script.onerror = () => {
      sdkLoadPromise = null; // Allow retry on error
      reject(new Error('Failed to load Kakao Map SDK script. Check your App Key and network.'));
    };

    // Inject before closing </head> for optimal placement
    const head = document.head || document.getElementsByTagName('head')[0];
    head.appendChild(script);
  });

  return sdkLoadPromise;
}

/**
 * Polls for kakao.maps readiness (used when script tag already exists)
 */
function waitForKakaoLoad(
  resolve: () => void,
  reject: (err: Error) => void,
  attempts = 0
): void {
  const MAX_ATTEMPTS = 100; // 10 seconds max
  const POLL_INTERVAL = 100; // ms

  if (isKakaoMapsReady()) {
    resolve();
    return;
  }

  if (typeof window.kakao !== 'undefined' && typeof window.kakao.maps?.load === 'function') {
    window.kakao.maps.load(() => resolve());
    return;
  }

  if (attempts >= MAX_ATTEMPTS) {
    reject(new Error('Kakao Map SDK load timed out after 10 seconds'));
    return;
  }

  setTimeout(() => waitForKakaoLoad(resolve, reject, attempts + 1), POLL_INTERVAL);
}

/**
 * Resets the SDK load promise (useful for testing)
 */
export function resetKakaoLoader(): void {
  sdkLoadPromise = null;
}
