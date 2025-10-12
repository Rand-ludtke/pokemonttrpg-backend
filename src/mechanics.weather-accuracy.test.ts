import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, RAIN_DANCE, SUNNY_DAY, THUNDER, HURRICANE, TACKLE, ROCK_THROW } from "./samples";

describe("Weather accuracy behaviors", () => {
  it("Thunder/Hurricane hit 100% in rain and are worse in sun", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ spa: 100 }), [RAIN_DANCE, THUNDER, HURRICANE]);
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 200, spd: 80 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });
    // Rain: Thunder should land reliably
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: RAIN_DANCE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const hpBefore1 = b.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: THUNDER.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    expect(b.currentHP).toBeLessThan(hpBefore1);

    // Sun: Hurricane has worse accuracy; run multiple attempts to probabilistically see a miss (simplified: we just ensure it doesn't always hit)
    engine["state"].field.weather.id = "sun";
    engine["state"].field.weather.turnsLeft = 3;
    let hits = 0;
    for (let i = 0; i < 5; i++) {
      const hpBefore = b.currentHP;
      engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: HURRICANE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
      if (b.currentHP < hpBefore) hits++;
    }
    expect(hits).toBeLessThan(5);
  });

  it("Snow Cloak reduces hit chance in snow/hail", () => {
    const a = sampleMon("p1-1", "A", ["Normal"], defaultStats({ atk: 100 }), [ROCK_THROW]);
    const b = sampleMon("p2-1", "B", ["Normal"], defaultStats({ hp: 200, spd: 80 }), [TACKLE]);
    b.ability = "snow_cloak";
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 2 });
    engine.initializeBattle([p1, p2], { seed: 2 });
    engine["state"].field.weather.id = "snow";
    engine["state"].field.weather.turnsLeft = 3;
    // With Snow Cloak, over multiple attempts there should be at least one miss
    let misses = 0;
    for (let i = 0; i < 10; i++) {
      const hpBefore = b.currentHP;
      engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: ROCK_THROW.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
      if (b.currentHP === hpBefore) misses++;
    }
    expect(misses).toBeGreaterThan(0);
  });
});
