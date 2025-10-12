import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, SWORDS_DANCE, TACKLE } from "./samples";

describe("Swords Dance", () => {
  it("Raises Attack by 2 stages and increases damage", () => {
    const atkMon = sampleMon("p1-1", "Boost", ["Normal"], defaultStats({ hp: 200, atk: 50 }), [SWORDS_DANCE, TACKLE]);
    const target = sampleMon("p2-1", "Dummy", ["Normal"], defaultStats({ hp: 200, def: 50 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [atkMon] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [target] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Baseline damage
    const hpBefore = p2.team[0].currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const baseDamage = hpBefore - p2.team[0].currentHP;

    // Reset target HP, apply SD, then attack
    p2.team[0].currentHP = p2.team[0].maxHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: SWORDS_DANCE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const hpBeforeBoost = p2.team[0].currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const boostedDamage = hpBeforeBoost - p2.team[0].currentHP;

    expect(boostedDamage).toBeGreaterThan(baseDamage);
  });
});
