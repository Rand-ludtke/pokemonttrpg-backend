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
  // Guts: increases Attack by 50% if statused (simplified applied in getEffectiveAttack)
};
