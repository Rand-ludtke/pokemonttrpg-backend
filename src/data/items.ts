import { BattleState, Category, LogSink, Pokemon } from "../types";

export interface Item {
  id: string;
  name: string;
  onModifyAtk?: (pokemon: Pokemon, atk: number, category: Category) => number;
  onModifyDef?: (pokemon: Pokemon, def: number, category: Category) => number;
  onModifySpeed?: (pokemon: Pokemon, speed: number) => number;
  onModifyDamage?: (pokemon: Pokemon, damage: number) => number;
  onEndOfTurn?: (pokemon: Pokemon, state: BattleState, log: LogSink) => void; // e.g., Leftovers
  onWeatherDuration?: (weatherId: string, current: number) => number; // extend duration
}

export const Items: Record<string, Item> = {
  choice_band: {
    id: "choice_band",
    name: "Choice Band",
    onModifyAtk: (pokemon, atk, category) => (category === "Physical" ? Math.floor(atk * 1.5) : atk),
  },
  leftovers: {
    id: "leftovers",
    name: "Leftovers",
    onEndOfTurn: (pokemon, _state, log) => {
      if (pokemon.currentHP <= 0) return;
      const heal = Math.max(1, Math.floor(pokemon.maxHP / 16));
      const before = pokemon.currentHP;
      pokemon.currentHP = Math.min(pokemon.maxHP, pokemon.currentHP + heal);
      const delta = pokemon.currentHP - before;
      if (delta > 0) log(`${pokemon.name} restored ${delta} HP with Leftovers.`);
    },
  },
  terrain_extender: {
    id: "terrain_extender",
    name: "Terrain Extender",
    onWeatherDuration: (_id, cur) => cur, // placeholder for parity; terrain handling will use a similar hook
  },
  focus_sash: {
    id: "focus_sash",
    name: "Focus Sash",
  },
  life_orb: {
    id: "life_orb",
    name: "Life Orb",
    onModifyDamage: (_pokemon, damage) => Math.floor(damage * 1.3),
    // Recoil is applied post-move in engine when damage was dealt; no EOT effect here
  },
  choice_scarf: {
    id: "choice_scarf",
    name: "Choice Scarf",
    onModifySpeed: (_pokemon, speed) => Math.floor(speed * 1.5),
  },
  choice_specs: {
    id: "choice_specs",
    name: "Choice Specs",
    onModifyAtk: (pokemon, atk, category) => (category === "Special" ? Math.floor(atk * 1.5) : atk),
  },
  lum_berry: {
    id: "lum_berry",
    name: "Lum Berry",
    // Clearing status would need a hook on status apply; leaving interface for later
  },
  light_clay: {
    id: "light_clay",
    name: "Light Clay",
  },
  damp_rock: {
    id: "damp_rock",
    name: "Damp Rock",
    onWeatherDuration: (weatherId, current) => (weatherId === "rain" ? 8 : current),
  },
  heat_rock: {
    id: "heat_rock",
    name: "Heat Rock",
    onWeatherDuration: (weatherId, current) => (weatherId === "sun" ? 8 : current),
  },
  smooth_rock: {
    id: "smooth_rock",
    name: "Smooth Rock",
    onWeatherDuration: (weatherId, current) => (weatherId === "sandstorm" ? 8 : current),
  },
  icy_rock: {
    id: "icy_rock",
    name: "Icy Rock",
    onWeatherDuration: (weatherId, current) => (weatherId === "hail" || weatherId === "snow" ? 8 : current),
  },
  utility_umbrella: {
    id: "utility_umbrella",
    name: "Utility Umbrella",
  },
};

export function mergeItems(map: Record<string, Item>) {
  for (const [k, v] of Object.entries(map)) {
    Items[k] = v;
  }
}
