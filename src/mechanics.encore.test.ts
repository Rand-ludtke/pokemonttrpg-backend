import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, CALM_MIND, ENCORE } from "./samples";

// Contract:
// - If target has a lastMoveId, Encore sets encoreMoveId and encoreTurns = 3
// - While encored, target is forced to repeat lastMoveId when it attempts any move
// - Encore ends after duration and the target can pick any move again

describe("Encore mechanics", () => {
  it("forces the target to repeat last move for 3 turns and then ends", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [ENCORE, TACKLE])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "B", ["Psychic"], defaultStats({ hp: 100 }), [CALM_MIND, TACKLE])] };
    const engine = new Engine({ seed: 7 });
    engine.initializeBattle([p1, p2], { seed: 7 });

    // First have P2 use Calm Mind to set lastMoveId
    engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: CALM_MIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);

    // Now P1 uses Encore on P2
    let res = engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: ENCORE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/Encore/);

    // While encored, P2 attempts to use Tackle but should be forced to Calm Mind again
    res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/Calm Mind/);

    // Tick a couple more turns; encore should end at the end of the next one or two turns
    const res4 = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);
    const res5 = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);

    // After 3 total encored turns, Encore ends; end message should appear in one of these turn results
    const sawEnd = /Encore ended/i.test(res4.events.join("\n")) || /Encore ended/i.test(res5.events.join("\n"));
    expect(sawEnd).toBe(true);

    // Now P2 can choose a different move again; using Tackle should be acknowledged as Tackle
    res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);
    expect(res.events.join("\n")).toMatch(/used Tackle/);
  });
});
