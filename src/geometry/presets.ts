import presetsJson from "../../fixtures/presets.json";
import type { Profile } from "../contracts";

export const PRESETS: Profile[] = presetsJson.presets as Profile[];

export type PresetKey = "flat" | "ridge" | "recess" | "step";

export function preset(key: PresetKey): Profile {
  const p = PRESETS.find((p) => p.id === `preset-${key}`);
  if (!p) throw new Error(`unknown preset ${key}`);
  return p;
}
