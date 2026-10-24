/** Sends analytics JSON that must survive leaving the page: a beacon, or a keepalive fetch where beacons are missing. Never throws. */
export function sendBeacon(url: string, body: object) {
  const json = JSON.stringify(body);
  if (navigator.sendBeacon?.(url, new Blob([json], { type: "application/json" }))) return;
  void fetch(url, { method: "POST", body: json, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
}
