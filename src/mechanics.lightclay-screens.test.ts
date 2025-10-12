import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, REFLECT, LIGHT_SCREEN, TACKLE } from "./samples";

describe("Light Clay extends screens", () => {
  it("Reflect and Light Screen set longer durations with Light Clay", () => {
    const screener = sampleMon("p1-1", "Screen", ["Psychic"], defaultStats({ hp: 100 }), [REFLECT, LIGHT_SCREEN]);
    screener.item = "light_clay";
    const foe = sampleMon("p2-1", "Foe", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [screener] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [foe] };
    const engine = new Engine({ seed: 1 });
    const state = engine.initializeBattle([p1, p2], { seed: 1 });

    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: REFLECT.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: LIGHT_SCREEN.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);

    // After each processTurn, durations decrement by 1 at end of turn, so expect >= 7
    expect(state.players[0].sideConditions?.reflectTurns).toBeGreaterThanOrEqual(7);
    expect(state.players[0].sideConditions?.lightScreenTurns).toBeGreaterThanOrEqual(7);
  });
});
