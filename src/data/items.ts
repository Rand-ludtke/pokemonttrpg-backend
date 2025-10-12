import { BattleState, Category, LogSink, Pokemon } from "../types";

export interface Item {
  id: string;
  name: string;
  onModifyAtk?: (pokemon: Pokemon, atk: number, category: Category) => number;
  onModifyDef?: (pokemon: Pokemon, def: number, category: Category) => number;
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
};
