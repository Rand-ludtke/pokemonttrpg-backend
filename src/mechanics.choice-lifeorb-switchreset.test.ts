import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE } from "./samples";

const LOW_POWER = { ...TACKLE, id: "tackle-low", name: "Tackle Low", power: 20 };

describe("Choice lock, Life Orb timing, switch reset", () => {
  it("Choice items lock into first selected move until switch", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100, atk: 60 }), [TACKLE, LOW_POWER]);
    a.item = "choice_band";
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Use Tackle to set the lock
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    // Attempt to use a different move should be blocked
    const res = engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: LOW_POWER.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    expect(res.events.join("\n")).toMatch(/locked into/i);

    // Switch out clears lock
    const bench = sampleMon("p1-2", "A2", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    p1.team.push(bench);
    engine.processTurn([{ type: "switch", actorPlayerId: "p1", pokemonId: "p1-1", toIndex: 1 } as any]);
    engine.processTurn([{ type: "switch", actorPlayerId: "p1", pokemonId: "p1-2", toIndex: 0 } as any]);
    const res2 = engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: LOW_POWER.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    expect(res2.events.join("\n")).toMatch(/used Tackle Low/i);
  });

  it("Life Orb only recoils after successful damaging move", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100, atk: 60 }), [TACKLE]);
    a.item = "life_orb";
    const b = sampleMon("p2-1", "B", ["Ghost"], defaultStats({ hp: 100 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Tackle vs Ghost should deal 0 (it doesn't affect...), so no recoil
    const before = a.currentHP;
    const r1 = engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    expect(r1.events.join("\n")).not.toMatch(/Life Orb/i);
    expect(a.currentHP).toBe(before);

    // Change target type to Normal; now damage occurs and recoil should apply
    b.types = ["Normal"];
    const before2 = a.currentHP;
    const r2 = engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    expect(r2.events.join("\n")).toMatch(/Life Orb/i);
    expect(a.currentHP).toBeLessThan(before2);
  });

  it("Switching out resets stat stages and volatiles (but keeps PP)", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Spend some PP and set a volatile
    (a.volatile as any).pp = (a.volatile as any).pp || {}; (a.volatile as any).pp[TACKLE.id] = 1;
    a.stages.atk = 2;
    (a.volatile as any).tauntTurns = 2;

    const bench = sampleMon("p1-2", "A2", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    p1.team.push(bench);
    engine.processTurn([{ type: "switch", actorPlayerId: "p1", pokemonId: "p1-1", toIndex: 1 } as any]);
    engine.processTurn([{ type: "switch", actorPlayerId: "p1", pokemonId: "p1-2", toIndex: 0 } as any]);

    expect(a.stages.atk).toBe(0);
    expect((a.volatile as any).tauntTurns).toBeUndefined();
    expect(((a.volatile as any).pp ?? {})[TACKLE.id]).toBe(1);
  });
});
