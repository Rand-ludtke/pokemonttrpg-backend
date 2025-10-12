import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, CALM_MIND, TORMENT } from "./samples";

describe("Torment mechanics", () => {
  it("prevents using the same move consecutively while active and ends after duration", () => {
    const p1mon = sampleMon("p1-1", "A", ["Dark"], defaultStats({ hp: 100 }), [TORMENT]);
    const p2mon = sampleMon("p2-1", "B", ["Psychic"], defaultStats({ hp: 100 }), [CALM_MIND, TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [p1mon] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [p2mon] };
    const engine = new Engine({ seed: 9 });
    engine.initializeBattle([p1, p2], { seed: 9 });

    // P2 uses Calm Mind
    engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    // P1 uses Torment on P2
    engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TORMENT.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);

    // P2 tries Calm Mind again immediately; should be blocked
    let res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/can't use .* due to Torment/i);

    // P2 can use a different move
    res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/used Tackle/i);

    // Tick turns for Torment to end
    const r1 = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);
    const r2 = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);
    const r3 = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);

  // Torment ended message should appear around these turns (often at end of the immediate Tackle turn)
  const ended = /no longer tormented/i.test(res.events.join("\n")) || /no longer tormented/i.test(r1.events.join("\n")) || /no longer tormented/i.test(r2.events.join("\n")) || /no longer tormented/i.test(r3.events.join("\n"));
    expect(ended).toBe(true);

    // Now can use Calm Mind again
    res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/rose/i);
  });
});
