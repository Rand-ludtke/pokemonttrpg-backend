import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction, Move } from "./types";
import { defaultStats, sampleMon, MAGNET_RISE, TACKLE } from "./samples";

const EARTHQUAKE: Move = {
  id: "earthquake",
  name: "Earthquake",
  type: "Ground",
  category: "Physical",
  power: 100,
  accuracy: 100,
};

describe("Grounded nuances: Magnet Rise, Air Balloon, grounded hazards", () => {
  it("Magnet Rise prevents Ground damage and expires after turns", () => {
    const def = sampleMon("p1-1", "Lev", ["Normal"], defaultStats({ hp: 200 }), [MAGNET_RISE]);
    const atk = sampleMon("p2-1", "Atk", ["Ground"], defaultStats({ atk: 100 }), [EARTHQUAKE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [def] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [atk] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Use Magnet Rise
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: MAGNET_RISE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const hpBefore = def.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: EARTHQUAKE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    const dmg = hpBefore - def.currentHP;
    expect(dmg).toBe(0);

    // Fast-forward 5 more turns to expire Magnet Rise
    for (let i = 0; i < 5; i++) {
      engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    }
    const hpBefore2 = def.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: EARTHQUAKE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    expect(def.currentHP).toBeLessThan(hpBefore2);
  });

  it("Air Balloon prevents Ground damage until popped by taking damage", () => {
    const def = sampleMon("p1-1", "Balloon", ["Normal"], defaultStats({ hp: 200 }), []);
    def.item = "air_balloon";
    const atk = sampleMon("p2-1", "Atk", ["Normal"], defaultStats({ atk: 100 }), [TACKLE, EARTHQUAKE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [def] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [atk] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Ground move should be blocked initially
    const hpBefore = def.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: EARTHQUAKE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    expect(def.currentHP).toBe(hpBefore);

    // Pop balloon with Tackle
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    expect(def.item).toBeUndefined();

    // Now Ground move should hit
    const before2 = def.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: EARTHQUAKE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    expect(def.currentHP).toBeLessThan(before2);
  });
});
