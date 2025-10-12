import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player } from "./types";
import { defaultStats, sampleMon, STEALTH_ROCK } from "./samples";

describe("Heavy-Duty Boots", () => {
  it("Prevents Stealth Rock damage, Spikes damage, Toxic Spikes poison, and Sticky Web speed drop on switch-in", () => {
    const setter = sampleMon("p1-1", "Setter", ["Rock"], defaultStats({ hp: 120 }), [STEALTH_ROCK]);
    const target1 = sampleMon("p2-1", "BootsMon", ["Normal"], defaultStats({ hp: 100, spe: 50 }), []);
    target1.item = "heavy-duty-boots";
    const target2 = sampleMon("p2-2", "Bench", ["Normal"], defaultStats({ hp: 100, spe: 50 }), []);

    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [setter] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [target1, target2] };

    const engine = new Engine({ seed: 1 });
    const state = engine.initializeBattle([p1, p2], { seed: 1 });

    // Set up all hazards on p2 side
    state.players[1].sideHazards = { stealthRock: true, spikesLayers: 3, toxicSpikesLayers: 2, stickyWeb: true } as any;

    const beforeHP = p2.team[0].currentHP;
    const beforeSpeStage = p2.team[0].stages.spe ?? 0;
    // Force a switch-in event for p2 active (already in); re-emit switch_in to apply hazard logic
    engine.forceSwitch("p2", 0);

    // Assert no changes due to Boots
    expect(p2.team[0].currentHP).toBe(beforeHP);
    expect(p2.team[0].stages.spe ?? 0).toBe(beforeSpeStage);
    expect(p2.team[0].status).toBe("none");
  });
});
