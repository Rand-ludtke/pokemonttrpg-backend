import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, STICKY_WEB, RAPID_SPIN, DEFOG } from "./samples";

describe("Sticky Web and Hazard Clearing", () => {
  it("Sticky Web lowers Speed stage on grounded switch-in", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Bug"], defaultStats({ hp: 100 }), [STICKY_WEB])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [
      sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 100, spe: 100 }), []),
      sampleMon("p2-2", "C", ["Normal"], defaultStats({ hp: 100, spe: 100 }), []),
    ] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    const set: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: STICKY_WEB.id, targetPlayerId: "p2", targetPokemonId: "p2-1" };
    engine.processTurn([set]);
    // Switch to p2-2 and check speed stage reduced by 1
    const before = p2.team[1].stages.spe ?? 0;
    engine.forceSwitch("p2", 1);
    const after = p2.team[1].stages.spe ?? 0;
    expect(after).toBe(before - 1);
  });

  it("Rapid Spin clears own hazards; Defog clears both", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [RAPID_SPIN, DEFOG])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 100 }), [])] };
    const engine = new Engine({ seed: 1 });
    const state = engine.initializeBattle([p1, p2], { seed: 1 });

    // Manually set hazards on p1's side
    state.players[0].sideHazards = { stealthRock: true, spikesLayers: 3, toxicSpikesLayers: 2, stickyWeb: true } as any;
    // Rapid Spin clears own
    const spin: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: RAPID_SPIN.id, targetPlayerId: "p2", targetPokemonId: "p2-1" };
    engine.processTurn([spin]);
    expect(state.players[0].sideHazards?.stealthRock).toBe(false);
    expect(state.players[0].sideHazards?.spikesLayers).toBe(0);
    expect(state.players[0].sideHazards?.toxicSpikesLayers).toBe(0);
    expect(state.players[0].sideHazards?.stickyWeb).toBe(false);

    // Set hazards on both sides then Defog
    state.players[0].sideHazards = { stealthRock: true, spikesLayers: 1, toxicSpikesLayers: 1, stickyWeb: true } as any;
    state.players[1].sideHazards = { stealthRock: true, spikesLayers: 1, toxicSpikesLayers: 1, stickyWeb: true } as any;
    const defog: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: DEFOG.id, targetPlayerId: "p2", targetPokemonId: "p2-1" };
    engine.processTurn([defog]);
    for (const side of state.players) {
      expect(side.sideHazards?.stealthRock).toBe(false);
      expect(side.sideHazards?.spikesLayers).toBe(0);
      expect(side.sideHazards?.toxicSpikesLayers).toBe(0);
      expect(side.sideHazards?.stickyWeb).toBe(false);
    }
  });
});
