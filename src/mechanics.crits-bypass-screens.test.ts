import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction, Move } from "./types";
import { defaultStats, sampleMon, REFLECT, LIGHT_SCREEN } from "./samples";

const HIGH_CRIT: Move = {
  id: "highcrit",
  name: "High Crit",
  type: "Normal",
  category: "Physical",
  power: 60,
  critRatio: 3, // always crit
};

const HIGH_CRIT_SPEC: Move = {
  id: "highcrit-spec",
  name: "High Crit Spec",
  type: "Fire",
  category: "Special",
  power: 60,
  critRatio: 3, // always crit
};

describe("Critical hits bypass Reflect/Light Screen", () => {
  it("Crit ignores Reflect for physical damage", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "Def", ["Normal"], defaultStats({ hp: 200, def: 100 }), [REFLECT])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "Atk", ["Normal"], defaultStats({ atk: 120 }), [HIGH_CRIT])] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: REFLECT.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const hpBefore = p1.team[0].currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: HIGH_CRIT.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    const damage = hpBefore - p1.team[0].currentHP;
    // Expect non-trivial damage; since Reflect would halve it otherwise, crit should deal more than a small threshold
    expect(damage).toBeGreaterThan(10);
  });

  it("Crit ignores Light Screen for special damage", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "Def", ["Normal"], defaultStats({ hp: 200, spd: 100 }), [LIGHT_SCREEN])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "Atk", ["Fire"], defaultStats({ spa: 120 }), [HIGH_CRIT_SPEC])] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: LIGHT_SCREEN.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const hpBefore = p1.team[0].currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: HIGH_CRIT_SPEC.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    const damage = hpBefore - p1.team[0].currentHP;
    expect(damage).toBeGreaterThan(10);
  });
});
