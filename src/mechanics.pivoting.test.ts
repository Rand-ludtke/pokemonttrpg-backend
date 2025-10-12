import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, U_TURN, VOLT_SWITCH, TACKLE } from "./samples";

describe("Pivoting moves (U-turn / Volt Switch)", () => {
  it("U-turn switches the user out after damage to next healthy bench", () => {
    const a1 = sampleMon("p1-1", "Lead", ["Bug"], defaultStats({ hp: 120, atk: 80 }), [U_TURN]);
    const a2 = sampleMon("p1-2", "Pivot", ["Normal"], defaultStats({ hp: 120 }), [TACKLE]);
    const b1 = sampleMon("p2-1", "Target", ["Normal"], defaultStats({ hp: 150 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a1, a2] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b1] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    const act: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: U_TURN.id, targetPlayerId: "p2", targetPokemonId: "p2-1" };
    engine.processTurn([act]);
    expect(p1.activeIndex).toBe(1);
  });

  it("Volt Switch also pivots after damage if user survives", () => {
    const a1 = sampleMon("p1-1", "Lead", ["Electric"], defaultStats({ hp: 120, spa: 80 }), [VOLT_SWITCH]);
    const a2 = sampleMon("p1-2", "Pivot", ["Normal"], defaultStats({ hp: 120 }), [TACKLE]);
    const b1 = sampleMon("p2-1", "Target", ["Normal"], defaultStats({ hp: 150 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a1, a2] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b1] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    const act: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: VOLT_SWITCH.id, targetPlayerId: "p2", targetPokemonId: "p2-1" };
    engine.processTurn([act]);
    expect(p1.activeIndex).toBe(1);
  });
});
