// Settings contain JSON values only; avoid newer structuredClone requirements.
export const cloneSettings = value => JSON.parse(JSON.stringify(value));
// AbortController is supported by older Chromium versions used on kiosk Pis.
// Keep the timeout active through response-body consumption, then release it.
export async function fetchWithTimeout(url, options = {}, milliseconds = 10000) {
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), milliseconds);
 try {
  const response = await fetch(url, {...options, signal: controller.signal});
  const body = await response.text();
  return {ok: response.ok, status: response.status, json: async () => JSON.parse(body)};
 } finally { clearTimeout(timer); }
}
