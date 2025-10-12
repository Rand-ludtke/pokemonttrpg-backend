import { Stats, TypeName } from "../types";

export interface SpeciesEntry {
  id: string;
  name: string;
  types: TypeName[];
  baseStats: Stats;
  abilities?: string[];
}

export const PokedexRegistry: Record<string, SpeciesEntry> = {};

export function mergeSpecies(map: Record<string, SpeciesEntry>) {
  for (const [k, v] of Object.entries(map)) {
    PokedexRegistry[k] = v;
  }
}

export function getSpecies(id: string): SpeciesEntry | undefined {
  return PokedexRegistry[id.toLowerCase()];
}
