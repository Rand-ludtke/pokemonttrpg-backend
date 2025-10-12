import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, TAUNT, RECOVER } from "./samples";

// Tests:
// - Recover heals 50%
// - Recover is blocked by Taunt while taunted

describe("Recover and Taunt interactions", () => {
  it("heals 50% of max HP when used", () => {
    const mon = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [RECOVER]);
    mon.currentHP = 30;
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [mon] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 100 }), [TACKLE])] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    const res = engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: RECOVER.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);
    // should heal 50
    expect(res.events.join("\n")).toMatch(/recovered health/i);
    expect(mon.currentHP).toBe(80);
  });

  it("is blocked by Taunt while active", () => {
    const p1mon = sampleMon("p1-1", "A", ["Dark"], defaultStats({ hp: 100 }), [TAUNT]);
    const p2mon = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 100 }), [RECOVER]);
    p2mon.currentHP = 40;
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [p1mon] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [p2mon] };
    const engine = new Engine({ seed: 2 });
    engine.initializeBattle([p1, p2], { seed: 2 });

    // P1 Taunts P2
    engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TAUNT.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);

    // P2 tries Recover; should be blocked by Taunt
    const res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: RECOVER.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/can't use status moves due to Taunt/i);
    expect(p2mon.currentHP).toBe(40);
  });
});
