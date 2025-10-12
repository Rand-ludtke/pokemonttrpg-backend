import { BattleState, Category, LogSink, Pokemon } from "../types";

export interface Ability {
  id: string;
  name: string;
  // Hooks for common effects
  onSwitchIn?: (pokemon: Pokemon, state: BattleState, log: LogSink) => void;
  onModifyPriority?: (pokemon: Pokemon, priority: number) => number;
  onModifyAccuracy?: (pokemon: Pokemon, accuracy: number) => number;
  onModifyAtk?: (pokemon: Pokemon, atk: number, category: Category) => number;
  onModifyDef?: (pokemon: Pokemon, def: number, category: Category) => number;
  onModifyDamage?: (user: Pokemon, target: Pokemon, damage: number) => number;
  onModifySpeed?: (pokemon: Pokemon, speed: number) => number;
}

// A tiny sample registry; extend with more as needed
export const Abilities: Record<string, Ability> = {
  // Intimidate: upon switch-in, lowers adjacent foes' Atk by 1 (simplified to active foe)
  intimidate: {
    id: "intimidate",
    name: "Intimidate",
    onSwitchIn: (pokemon, state, log) => {
      // Find opposing active mon
      const opponentSide = state.players.find((p) => !p.team.some((m) => m.id === pokemon.id));
      if (!opponentSide) return;
      const foe = opponentSide.team[opponentSide.activeIndex];
      foe.stages.atk = Math.max(-6, Math.min(6, (foe.stages.atk ?? 0) - 1));
      log(`${foe.name}'s Attack fell due to Intimidate!`);
    },
  },
  sturdy: {
    id: "sturdy",
    name: "Sturdy",
    // effect handled in engine.applySurvivalEffects when lethal damage from full HP
  },
  no_guard: {
    id: "no_guard",
    name: "No Guard",
    // Accuracy handled in engine (always hit)
  },
  levitate: {
    id: "levitate",
    name: "Levitate",
    // Ground immunity handled in engine before damage calc
  },
  blaze: {
    id: "blaze",
    name: "Blaze",
    onModifyDamage: (user, target, damage) => {
      if (user.currentHP <= Math.floor(user.maxHP / 3)) {
        // Only boost Fire-type moves; engine passes move context indirectly via user state; simplified handled in engine applyFieldDamageMods cannot see move type here.
        return damage; // actual per-move boost will be handled in engine for now
      }
      return damage;
    },
  },
  torrent: { id: "torrent", name: "Torrent" },
  overgrow: { id: "overgrow", name: "Overgrow" },
  swift_swim: {
    id: "swift_swim",
    name: "Swift Swim",
    onModifySpeed: (pokemon, speed) => speed, // doubled in rain handled in engine
  },
  chlorophyll: {
    id: "chlorophyll",
    name: "Chlorophyll",
    onModifySpeed: (pokemon, speed) => speed, // doubled in sun handled in engine
  },
  huge_power: {
    id: "huge_power",
    name: "Huge Power",
    onModifyAtk: (pokemon, atk, category) => (category === "Physical" ? atk * 2 : atk),
  },
  pressure: {
    id: "pressure",
    name: "Pressure",
    // PP drain handled in engine when target has Pressure
  },
  drizzle: {
    id: "drizzle",
    name: "Drizzle",
    onSwitchIn: (pokemon, state, log) => {
      let turns = 5;
      if (pokemon.item && state && state) {
        // If holding Damp Rock, extend to 8
        turns = (require("../items") as any).Items[pokemon.item]?.onWeatherDuration?.("rain", turns) ?? turns;
      }
      state.field.weather = { id: "rain", turnsLeft: turns } as any;
      log(`It started to rain!`);
    },
  },
  drought: {
    id: "drought",
    name: "Drought",
    onSwitchIn: (pokemon, state, log) => {
      let turns = 5;
      if (pokemon.item && state && state) {
        turns = (require("../items") as any).Items[pokemon.item]?.onWeatherDuration?.("sun", turns) ?? turns;
      }
      state.field.weather = { id: "sun", turnsLeft: turns } as any;
      log(`The sunlight turned harsh!`);
    },
  },
  sand_stream: {
    id: "sand_stream",
    name: "Sand Stream",
    onSwitchIn: (pokemon, state, log) => {
      let turns = 5;
      if (pokemon.item && state && state) {
        turns = (require("../items") as any).Items[pokemon.item]?.onWeatherDuration?.("sandstorm", turns) ?? turns;
      }
      state.field.weather = { id: "sandstorm", turnsLeft: turns } as any;
      log(`A sandstorm kicked up!`);
    },
  },
  snow_warning: {
    id: "snow_warning",
    name: "Snow Warning",
    onSwitchIn: (pokemon, state, log) => {
      let turns = 5;
      if (pokemon.item && state && state) {
        turns = (require("../items") as any).Items[pokemon.item]?.onWeatherDuration?.("snow", turns) ?? turns;
      }
      state.field.weather = { id: "snow", turnsLeft: turns } as any;
      log(`It started to snow!`);
    },
  },
  cloud_nine: {
    id: "cloud_nine",
    name: "Cloud Nine",
  },
  air_lock: {
    id: "air_lock",
    name: "Air Lock",
  },
  // Guts: increases Attack by 50% if statused (simplified applied in getEffectiveAttack)
  rain_dish: {
    id: "rain_dish",
    name: "Rain Dish",
    onSwitchIn: (pokemon, state, log) => {},
  },
  solar_power: {
    id: "solar_power",
    name: "Solar Power",
  },
  sand_force: {
    id: "sand_force",
    name: "Sand Force",
  },
  slush_rush: {
    id: "slush_rush",
    name: "Slush Rush",
    onModifySpeed: (pokemon, speed) => speed, // doubled in snow handled in engine
  },
  overcoat: { id: "overcoat", name: "Overcoat" },
  ice_body: { id: "ice_body", name: "Ice Body" },
  snow_cloak: { id: "snow_cloak", name: "Snow Cloak" },
};

export function mergeAbilities(map: Record<string, Ability>) {
  for (const [k, v] of Object.entries(map)) {
    Abilities[k] = v;
  }
}
