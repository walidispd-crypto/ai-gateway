"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadFilePanelState,
  saveFilePanelState,
  type FilePanelEntry,
  type FilePanelMap,
} from "@/lib/file-panel-state";

const CLOSED: FilePanelEntry = { open: false, name: null };

export type FilePanelController = {
  open: boolean;
  activeName: string | null;
  /** Open the panel on a specific file (clicking a card in the bubble). */
  openFile: (name: string) => void;
  select: (name: string) => void;
  close: () => void;
};

export function useFilePanelState(conversationId: string | null): FilePanelController {
  const [entry, setEntry] = useState<FilePanelEntry>(CLOSED);
  const [loaded, setLoaded] = useState(false);
  const stored = useRef<FilePanelMap>({});
  const current = useRef<FilePanelEntry>(CLOSED);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    void loadFilePanelState().then((state) => {
      if (!alive) return;
      // An action fired before IndexedDB answered must win over the stale persisted map.
      stored.current = touched.current ? { ...state, ...stored.current } : state;
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    // Switching conversations restores that conversation's panel, not the previous one's.
    const next = (conversationId ? stored.current[conversationId] : undefined) ?? CLOSED;
    current.current = next;
    setEntry(next);
  }, [conversationId, loaded]);

  // Persist only from user actions: effects would write the previous conversation's state into
  // the newly selected one during a switch.
  const apply = useCallback(
    (next: FilePanelEntry) => {
      touched.current = true;
      current.current = next;
      setEntry(next);
      if (!conversationId) return;
      stored.current = { ...stored.current, [conversationId]: next };
      void saveFilePanelState(stored.current);
    },
    [conversationId],
  );

  const openFile = useCallback((name: string) => apply({ open: true, name }), [apply]);
  const select = useCallback((name: string) => apply({ open: true, name }), [apply]);
  const close = useCallback(() => apply({ open: false, name: current.current.name }), [apply]);

  return { open: entry.open, activeName: entry.name, openFile, select, close };
}
