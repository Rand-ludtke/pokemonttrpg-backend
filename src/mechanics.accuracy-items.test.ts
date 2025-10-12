import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player } from "./types";
import { defaultStats, sampleMon, TACKLE, ROCK_THROW } from "./samples";

const move = (pid: string, monId: string, moveId: string, tpid: string, targetId: string) => ({
  type: "move" as const,
  actorPlayerId: pid,
  pokemonId: monId,
  moveId,
  targetPlayerId: tpid,
  targetPokemonId: targetId,
});

describe("Accuracy items (Bright Powder / Lax Incense)", () => {
  it("Bright Powder reduces hit chance (~10%)", () => {
    const atk = sampleMon("p1-1", "Atk", ["Rock"], defaultStats({ atk: 100 }), [ROCK_THROW]);
    const def = sampleMon("p2-1", "Def", ["Normal"], defaultStats({ hp: 200 }), [TACKLE]);
    def.item = "bright_powder" as any;
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [atk] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [def] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    let hits = 0, attempts = 20;
    for (let i = 0; i < attempts; i++) {
      const before = def.currentHP;
      engine.processTurn([move(p1.id, atk.id, ROCK_THROW.id, p2.id, def.id)]);
      if (def.currentHP < before) hits++;
    }
    // With 90% accuracy effectively (from 100% to ~90 after item), expect fewer than attempts hits
    expect(hits).toBeLessThan(attempts);
  });

  it("Lax Incense reduces hit chance (~10%)", () => {
    const atk = sampleMon("p1-1", "Atk", ["Rock"], defaultStats({ atk: 100 }), [ROCK_THROW]);
    const def = sampleMon("p2-1", "Def", ["Normal"], defaultStats({ hp: 200 }), [TACKLE]);
    def.item = "lax_incense" as any;
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [atk] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [def] };
    const engine = new Engine({ seed: 2 });
    engine.initializeBattle([p1, p2], { seed: 2 });

    let hits = 0, attempts = 20;
    for (let i = 0; i < attempts; i++) {
      const before = def.currentHP;
      engine.processTurn([move(p1.id, atk.id, ROCK_THROW.id, p2.id, def.id)]);
      if (def.currentHP < before) hits++;
    }
    expect(hits).toBeLessThan(attempts);
  });
});
