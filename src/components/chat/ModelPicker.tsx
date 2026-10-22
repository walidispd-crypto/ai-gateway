"use client";

import type { PublicModel } from "@/config/models";
import { Icon } from "@/components/ui/Icon";

export function ModelPicker({
  models,
  value,
  disabled,
  onChange,
}: {
  models: PublicModel[];
  value: string;
  disabled: boolean;
  onChange: (modelId: string) => void;
}) {
  const selected = models.find((model) => model.id === value);

  return (
    <div className="relative">
      <label htmlFor="model-picker" className="sr-only">
        Model
      </label>
      <select
        id="model-picker"
        value={selected ? value : (models[0]?.id ?? "")}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        title={selected?.description}
        className="appearance-none rounded border border-line bg-surface py-1 pl-2 pr-7 text-xs text-ink transition-colors hover:border-faint focus-visible:border-accent disabled:opacity-50"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint"
      />
    </div>
  );
}
