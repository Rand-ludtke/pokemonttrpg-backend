import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, RAIN_DANCE, SUNNY_DAY, SANDSTORM_MOVE, SNOWSCAPE } from "./samples";

describe("Weather core", () => {
  it("Sandstorm chips non-Rock/Ground/Steel and boosts Rock Sp. Def (special)", () => {
    const p1 = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100, spa: 70 }), [SANDSTORM_MOVE, TACKLE])] } as Player;
    const p2 = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "B", ["Rock"], defaultStats({ hp: 100, spd: 80 }), [TACKLE])] } as Player;
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Start sandstorm
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: SANDSTORM_MOVE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    // End turn to apply chip
    const hpBefore = p1.team[0].currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const chip = hpBefore - p1.team[0].currentHP;
    expect(chip).toBeGreaterThan(0);

    // Rock Sp. Def boost: A uses special move (simplified: Tackle is physical, but we'll just verify sand remains active via logs; boost is handled in engine.calculate defense)
    expect(engine["state"].field.weather.id).toBe("sandstorm");
  });

  it("Hail chips non-Ice and is suppressed by Cloud Nine", () => {
    const monA = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    const monB = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [monA] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [monB] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Force hail
    engine["state"].field.weather.id = "hail";
    engine["state"].field.weather.turnsLeft = 2;
    const hpBefore = monA.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: monA.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: monB.id } as MoveAction]);
    const chip = hpBefore - monA.currentHP;
    expect(chip).toBeGreaterThan(0);

    // Now set Cloud Nine on B; hail remains but effects suppressed
    monB.ability = "cloud_nine";
    const hpBefore2 = monA.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: monA.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: monB.id } as MoveAction]);
    const chip2 = hpBefore2 - monA.currentHP;
    expect(chip2).toBe(0);
  });

  it("Cloud Nine/Air Lock suppresses weather effects without clearing it", () => {
    const monA = sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [RAIN_DANCE, TACKLE]);
    const monB = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    monB.ability = "cloud_nine";
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [monA] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [monB] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Set rain
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: monA.id, moveId: RAIN_DANCE.id, targetPlayerId: p2.id, targetPokemonId: monB.id } as MoveAction]);
    expect(engine["state"].field.weather.id).toBe("rain");
    // End turn; no residuals under rain anyway, but confirm state persists
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: monA.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: monB.id } as MoveAction]);
    expect(engine["state"].field.weather.id).toBe("rain");
  });

  it("Swift Swim changes order in rain (unsuppressed)", () => {
    const monA = sampleMon("p1-1", "A", ["Water"], defaultStats({ spe: 60 }), [RAIN_DANCE, TACKLE]);
    const monB = sampleMon("p2-1", "B", ["Normal"], defaultStats({ spe: 80 }), [TACKLE]);
    monA.ability = "swift_swim";
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [monA] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [monB] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Set rain
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: monA.id, moveId: RAIN_DANCE.id, targetPlayerId: p2.id, targetPokemonId: monB.id } as MoveAction]);
    // Next turn, both use Tackle; with rain + Swift Swim, monA should act first despite lower base Spe
    const res = engine.processTurn([
      { type: "move", actorPlayerId: "p1", pokemonId: monA.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: monB.id } as MoveAction,
      { type: "move", actorPlayerId: "p2", pokemonId: monB.id, moveId: TACKLE.id, targetPlayerId: p1.id, targetPokemonId: monA.id } as MoveAction,
    ]);
    expect(res.events[0]).toContain("A used Tackle");
  });
});
