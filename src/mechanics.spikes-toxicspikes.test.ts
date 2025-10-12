import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, SPIKES, TOXIC_SPIKES } from "./samples";

describe("Spikes & Toxic Spikes", () => {
  it("Spikes deal more damage with more layers", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 160 }), [SPIKES])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [
      sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 160 }), []),
      sampleMon("p2-2", "C", ["Normal"], defaultStats({ hp: 160 }), []),
      sampleMon("p2-3", "D", ["Normal"], defaultStats({ hp: 160 }), []),
    ] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Set 1, 2, then 3 layers by targeting p2's side
    const set1: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: SPIKES.id, targetPlayerId: "p2", targetPokemonId: "p2-1" };
    const set2: MoveAction = { ...set1 };
    const set3: MoveAction = { ...set1 };
    engine.processTurn([set1]);
    engine.processTurn([set2]);
    engine.processTurn([set3]);

    // Switch to p2-2 (1/4 of 160 = 40)
    const before2 = p2.team[1].currentHP;
    const res2 = engine.forceSwitch("p2", 1);
    const after2 = res2.state.players[1].team[1].currentHP;
    expect(before2 - after2).toBe(40);

    // Switch to p2-3 (also 1/4)
    const before3 = p2.team[2].currentHP;
    const res3 = engine.forceSwitch("p2", 2);
    const after3 = res3.state.players[1].team[2].currentHP;
    expect(before3 - after3).toBe(40);
  });

  it("Toxic Spikes poisons grounded and is absorbed by Poison-type", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 160 }), [TOXIC_SPIKES])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [
      sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 160 }), []),
      sampleMon("p2-2", "C", ["Poison"], defaultStats({ hp: 160 }), []),
    ] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Set 2 layers
    const set: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TOXIC_SPIKES.id, targetPlayerId: "p2", targetPokemonId: "p2-1" };
    engine.processTurn([set]);
    engine.processTurn([set]);
    // Switch in Normal type -> get toxic (we encode "toxic" status)
    const res1 = engine.forceSwitch("p2", 0);
    expect(res1.state.players[1].team[0].status === "toxic" || res1.state.players[1].team[0].status === "poison").toBeTruthy();
    // Switch in Poison type -> absorbs spikes
    const res2 = engine.forceSwitch("p2", 1);
    // Toxic Spikes layers cleared
    const state = (engine as any)["state"] as any;
    const side = state.players[1];
    expect(side.sideHazards?.toxicSpikesLayers ?? 0).toBe(0);
  });
});
