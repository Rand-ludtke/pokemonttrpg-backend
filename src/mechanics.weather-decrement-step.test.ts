import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, RAIN_DANCE, SUNNY_DAY, SNOWSCAPE, TACKLE } from "./samples";

// Step-by-step validation that weather.turnsLeft decrements by 1 each full turn and that stacking via onUse accumulates.

describe("Weather decrements and stacking per turn", () => {
  function mk(seed = 31) {
    const a = sampleMon("p1-1","Setter", ["Normal"], defaultStats({}), [RAIN_DANCE, SUNNY_DAY, SNOWSCAPE, TACKLE]);
    const b = sampleMon("p2-1","Dummy", ["Normal"], defaultStats({}), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const eng = new Engine({ seed }); eng.initializeBattle([p1, p2], { seed });
    return { eng, a, b, p1, p2 };
  }

  it("Rain Dance: turnsLeft decrements each turn after set", () => {
    const { eng, a, b, p1, p2 } = mk(32);
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: RAIN_DANCE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const start = eng["state"].field.weather.turnsLeft;
    expect(start).toBeGreaterThanOrEqual(5);
    // Advance a few empty turns
    for (let i=0;i<3;i++) {
      eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    }
    const after = eng["state"].field.weather.turnsLeft;
    expect(after).toBe(start - 3);
  });

  it("Stacking: Sun then Rain accumulates per onUse", () => {
    const { eng, a, b, p1, p2 } = mk(33);
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: SUNNY_DAY.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const sun0 = eng["state"].field.weather.turnsLeft;
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: RAIN_DANCE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const rain0 = eng["state"].field.weather.turnsLeft;
    expect(rain0).toBeGreaterThanOrEqual(5);
    // Decrement one full turn
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    const rain1 = eng["state"].field.weather.turnsLeft;
    expect(rain1).toBe(rain0 - 1);
  });
});
