import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player } from "./types";
import { defaultStats, sampleMon, TACKLE } from "./samples";

describe("Engine.forceSwitch", () => {
  it("switches active without advancing turn and emits switch", () => {
    const p1: Player = {
      id: "p1",
      name: "P1",
      activeIndex: 0,
      team: [
        sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]),
        sampleMon("p1-2", "B", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]),
      ],
    };
    const p2: Player = {
      id: "p2",
      name: "P2",
      activeIndex: 0,
      team: [sampleMon("p2-1", "X", ["Normal"], defaultStats({ hp: 100 }), [TACKLE])],
    };
    const engine = new Engine({ seed: 1 });
    const state = engine.initializeBattle([p1, p2], { seed: 1 });
    const turnBefore = state.turn;
    const res = engine.forceSwitch("p1", 1);
    // activeIndex updated
    expect(res.state.players[0].activeIndex).toBe(1);
    // turn did not advance
    expect(res.state.turn).toBe(turnBefore);
    // anim includes switch
    expect(res.anim.some(a => a.type === "switch")).toBeTruthy();
    // simple event
    expect(res.events[0]).toContain("switched to");
  });
});
