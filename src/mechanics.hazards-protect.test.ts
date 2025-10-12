import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, PROTECT, STEALTH_ROCK } from "./samples";

describe("Protect and Stealth Rock", () => {
  it("Protect blocks a damaging move", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [PROTECT])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 100, atk: 120 }), [TACKLE])] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // A uses Protect, B uses Tackle
    const a1: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: p1.team[0].id, moveId: PROTECT.id, targetPlayerId: "p2", targetPokemonId: p2.team[0].id };
    const a2: MoveAction = { type: "move", actorPlayerId: "p2", pokemonId: p2.team[0].id, moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: p1.team[0].id };
    const before = p1.team[0].currentHP;
    const res = engine.processTurn([a1, a2]);
    expect(p1.team[0].currentHP).toBe(before);
    expect(res.events.some(e => e.includes("protected itself"))).toBeTruthy();
  });

  it("Stealth Rock damages on switch-in with type scaling", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 160 }), [STEALTH_ROCK])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [
      sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 160 }), [TACKLE]),
      sampleMon("p2-2", "C", ["Fire"], defaultStats({ hp: 160 }), [TACKLE]),
    ] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Set SR on foe side
    const set = engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: STEALTH_ROCK.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    // Force switch p2 to index 1
    const before = p2.team[1].currentHP;
    const res = engine.forceSwitch("p2", 1);
    const after = res.state.players[1].team[1].currentHP;
    expect(after).toBeLessThan(before);
  // Rock vs Fire is super-effective (2x), so expect 1/8 * 2 of 160 = 40
  expect(before - after).toBe(40);
  });
});
