import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, NASTY_PLOT, CALM_MIND, EMBER } from "./samples";

describe("Nasty Plot and Calm Mind", () => {
  it("Nasty Plot raises Sp. Atk by 2 stages and increases special damage", () => {
    const attacker = sampleMon("p1-1", "SPA", ["Fire"], defaultStats({ hp: 200, spa: 50 }), [NASTY_PLOT, EMBER]);
    const target = sampleMon("p2-1", "Dummy", ["Normal"], defaultStats({ hp: 200, spd: 50 }), []);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [attacker] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [target] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    const hpBeforeBase = target.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: EMBER.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const baseDamage = hpBeforeBase - target.currentHP;

    // Reset HP and apply Nasty Plot, then attack again
    target.currentHP = target.maxHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: NASTY_PLOT.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const hpBeforeBoost = target.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: EMBER.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const boostedDamage = hpBeforeBoost - target.currentHP;

    expect(boostedDamage).toBeGreaterThan(baseDamage);
  });

  it("Calm Mind raises Sp. Def and reduces incoming special damage", () => {
    const attacker = sampleMon("p1-1", "SPA", ["Fire"], defaultStats({ hp: 200, spa: 60 }), [EMBER]);
    const defender = sampleMon("p2-1", "CM", ["Normal"], defaultStats({ hp: 200, spd: 50 }), [CALM_MIND]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [attacker] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [defender] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    const hpBeforeBase = defender.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: EMBER.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const baseDamage = hpBeforeBase - defender.currentHP;

    // Reset HP, apply Calm Mind, then take the hit again
    defender.currentHP = defender.maxHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    const hpBefore = defender.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: EMBER.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const reducedDamage = hpBefore - defender.currentHP;

    expect(reducedDamage).toBeLessThan(baseDamage);
  });
});
