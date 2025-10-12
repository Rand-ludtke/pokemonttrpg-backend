import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, WATER_GUN, THUNDERSHOCK, EMBER, TACKLE } from "./samples";

describe("Absorb abilities", () => {
  it("Water Absorb heals and negates damage", () => {
    const atk = sampleMon("p1-1", "A", ["Normal"], defaultStats({ spa: 70 }), [WATER_GUN]);
    const tgt = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 120 }), [TACKLE]);
    tgt.ability = "water_absorb";
    tgt.currentHP = 60; // half
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [atk] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [tgt] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    const before = tgt.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: atk.id, moveId: WATER_GUN.id, targetPlayerId: p2.id, targetPokemonId: tgt.id } as MoveAction]);
    expect(tgt.currentHP).toBeGreaterThan(before);
  });

  it("Volt Absorb heals and negates damage", () => {
    const atk = sampleMon("p1-1", "A", ["Normal"], defaultStats({ spa: 70 }), [THUNDERSHOCK]);
    const tgt = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 120 }), [TACKLE]);
    tgt.ability = "volt_absorb";
    tgt.currentHP = 60;
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [atk] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [tgt] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    const before = tgt.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: atk.id, moveId: THUNDERSHOCK.id, targetPlayerId: p2.id, targetPokemonId: tgt.id } as MoveAction]);
    expect(tgt.currentHP).toBeGreaterThan(before);
  });

  it("Flash Fire grants a Fire boost when hit by Fire, then boosts user's Fire moves", () => {
    const atk = sampleMon("p1-1", "A", ["Normal"], defaultStats({ spa: 70 }), [EMBER]);
    const tgt = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 120, spa: 70 }), [EMBER]);
    tgt.ability = "flash_fire";
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [atk] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [tgt] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // First, trigger Flash Fire on tgt by hitting it with Fire (negates damage)
    const hpBefore = tgt.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: atk.id, moveId: EMBER.id, targetPlayerId: p2.id, targetPokemonId: tgt.id } as MoveAction]);
    expect(tgt.currentHP).toBe(hpBefore); // no damage taken

    // Now tgt attacks with Ember and should have boosted damage vs atk (compare two hits)
    const hpBefore2 = atk.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: tgt.id, moveId: EMBER.id, targetPlayerId: p1.id, targetPokemonId: atk.id } as MoveAction]);
    const dmgBoosted = hpBefore2 - atk.currentHP;

    // Clear flash fire, attack again and compare
    (tgt.volatile as any).flashFireBoost = false;
    const hpBefore3 = atk.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: tgt.id, moveId: EMBER.id, targetPlayerId: p1.id, targetPokemonId: atk.id } as MoveAction]);
    const dmgNormal = hpBefore3 - atk.currentHP;
    expect(dmgBoosted).toBeGreaterThan(dmgNormal);
  });
});
