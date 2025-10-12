import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, RAIN_DANCE, SUNNY_DAY, SNOWSCAPE, TACKLE, EMBER, THUNDERSHOCK, ROCK_THROW } from "./samples";

describe("Weather abilities and Gen9 snow rules", () => {
  it("Rain Dish heals at end of turn in rain", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 120 }), [RAIN_DANCE, TACKLE]);
    a.ability = "rain_dish";
    a.currentHP = 60;
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({}), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
  engine.initializeBattle([p1, p2], { seed: 1 });
  const hpBefore = a.currentHP;
  // Set rain; Rain Dish should heal at end of this same turn
  engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: RAIN_DANCE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
  expect(a.currentHP).toBeGreaterThan(hpBefore);
  });

  it("Solar Power chips at end of turn in sun", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 120 }), [SUNNY_DAY, TACKLE]);
    a.ability = "solar_power";
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({}), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: SUNNY_DAY.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const hpBefore = a.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: b.id, moveId: TACKLE.id, targetPlayerId: p1.id, targetPokemonId: a.id } as MoveAction]);
    expect(a.currentHP).toBeLessThan(hpBefore);
  });

  it("Gen9 Snow boosts Ice-type Defense (physical), no hail chip", () => {
    const a = sampleMon("p1-1", "A", ["Ice"], defaultStats({ hp: 200, def: 80 }), [SNOWSCAPE, TACKLE]);
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({ atk: 95 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Set snow
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: SNOWSCAPE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    // Compare damage under snow vs after it ends
    const hpBefore = a.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: b.id, moveId: TACKLE.id, targetPlayerId: p1.id, targetPokemonId: a.id } as MoveAction]);
    const dmgSnow = hpBefore - a.currentHP;
    // End weather manually, then measure damage again
    engine["state"].field.weather.id = "none";
    engine["state"].field.weather.turnsLeft = 0;
    const hpBefore2 = a.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: b.id, moveId: TACKLE.id, targetPlayerId: p1.id, targetPokemonId: a.id } as MoveAction]);
    const dmgClear = hpBefore2 - a.currentHP;
    expect(dmgSnow).toBeGreaterThan(0);
    expect(dmgClear).toBeGreaterThan(0);
    expect(dmgSnow).toBeLessThan(dmgClear);
  });

  it("Slush Rush doubles speed in snow/hail for move order", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ spe: 60 }), [SNOWSCAPE, TACKLE]);
    a.ability = "slush_rush";
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({ spe: 90 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Set snow
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: SNOWSCAPE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    // Next turn, A should move first due to Slush Rush
    const res = engine.processTurn([
      { type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction,
      { type: "move", actorPlayerId: p2.id, pokemonId: b.id, moveId: TACKLE.id, targetPlayerId: p1.id, targetPokemonId: a.id } as MoveAction,
    ]);
    expect(res.events[0]).toContain("A used Tackle");
  });

  it("Sand Force boosts Rock/Ground/Steel move damage in sandstorm", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ atk: 90 }), [ROCK_THROW]);
    a.ability = "sand_force";
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 200, def: 80 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Set sandstorm
    engine["state"].field.weather.id = "sandstorm";
    engine["state"].field.weather.turnsLeft = 5;
    const hpBefore = b.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: ROCK_THROW.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const dmgBoosted = hpBefore - b.currentHP;
    // Remove ability and attack again (clear weather turns unchanged; keep one more turn)
    a.ability = undefined as any;
    const hpBefore2 = b.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: ROCK_THROW.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const dmgNormal = hpBefore2 - b.currentHP;
    expect(dmgBoosted).toBeGreaterThan(dmgNormal);
  });

  it("Solar Power boosts Special Attack in sun (Electric move unaffected by sun multipliers)", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ spa: 90 }), [SUNNY_DAY, THUNDERSHOCK]);
    a.ability = "solar_power";
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 200, spd: 80 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Set sun
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: SUNNY_DAY.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const hpBeforeSun = b.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: THUNDERSHOCK.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const dmgSun = hpBeforeSun - b.currentHP;
    // Clear weather
    engine["state"].field.weather.id = "none";
    engine["state"].field.weather.turnsLeft = 0;
    const hpBeforeClear = b.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: THUNDERSHOCK.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const dmgClear = hpBeforeClear - b.currentHP;
    expect(dmgSun).toBeGreaterThan(dmgClear);
  });

  it("Overcoat prevents hail/sand chip; Ice Body heals in snow", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 120 }), [TACKLE]);
    a.ability = "overcoat";
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({}), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Hail chip should not occur due to Overcoat
    engine["state"].field.weather.id = "hail";
    engine["state"].field.weather.turnsLeft = 2;
    const hpHail = a.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    expect(a.currentHP).toBe(hpHail);
    // Snow + Ice Body heals
    a.ability = "ice_body";
    a.currentHP = Math.max(1, a.currentHP - 10);
    engine["state"].field.weather.id = "snow";
    engine["state"].field.weather.turnsLeft = 2;
    const hpBefore = a.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    expect(a.currentHP).toBeGreaterThan(hpBefore);
  });

  it("Utility Umbrella on the target cancels sun/rain power modifiers (hail/snow/sand unaffected)", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ spa: 90, hp: 200 }), [SUNNY_DAY, EMBER]);
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 200, spd: 80 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Set sun and compare damage with umbrella vs without
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: SUNNY_DAY.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const hpBeforeSun = b.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: EMBER.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const dmgNoUmbrella = hpBeforeSun - b.currentHP;
    // Give target Umbrella and attack again in sun
    b.item = "utility_umbrella" as any;
    const hpBeforeSun2 = b.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: EMBER.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const dmgTargetUmbrella = hpBeforeSun2 - b.currentHP;
    expect(dmgTargetUmbrella).toBeLessThan(dmgNoUmbrella);
  });
});
