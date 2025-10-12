import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, CALM_MIND, DISABLE } from "./samples";

describe("Disable mechanics", () => {
  it("blocks the last move for 3 turns, allows others, and ends", () => {
    const p1mon = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [DISABLE]);
    const p2mon = sampleMon("p2-1", "B", ["Psychic"], defaultStats({ hp: 100 }), [CALM_MIND, TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [p1mon] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [p2mon] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // P2 uses Calm Mind to set lastMoveId
    engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);

    // P1 uses Disable on P2
    engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: DISABLE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);

    // P2 tries Calm Mind again; should be blocked
    let res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/can't use/i);

    // P2 can still use Tackle
    res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/used Tackle/i);

    // Tick a few turns to let Disable wear off
    const r1 = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);
    const r2 = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);

    // At this point Disable should have ended; it may have ended at the end of the prior turn as well
    const ended = /Disable wore off/i.test(res.events.join("\n")) || /Disable wore off/i.test(r1.events.join("\n")) || /Disable wore off/i.test(r2.events.join("\n"));
    expect(ended).toBe(true);

    // Calm Mind should now be usable again
    res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/rose/i);
  });
});
