import { describe, it, expect, vi } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE } from "./samples";

// Helper to cause a faint then require a switch
function koMove(power = 200) {
  return { id: `nuke${power}`, name: "Nuke", type: "Normal", category: "Physical" as const, power, accuracy: 100 };
}

describe("forced-switch phase transitions", () => {
  it("detects needsSwitch after a KO and handles forceSwitch calls without advancing turn", () => {
    const nuke = koMove(300);
    const p1: Player = {
      id: "p1", name: "P1", activeIndex: 0,
      team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ atk: 150, hp: 100 }), [nuke as any, TACKLE]), sampleMon("p1-2", "B", ["Normal"], defaultStats({ hp: 100 }), [TACKLE])],
    };
    const p2: Player = {
      id: "p2", name: "P2", activeIndex: 0,
      team: [sampleMon("p2-1", "X", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]), sampleMon("p2-2", "Y", ["Normal"], defaultStats({ hp: 100 }), [TACKLE])],
    };
    const engine = new Engine({ seed: 1 });
    const state = engine.initializeBattle([p1, p2], { seed: 1 });
    const a1: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: p1.team[0].id, moveId: nuke.id, targetPlayerId: "p2", targetPokemonId: p2.team[0].id };
    const a2: MoveAction = { type: "move", actorPlayerId: "p2", pokemonId: p2.team[0].id, moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: p1.team[0].id };
    const result = engine.processTurn([a1, a2]);
    // p2 active fainted; needs switch
    const fainted = result.state.players[1].team[0].currentHP <= 0;
    expect(fainted).toBe(true);
    const turnBefore = result.state.turn;
    const res2 = engine.forceSwitch("p2", 1);
    expect(res2.state.players[1].activeIndex).toBe(1);
    expect(res2.state.turn).toBe(turnBefore);
  });
});
