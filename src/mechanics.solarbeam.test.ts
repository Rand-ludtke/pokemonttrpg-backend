import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, SOLAR_BEAM, SUNNY_DAY, TACKLE } from "./samples";

function mk(a: any, b: any): { p1: Player; p2: Player; eng: Engine } {
  const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
  const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
  const eng = new Engine({ seed: 2 });
  eng.initializeBattle([p1, p2], { seed: 2 });
  return { p1, p2, eng };
}

describe("Solar Beam two-turn behavior", () => {
  it("Charges first under clear and fires next turn (PP only consumed once)", () => {
    const a = sampleMon("p1-1", "Solar", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM, TACKLE]);
    const b = sampleMon("p2-1", "Dummy", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE]);
    const { eng } = mk(a, b);
    const ppStore = ((a as any).volatile.pp = (a as any).volatile.pp || {});
    ppStore[SOLAR_BEAM.id] = SOLAR_BEAM.pp ?? 10;

    // Turn 1: should charge and not deal damage
    const before1 = b.currentHP;
    const res1 = eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(b.currentHP).toBe(before1);
    // PP consumed on charge
    expect(ppStore[SOLAR_BEAM.id]).toBe((SOLAR_BEAM.pp ?? 10) - 1);

    // Turn 2: should fire and skip PP decrement
    const before2 = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(b.currentHP).toBeLessThan(before2);
    expect(ppStore[SOLAR_BEAM.id]).toBe((SOLAR_BEAM.pp ?? 10) - 1);
  });

  it("Fires immediately in sun (no charge)", () => {
    const a = sampleMon("p1-1", "SolarSun", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM, SUNNY_DAY]);
    const b = sampleMon("p2-1", "Dummy", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE]);
    const { eng } = mk(a, b);
    // Set sun
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    const ppStore = ((a as any).volatile.pp = (a as any).volatile.pp || {});
    ppStore[SOLAR_BEAM.id] = SOLAR_BEAM.pp ?? 10;

    const before = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(b.currentHP).toBeLessThan(before);
    expect(ppStore[SOLAR_BEAM.id]).toBe((SOLAR_BEAM.pp ?? 10) - 1);
  });
});
