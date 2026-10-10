import { Color } from "three";

/** Read a design token as a three.js Color (scene code never hard-codes colors either). */
export function tokenColor(name: string): Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new Color(v || "white");
}
