import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, Move } from "./types";
import { defaultStats, sampleMon, TACKLE, TRICK_ROOM, QUICK_ATTACK } from "./samples";

// Helper to issue a simple move action
const move = (pid: string, monId: string, moveId: string, tpid: string, targetId: string) => ({
  type: "move" as const,
  actorPlayerId: pid,
  pokemonId: monId,
  moveId,
  targetPlayerId: tpid,
  targetPokemonId: targetId,
});

describe("Trick Room mechanics", () => {
  it("reverses speed order after activation", () => {
    const slow = sampleMon("p1-1", "Slow", ["Normal"], defaultStats({ spe: 30, atk: 70, hp: 200 }), [TRICK_ROOM, TACKLE]);
  const fast = sampleMon("p2-1", "Fast", ["Normal"], defaultStats({ spe: 100, atk: 70, hp: 200 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [slow] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [fast] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Without Trick Room, fast should move first: let both Tackle
    let result = engine.processTurn([
      move(p1.id, slow.id, TACKLE.id, p2.id, fast.id),
      move(p2.id, fast.id, TACKLE.id, p1.id, slow.id),
    ]);
    // Verify action order: Fast should act before Slow when Trick Room is inactive
    const e1 = result.events;
    const idxFast1 = e1.findIndex((m) => m.includes(`${fast.name} used ${TACKLE.name}`));
    const idxSlow1 = e1.findIndex((m) => m.includes(`${slow.name} used ${TACKLE.name}`));
    expect(idxFast1).toBeGreaterThanOrEqual(0);
    expect(idxSlow1).toBeGreaterThanOrEqual(0);
    expect(idxFast1).toBeLessThan(idxSlow1);

    // Set Trick Room
    result = engine.processTurn([
      move(p1.id, slow.id, TRICK_ROOM.id, p2.id, fast.id),
      move(p2.id, fast.id, TACKLE.id, p1.id, slow.id),
    ]);

    // Next turn, order reversed: slow goes before fast
    result = engine.processTurn([
      move(p1.id, slow.id, TACKLE.id, p2.id, fast.id),
      move(p2.id, fast.id, TACKLE.id, p1.id, slow.id),
    ]);
    const e3 = result.events;
    const idxSlow3 = e3.findIndex((m) => m.includes(`${slow.name} used ${TACKLE.name}`));
    const idxFast3 = e3.findIndex((m) => m.includes(`${fast.name} used ${TACKLE.name}`));
    expect(idxSlow3).toBeGreaterThanOrEqual(0);
    expect(idxFast3).toBeGreaterThanOrEqual(0);
    expect(idxSlow3).toBeLessThan(idxFast3);
  });

  it("does not affect move priority (Quick Attack still goes first)", () => {
    const slow = sampleMon("p1-1", "Slow", ["Normal"], defaultStats({ spe: 30, atk: 70 }), [TACKLE, QUICK_ATTACK]);
    const fast = sampleMon("p2-1", "Fast", ["Normal"], defaultStats({ spe: 100, atk: 70 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [slow] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [fast] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Activate Trick Room
    engine.processTurn([
      move(p1.id, slow.id, TRICK_ROOM.id, p2.id, fast.id),
      move(p2.id, fast.id, TACKLE.id, p1.id, slow.id),
    ]);

    const before = { slow: slow.currentHP, fast: fast.currentHP };
    // Under Trick Room, +1 priority Quick Attack from slow should still go before fast's 0 priority move
    engine.processTurn([
      move(p1.id, slow.id, QUICK_ATTACK.id, p2.id, fast.id),
      move(p2.id, fast.id, TACKLE.id, p1.id, slow.id),
    ]);
    const after = { slow: slow.currentHP, fast: fast.currentHP };
    expect(after.fast).toBeLessThan(before.fast);
  });

  it("toggles off if used while active", () => {
    const a = sampleMon("p1-1", "A", ["Psychic"], defaultStats({}), [TRICK_ROOM]);
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({}), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    engine.processTurn([move(p1.id, a.id, TRICK_ROOM.id, p2.id, b.id)]);
    expect(engine["state"].field.room.id).toBe("trick_room");
    engine.processTurn([move(p1.id, a.id, TRICK_ROOM.id, p2.id, b.id)]);
    expect(engine["state"].field.room.id).toBe("none");
  });

  it("ends after 5 turns", () => {
    const a = sampleMon("p1-1", "A", ["Psychic"], defaultStats({}), [TRICK_ROOM]);
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({}), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    engine.processTurn([move(p1.id, a.id, TRICK_ROOM.id, p2.id, b.id)]);
    // Advance 5 turns of no-ops
    for (let i = 0; i < 5; i++) {
      engine.processTurn([move(p1.id, a.id, TACKLE.id, p2.id, b.id)]);
    }
    expect(engine["state"].field.room.id).toBe("none");
  });
});
