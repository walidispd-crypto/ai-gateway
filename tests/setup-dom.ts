import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import { act } from "react";

const dom = new JSDOM("<!doctype html><html lang='id'><head></head><body></body></html>", {
  url: "https://localhost/",
  pretendToBeVisual: true,
});

function define(key: string, value: unknown) {
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  } catch {
    // Some Node globals are locked; the component tree only needs the ones that succeed.
  }
}

define("window", dom.window);
define("document", dom.window.document);
define("navigator", dom.window.navigator);
define("HTMLElement", dom.window.HTMLElement);
define("HTMLTextAreaElement", dom.window.HTMLTextAreaElement);
define("HTMLInputElement", dom.window.HTMLInputElement);
define("HTMLAnchorElement", dom.window.HTMLAnchorElement);
define("HTMLDialogElement", dom.window.HTMLDialogElement);
define("Node", dom.window.Node);
define("Event", dom.window.Event);
define("KeyboardEvent", dom.window.KeyboardEvent);
define("MouseEvent", dom.window.MouseEvent);
define("getComputedStyle", dom.window.getComputedStyle);
define("requestAnimationFrame", (callback: FrameRequestCallback) =>
  setTimeout(() => callback(Date.now()), 16),
);
define("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
define("IS_REACT_ACT_ENVIRONMENT", true);
define("localStorage", dom.window.localStorage);

dom.window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof dom.window.matchMedia;

export { act, dom };
