import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

function subscribe(change: () => void) {
  const list = matchMedia(QUERY);
  list.addEventListener("change", change);
  return () => list.removeEventListener("change", change);
}

/** Touch screens keep the phone's own picker wheels. The server renders the desktop control. */
export const useCoarsePointer = () => useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches, () => false);

/** A popup opened inside a modal <dialog> must render inside it, or the dialog's top layer covers it. */
export const dialogContainer = (from: Element | null) => from?.closest("dialog") ?? undefined;
