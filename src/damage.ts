import { Category, Move, Pokemon } from "./types";
import { typeEffectiveness } from "./data/type-chart";

export interface DamageEnv {
  rng: () => number; // 0..1
}

// Very simplified damage formula inspired by Showdown (not exact parity yet)
export function calcDamage(
  user: Pokemon,
  target: Pokemon,
  move: Move,
  atk: number,
  def: number,
  env: DamageEnv
): { damage: number; effectiveness: number; stab: number; roll: number } {
  const level = user.level;
  const power = move.power ?? 0;
  // Base damage skeleton: (((2L/5+2) * P * A / D) / 50) + 2
  const base = Math.floor((((2 * level) / 5 + 2) * power * atk) / Math.max(1, def) / 50) + 2;
  const stab = user.types.includes(move.type) ? 1.5 : 1;
  const eff = typeEffectiveness(move.type, target.types);
  const roll = 0.85 + env.rng() * 0.15; // 0.85..1.0
  const dmg = Math.max(1, Math.floor(base * stab * eff * roll));
  return { damage: dmg, effectiveness: eff, stab, roll };
}

export function chooseDefenseStat(target: Pokemon, category: Category) {
  return category === "Physical" ? target.baseStats.def : target.baseStats.spd;
}
