
/**
 * Custom fetch with timeout
 */
export async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = 8000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort(new DOMException(`Request timed out after ${timeout}ms`, 'TimeoutError'));
  }, timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}
