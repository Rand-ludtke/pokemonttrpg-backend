import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, TAUNT, PROTECT, CALM_MIND } from "./samples";

describe("Taunt mechanics", () => {
  it("blocks Status-category moves while taunted and expires after duration", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Dark"], defaultStats({ hp: 100 }), [TAUNT, TACKLE])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "B", ["Psychic"], defaultStats({ hp: 100 }), [CALM_MIND, PROTECT])] };
    const engine = new Engine({ seed: 2 });
    engine.initializeBattle([p1, p2], { seed: 2 });

    // P1 uses Taunt on P2
    let res = engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TAUNT.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/fell for the Taunt/i);

    // While taunted, P2 attempts a Status move (Calm Mind) and gets blocked
    res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/can't use status moves/i);

    // Advance turns until Taunt expires (set to 3 turns). We'll use Tackle from P1 to tick EOT.
    let sawEnd = false;
    for (let i = 0; i < 3; i++) {
      res = engine.processTurn([
        { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
      ]);
      if (/no longer taunted/i.test(res.events.join("\n"))) {
        sawEnd = true;
        break;
      }
    }
    expect(sawEnd).toBe(true);

    // Now Status moves should work again
    res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/rose/i);
  });

  it("reapplying Taunt refreshes the duration", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Dark"], defaultStats({ hp: 100 }), [TAUNT, TACKLE])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "B", ["Psychic"], defaultStats({ hp: 100 }), [CALM_MIND])] };
    const engine = new Engine({ seed: 3 });
    engine.initializeBattle([p1, p2], { seed: 3 });

    // Apply Taunt twice across turns
    engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TAUNT.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);

    // One tick
    engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);

    // Reapply before it ends
    let res = engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TAUNT.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/fell for the Taunt/i);

    // Attempt Calm Mind again should still be blocked
    res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/can't use status moves/i);
  });
});
