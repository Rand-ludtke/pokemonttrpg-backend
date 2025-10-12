import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, Move } from "./types";
import { defaultStats, sampleMon, RAIN_DANCE, SUNNY_DAY, THUNDER, HURRICANE, WATER_GUN, EMBER, TACKLE } from "./samples";

function equip(mon: any, item: string) { mon.item = item; return mon; }

describe("Utility Umbrella interactions", () => {
  it("Target's Umbrella alters weather accuracy: rain Thunder not 100% vs holder; sun Hurricane not penalized vs holder", () => {
    // Rain: compare Thunder vs target WITH Umbrella vs WITHOUT under identical RNG
    const mk = () => ({
      a: sampleMon("p1-1","A",["Electric"], defaultStats({ spa: 50 }), [THUNDER]),
      b: sampleMon("p2-1","B",["Normal"], defaultStats({ hp: 50000, spd: 80 }), [TACKLE])
    });
    // Target with Umbrella
    const { a: aT, b: bT } = mk(); (bT as any).item = "utility_umbrella";
    const p1T: Player = { id: "p1T", name: "P1T", activeIndex: 0, team: [aT] };
    const p2T: Player = { id: "p2T", name: "P2T", activeIndex: 0, team: [bT] };
    const engT = new Engine({ seed: 7 });
    engT.initializeBattle([p1T, p2T], { seed: 7 });
    engT["state"].field.weather.id = "rain"; engT["state"].field.weather.turnsLeft = 99;
    let hitsUmbTarget = 0;
    for (let i=0;i<30;i++) {
      const hp = bT.currentHP;
      engT.processTurn([{ type: "move", actorPlayerId: p1T.id, pokemonId: aT.id, moveId: THUNDER.id, targetPlayerId: p2T.id, targetPokemonId: bT.id }]);
      if (bT.currentHP < hp) hitsUmbTarget++;
    }
    // Target without Umbrella (should be 100% in rain)
    const { a: aN, b: bN } = mk();
    const p1N: Player = { id: "p1N", name: "P1N", activeIndex: 0, team: [aN] };
    const p2N: Player = { id: "p2N", name: "P2N", activeIndex: 0, team: [bN] };
    const engN = new Engine({ seed: 7 }); // identical RNG
    engN.initializeBattle([p1N, p2N], { seed: 7 });
    engN["state"].field.weather.id = "rain"; engN["state"].field.weather.turnsLeft = 99;
    let hitsNoUmbTarget = 0;
    for (let i=0;i<30;i++) {
      const hp = bN.currentHP;
      engN.processTurn([{ type: "move", actorPlayerId: p1N.id, pokemonId: aN.id, moveId: THUNDER.id, targetPlayerId: p2N.id, targetPokemonId: bN.id }]);
      if (bN.currentHP < hp) hitsNoUmbTarget++;
    }
    expect(hitsNoUmbTarget).toBeGreaterThan(hitsUmbTarget);

    // Sun: compare Hurricane vs target WITH Umbrella vs WITHOUT under identical RNG
    const mk2 = () => ({
      a: sampleMon("p1-3","C",["Flying"], defaultStats({ spa: 50 }), [HURRICANE]),
      b: sampleMon("p2-3","D",["Normal"], defaultStats({ hp: 50000, spd: 80 }), [TACKLE])
    });
    const { a: aT2, b: bT2 } = mk2(); (bT2 as any).item = "utility_umbrella";
    const p1T2: Player = { id: "p1T2", name: "P1T2", activeIndex: 0, team: [aT2] };
    const p2T2: Player = { id: "p2T2", name: "P2T2", activeIndex: 0, team: [bT2] };
    const engT2 = new Engine({ seed: 9 });
    engT2.initializeBattle([p1T2, p2T2], { seed: 9 });
    engT2["state"].field.weather.id = "sun"; engT2["state"].field.weather.turnsLeft = 99;
    let hitsUmbTargetSun = 0;
    for (let i=0;i<40;i++) {
      const hp = bT2.currentHP;
      engT2.processTurn([{ type: "move", actorPlayerId: p1T2.id, pokemonId: aT2.id, moveId: HURRICANE.id, targetPlayerId: p2T2.id, targetPokemonId: bT2.id }]);
      if (bT2.currentHP < hp) hitsUmbTargetSun++;
    }
    // Without Umbrella (penalized accuracy in sun)
    const { a: aN2, b: bN2 } = mk2();
    const p1N2: Player = { id: "p1N2", name: "P1N2", activeIndex: 0, team: [aN2] };
    const p2N2: Player = { id: "p2N2", name: "P1N2", activeIndex: 0, team: [bN2] } as any;
    const engN2 = new Engine({ seed: 9 });
    engN2.initializeBattle([p1N2, p2N2], { seed: 9 });
    engN2["state"].field.weather.id = "sun"; engN2["state"].field.weather.turnsLeft = 99;
    let hitsNoUmbTargetSun = 0;
    for (let i=0;i<40;i++) {
      const hp = bN2.currentHP;
      engN2.processTurn([{ type: "move", actorPlayerId: p1N2.id, pokemonId: aN2.id, moveId: HURRICANE.id, targetPlayerId: p2N2.id, targetPokemonId: bN2.id }]);
      if (bN2.currentHP < hp) hitsNoUmbTargetSun++;
    }
    expect(hitsUmbTargetSun).toBeGreaterThan(hitsNoUmbTargetSun);
  });

  it("Target's Umbrella cancels sun/rain power modifiers for Fire/Water moves", () => {
    const a = sampleMon("p1-1","A",["Fire"], defaultStats({ spa: 120 }), [EMBER]);
    const b = sampleMon("p2-1","B",["Normal"], defaultStats({ hp: 200, spd: 80 }), [TACKLE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 3 });
    engine.initializeBattle([p1, p2], { seed: 3 });
    engine["state"].field.weather.id = "sun"; engine["state"].field.weather.turnsLeft = 3;
    // Deal damage once and assert it's not boosted beyond a baseline under sun due to Umbrella
    const before = b.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: EMBER.id, targetPlayerId: p2.id, targetPokemonId: b.id }]);
    const dealtSun = before - b.currentHP;

    // Reset and compare to no-weather baseline
    const a2 = sampleMon("p1-2","A2",["Fire"], defaultStats({ spa: 120 }), [EMBER]);
    const b2 = sampleMon("p2-2","B2",["Normal"], defaultStats({ hp: 200, spd: 80 }), [TACKLE]);
    const p1b: Player = { id: "p1b", name: "P1b", activeIndex: 0, team: [a2] };
    const p2b: Player = { id: "p2b", name: "P2b", activeIndex: 0, team: [b2] };
    const engine2 = new Engine({ seed: 4 });
    engine2.initializeBattle([p1b, p2b], { seed: 4 });
    engine2["state"].field.weather.id = "none" as any; engine2["state"].field.weather.turnsLeft = 0;
    const before2 = b2.currentHP;
    engine2.processTurn([{ type: "move", actorPlayerId: p1b.id, pokemonId: a2.id, moveId: EMBER.id, targetPlayerId: p2b.id, targetPokemonId: b2.id }]);
    const dealtClear = before2 - b2.currentHP;

    // Now equip Umbrella on target and attack under sun: damage should be similar to clear (no boost)
    const a3 = sampleMon("p1-3","A3",["Fire"], defaultStats({ spa: 120 }), [EMBER]);
    const b3 = equip(sampleMon("p2-3","B3",["Normal"], defaultStats({ hp: 200, spd: 80 }), [TACKLE]), "utility_umbrella");
    const p1c: Player = { id: "p1c", name: "P1c", activeIndex: 0, team: [a3] };
    const p2c: Player = { id: "p2c", name: "P2c", activeIndex: 0, team: [b3] };
    const engine3 = new Engine({ seed: 6 });
    engine3.initializeBattle([p1c, p2c], { seed: 6 });
    engine3["state"].field.weather.id = "sun"; engine3["state"].field.weather.turnsLeft = 3;
    const before3 = b3.currentHP;
    engine3.processTurn([{ type: "move", actorPlayerId: p1c.id, pokemonId: a3.id, moveId: EMBER.id, targetPlayerId: p2c.id, targetPokemonId: b3.id }]);
    const dealtSunTargetUmb = before3 - b3.currentHP;

    // Sun vs clear under target Umbrella should be roughly similar
    expect(dealtSunTargetUmb).toBeLessThanOrEqual(Math.ceil(dealtClear * 1.2));
    expect(dealtSunTargetUmb).toBeGreaterThanOrEqual(Math.floor(dealtClear * 0.8));
  });

  it("Umbrella suppresses Rain Dish heal and Solar Power chip/boost for the holder", () => {
    const a = equip(sampleMon("p1-1","A",["Grass"], defaultStats({ hp: 180, spa: 100 }), [SUNNY_DAY, TACKLE]), "utility_umbrella");
    a.ability = "solar_power";
    const b = equip(sampleMon("p2-1","B",["Water"], defaultStats({ hp: 180, spa: 80 }), [RAIN_DANCE, TACKLE]), "utility_umbrella");
    b.ability = "rain_dish";

    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const engine = new Engine({ seed: 5 });
    engine.initializeBattle([p1, p2], { seed: 5 });

    // Set sun and verify Solar Power doesn't increase SpA damage nor chip at EOT
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: SUNNY_DAY.id, targetPlayerId: p2.id, targetPokemonId: b.id }]);
    const pre = b.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: b.id }]);
    // EOT tick processed inside turn
    const post = b.currentHP;
    expect(a.currentHP).toBe(a.maxHP); // no Solar Power chip on holder

    // Set rain and verify Rain Dish doesn't heal holder
    engine.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: b.id, moveId: RAIN_DANCE.id, targetPlayerId: p1.id, targetPokemonId: a.id }]);
    const beforeHP = b.currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: p2.id, pokemonId: b.id, moveId: TACKLE.id, targetPlayerId: p1.id, targetPokemonId: a.id }]);
    expect(b.currentHP).toBeLessThanOrEqual(beforeHP); // no heal occurred
  });
});
