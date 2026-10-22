"use client";

import { createContext, useContext } from "react";
import type { PublicModel } from "@/config/models";

const ModelRegistryContext = createContext<PublicModel[]>([]);

export function ModelRegistryProvider({
  models,
  children,
}: {
  models: PublicModel[];
  children: React.ReactNode;
}) {
  return <ModelRegistryContext.Provider value={models}>{children}</ModelRegistryContext.Provider>;
}

export function useModels(): PublicModel[] {
  return useContext(ModelRegistryContext);
}

export function useModelLabel(modelId: string): string {
  const models = useModels();
  return models.find((model) => model.id === modelId)?.label ?? modelId;
}
