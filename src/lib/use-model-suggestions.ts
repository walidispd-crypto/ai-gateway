"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteModelSuggestion,
  loadModelSuggestions,
  saveModelSuggestion,
  type ModelSuggestions,
} from "@/lib/model-suggestions";

export type ModelSuggestionsController = {
  suggestions: ModelSuggestions;
  save: (providerId: string, name: string) => void;
  remove: (providerId: string, name: string) => void;
};

export function useModelSuggestions(): ModelSuggestionsController {
  const [suggestions, setSuggestions] = useState<ModelSuggestions>({});

  useEffect(() => {
    let alive = true;
    void loadModelSuggestions().then((stored) => {
      if (alive) setSuggestions(stored);
    });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback((providerId: string, name: string) => {
    void saveModelSuggestion(providerId, name).then(setSuggestions);
  }, []);

  const remove = useCallback((providerId: string, name: string) => {
    void deleteModelSuggestion(providerId, name).then(setSuggestions);
  }, []);

  return { suggestions, save, remove };
}
