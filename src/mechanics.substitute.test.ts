import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, SUBSTITUTE, WILL_O_WISP } from "./samples";

describe("Substitute mechanics", () => {
  it("redirects damage to the substitute and breaks when HP hits 0", () => {
    const user = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100, atk: 70 }), [SUBSTITUTE]);
    const foe = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 100, atk: 70 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [user] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [foe] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Put up Substitute (cost 25 HP)
    engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: SUBSTITUTE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);

    const subHP = (user.volatile as any).substituteHP as number;
    expect(subHP).toBeGreaterThan(0);
    const hpAfterSub = user.currentHP;
    expect(hpAfterSub).toBe(75);

    // Opponent attacks; damage should go to sub first
    const res = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);

    // User HP should remain 75 or higher (no damage to user until sub breaks)
    expect(user.currentHP).toBe(75);
    // Eventually sub should break; we check for the fade message appearing within a couple of turns
    const res2 = engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);
    const messages = [res.events.join("\n"), res2.events.join("\n")].join("\n");
    expect(messages).toMatch(/substitute faded/i);
  });

  it("blocks status application while active", () => {
    const user = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [SUBSTITUTE]);
    const foe = sampleMon("p2-1", "B", ["Fire"], defaultStats({ hp: 100 }), [WILL_O_WISP]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [user] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [foe] };
    const engine = new Engine({ seed: 2 });
    engine.initializeBattle([p1, p2], { seed: 2 });

    // Put up Substitute
    engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: SUBSTITUTE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);

    // Foe tries to burn through Substitute; should be blocked
    engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: WILL_O_WISP.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction,
    ]);

    expect(user.status).toBe("none");
  });
});
