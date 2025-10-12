import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, EARTHQUAKE, MAGIC_ROOM, TACKLE } from "./samples";

function mk(a: any, b: any): { p1: Player; p2: Player; eng: Engine } {
  const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
  const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
  const eng = new Engine({ seed: 1 });
  eng.initializeBattle([p1, p2], { seed: 1 });
  return { p1, p2, eng };
}

describe("Air Balloon and Ground immunity", () => {
  it("Air Balloon grants Ground immunity until popped", () => {
    const a = sampleMon("p1-1", "Quake", ["Ground"], defaultStats({ atk: 120 }), [EARTHQUAKE]);
    const b = sampleMon("p2-1", "Ballooner", ["Normal"], defaultStats({ hp: 300, def: 80 }), [TACKLE]);
    (b as any).item = "air_balloon";
    const { eng } = mk(a, b);
    // First EQ should do 0 and not pop the balloon (immunity, no damage)
    const hp1 = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: EARTHQUAKE.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(b.currentHP).toBe(hp1);
    // Hit with a Normal move to pop it
    a.moves = [TACKLE];
    const hp2 = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(b.currentHP).toBeLessThan(hp2);
    // Now Ground hit should connect
    a.moves = [EARTHQUAKE];
    const hp3 = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: EARTHQUAKE.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(b.currentHP).toBeLessThan(hp3);
  });

  it("Magic Room suppresses Air Balloon immunity", () => {
    const a = sampleMon("p1-1", "Quake", ["Ground"], defaultStats({ atk: 120 }), [EARTHQUAKE, MAGIC_ROOM]);
    const b = sampleMon("p2-1", "Ballooner", ["Normal"], defaultStats({ hp: 300, def: 80 }), [TACKLE]);
    (b as any).item = "air_balloon";
    const { eng } = mk(a, b);
    // Activate Magic Room
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: MAGIC_ROOM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    const hp = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: EARTHQUAKE.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(b.currentHP).toBeLessThan(hp);
  });
});
