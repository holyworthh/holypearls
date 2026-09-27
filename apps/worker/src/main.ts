import { loadWorkerEnv } from "@holypearls/config";

loadWorkerEnv();
console.log("HolyPearls worker is running; jobs start in T00-04.");

// Keep the process alive until it has real job subscriptions.
const idle = setInterval(() => {}, 60_000);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(idle);
  });
}
