import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, RAIN_DANCE, SUNNY_DAY, SNOWSCAPE, TACKLE } from "./samples";

describe("Weather duration items", () => {
  it("Damp Rock extends rain to 8 turns", () => {
    const a = sampleMon("p1-1","RainSetter", ["Water"], defaultStats({}), [RAIN_DANCE, TACKLE]);
    (a as any).item = "damp_rock";
    const b = sampleMon("p2-1","Dummy", ["Normal"], defaultStats({}), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const eng = new Engine({ seed: 1 }); eng.initializeBattle([p1, p2], { seed: 1 });
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: RAIN_DANCE.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(eng["state"].field.weather.id).toBe("rain");
    expect(eng["state"].field.weather.turnsLeft).toBeGreaterThanOrEqual(8);
  });

  it("Heat Rock extends sun to 8 turns", () => {
    const a = sampleMon("p1-1","SunSetter", ["Fire"], defaultStats({}), [SUNNY_DAY, TACKLE]);
    (a as any).item = "heat_rock";
    const b = sampleMon("p2-1","Dummy", ["Normal"], defaultStats({}), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const eng = new Engine({ seed: 1 }); eng.initializeBattle([p1, p2], { seed: 1 });
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SUNNY_DAY.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(eng["state"].field.weather.id).toBe("sun");
    expect(eng["state"].field.weather.turnsLeft).toBeGreaterThanOrEqual(8);
  });

  it("Icy Rock extends snow to 8 turns", () => {
    const a = sampleMon("p1-1","SnowSetter", ["Ice"], defaultStats({}), [SNOWSCAPE, TACKLE]);
    (a as any).item = "icy_rock";
    const b = sampleMon("p2-1","Dummy", ["Normal"], defaultStats({}), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const eng = new Engine({ seed: 1 }); eng.initializeBattle([p1, p2], { seed: 1 });
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SNOWSCAPE.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(eng["state"].field.weather.id).toBe("snow");
    expect(eng["state"].field.weather.turnsLeft).toBeGreaterThanOrEqual(8);
  });
});
