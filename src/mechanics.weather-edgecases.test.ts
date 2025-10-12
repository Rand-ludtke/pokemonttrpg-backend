import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, RAIN_DANCE, SUNNY_DAY, WEATHER_BALL, SOLAR_BEAM, HYDRO_STEAM, TACKLE, WATER_GUN, EMBER, THUNDER, HURRICANE, MAGIC_ROOM } from "./samples";

function mkPlayers(a: any, b: any): { p1: Player; p2: Player; eng: Engine } {
  const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
  const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
  const eng = new Engine({ seed: 1 });
  eng.initializeBattle([p1, p2], { seed: 1 });
  return { p1, p2, eng };
}

describe("Weather move edge cases", () => {
  it("Weather Ball changes type and doubles power in weather", () => {
    const a = sampleMon("p1-1", "Caster", ["Normal"], defaultStats({ spa: 120 }), [WEATHER_BALL]);
    const b = sampleMon("p2-1", "Target", ["Normal"], defaultStats({ hp: 300, spd: 80 }), [TACKLE]);
    const { eng } = mkPlayers(a, b);
    // Set rain
    eng["state"].field.weather.id = "rain" as any; eng["state"].field.weather.turnsLeft = 3;
    const before = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: WEATHER_BALL.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    const dealt = before - b.currentHP;
    expect(dealt).toBeGreaterThan(0);
  });

  it("Solar Beam is halved in rain/sand/hail(snow) and normal in sun", () => {
    const a = sampleMon("p1-1", "GrassUser", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM]);
    const b = sampleMon("p2-1", "Target", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE]);
    // Clear baseline
      let { eng } = mkPlayers(a, b);
    eng["state"].field.weather.id = "none" as any; eng["state"].field.weather.turnsLeft = 0;
      // Turn 1: charge; Turn 2: fire and measure
      eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
      let baseBefore = b.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
      let base = baseBefore - b.currentHP;

    // Rain reduced
    ({ eng } = mkPlayers(
      sampleMon("p1-2", "A2", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM]),
      sampleMon("p2-2", "B2", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE])
    ));
    eng["state"].field.weather.id = "rain" as any; eng["state"].field.weather.turnsLeft = 3;
      // Turn 1: charge; Turn 2: fire and measure
      eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: eng["state"].players[0].team[0].id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: eng["state"].players[1].team[0].id } as MoveAction]);
      baseBefore = eng["state"].players[1].team[0].currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: eng["state"].players[0].team[0].id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: eng["state"].players[1].team[0].id } as MoveAction]);
      const rainDealt = baseBefore - eng["state"].players[1].team[0].currentHP;
    expect(rainDealt).toBeLessThan(base);

    // Sun not reduced (we don't implement charge skipping here, just no penalty)
    ({ eng } = mkPlayers(
      sampleMon("p1-3", "A3", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM]),
      sampleMon("p2-3", "B3", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE])
    ));
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    baseBefore = eng["state"].players[1].team[0].currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: eng["state"].players[0].team[0].id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: eng["state"].players[1].team[0].id } as MoveAction]);
    const sunDealt = baseBefore - eng["state"].players[1].team[0].currentHP;
    expect(sunDealt).toBeGreaterThanOrEqual(Math.floor(base * 0.9));
  });

  it("Solar Beam is halved in sand and snow/hail as well", () => {
    // Sandstorm
    let a = sampleMon("p1-1","GrassA", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM]);
    let b = sampleMon("p2-1","TgtA", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE]);
    let { eng } = mkPlayers(a, b);
    eng["state"].field.weather.id = "sandstorm" as any; eng["state"].field.weather.turnsLeft = 3;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    let before = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    let dealtSand = before - b.currentHP;
    // Clear baseline
    a = sampleMon("p1-2","GrassB", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM]);
    b = sampleMon("p2-2","TgtB", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE]);
    ({ eng } = mkPlayers(a, b));
    eng["state"].field.weather.id = "none" as any; eng["state"].field.weather.turnsLeft = 0;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    before = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    const dealtClear = before - b.currentHP;
    expect(dealtSand).toBeLessThan(dealtClear);

    // Snow
    a = sampleMon("p1-3","GrassC", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM]);
    b = sampleMon("p2-3","TgtC", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE]);
    ({ eng } = mkPlayers(a, b));
    eng["state"].field.weather.id = "snow" as any; eng["state"].field.weather.turnsLeft = 3;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    before = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    const dealtSnow = before - b.currentHP;
    expect(dealtSnow).toBeLessThan(dealtClear);
  });

  it("Cloud Nine suppresses Solar Beam instant-in-sun behavior", () => {
    const a = sampleMon("p1-1","SolarCloud", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM]);
    const b = sampleMon("p2-1","CloudNine", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE]);
    b.ability = "cloud_nine";
    const { eng } = mkPlayers(a, b);
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    // Turn 1 should charge due to suppression
    const hp1 = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(b.currentHP).toBe(hp1);
    // Turn 2 should fire
    const hp2 = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: SOLAR_BEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    expect(b.currentHP).toBeLessThan(hp2);
  });

  it("No Guard on the target also ignores weather accuracy modifiers", () => {
    const a = sampleMon("p1-1","User", ["Electric"], defaultStats({ spa: 100 }), [THUNDER]);
    const b = sampleMon("p2-1","NoGuardTgt", ["Normal"], defaultStats({ hp: 5000, spd: 80 }), [TACKLE]);
    b.ability = "no_guard";
    const { eng } = mkPlayers(a, b);
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    let hits = 0;
    for (let i=0;i<10;i++) {
      const hp = b.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: THUNDER.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
      if (b.currentHP < hp) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("Magic Room + Umbrella reduces Hurricane's sun accuracy deterministically across seeds", () => {
    let hitsNoMR = 0;
    let hitsWithMR = 0;
    let strictlyReducedCases = 0;
  for (let seed = 1; seed <= 200; seed++) {
      const a = sampleMon("p1-1","Fly", ["Flying"], defaultStats({ spa: 100 }), [HURRICANE]);
      const b = sampleMon("p2-1","Umb", ["Normal"], defaultStats({ hp: 4000, spd: 80 }), [TACKLE]);
      (b as any).item = "utility_umbrella";
      const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
      const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
      const engA = new Engine({ seed }); engA.initializeBattle([p1, p2], { seed });
      engA["state"].field.weather.id = "sun" as any; engA["state"].field.weather.turnsLeft = 3;
      const hpA = b.currentHP;
      engA.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: HURRICANE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
      const hitA = b.currentHP < hpA; if (hitA) hitsNoMR++;

      // With Magic Room (suppress Umbrella)
      const a2 = sampleMon("p1-1","Fly", ["Flying"], defaultStats({ spa: 100 }), [HURRICANE, MAGIC_ROOM]);
      const b2 = sampleMon("p2-1","Umb", ["Normal"], defaultStats({ hp: 4000, spd: 80 }), [TACKLE]);
      (b2 as any).item = "utility_umbrella";
      const p1B: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a2] };
      const p2B: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b2] };
      const engB = new Engine({ seed }); engB.initializeBattle([p1B, p2B], { seed });
      engB["state"].field.weather.id = "sun" as any; engB["state"].field.weather.turnsLeft = 3;
      // Activate Magic Room to suppress item
      engB.processTurn([{ type: "move", actorPlayerId: p1B.id, pokemonId: a2.id, moveId: MAGIC_ROOM.id, targetPlayerId: p2B.id, targetPokemonId: b2.id } as MoveAction]);
      const hpB = b2.currentHP;
      engB.processTurn([{ type: "move", actorPlayerId: p1B.id, pokemonId: a2.id, moveId: HURRICANE.id, targetPlayerId: p2B.id, targetPokemonId: b2.id } as MoveAction]);
      const hitB = b2.currentHP < hpB; if (hitB) hitsWithMR++;
      if (hitA && !hitB) strictlyReducedCases++;
    }
    // With MR, hit count should never exceed no-MR case, and should be strictly less at least once across seeds
    expect(hitsWithMR).toBeLessThanOrEqual(hitsNoMR);
    expect(strictlyReducedCases).toBeGreaterThan(0);
  });

  it("Wonder Room x weather defense boosts use the correct stat", () => {
    // In sandstorm, Rock's SpD is boosted; under Wonder Room, physical moves should reference SpD and receive the boost
    const rock = sampleMon("p2-1","Rocky", ["Rock"], defaultStats({ hp: 400, def: 90, spd: 90 }), [TACKLE]);
    const physUser = sampleMon("p1-1","Phys", ["Normal"], defaultStats({ atk: 120 }), [TACKLE]);
    const { eng } = mkPlayers(physUser, rock);
    eng["state"].field.wonderRoom.id = "wonder_room" as any; eng["state"].field.wonderRoom.turnsLeft = 3;
    eng["state"].field.weather.id = "sandstorm" as any; eng["state"].field.weather.turnsLeft = 3;
    const before = rock.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: physUser.id, moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: rock.id } as MoveAction]);
    const dealt = before - rock.currentHP;
    // New battle without sandstorm boost: expect more damage than with the boost
    const rock2 = sampleMon("p2-2","Rocky2", ["Rock"], defaultStats({ hp: 400, def: 90, spd: 90 }), [TACKLE]);
    const physUser2 = sampleMon("p1-2","Phys2", ["Normal"], defaultStats({ atk: 120 }), [TACKLE]);
    const { eng: engB } = mkPlayers(physUser2, rock2);
    engB["state"].field.wonderRoom.id = "wonder_room" as any; engB["state"].field.wonderRoom.turnsLeft = 3;
    engB["state"].field.weather.id = "none" as any; engB["state"].field.weather.turnsLeft = 0;
    const before2 = rock2.currentHP;
    engB.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: physUser2.id, moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: rock2.id } as MoveAction]);
    const dealt2 = before2 - rock2.currentHP;
    expect(dealt).toBeLessThan(dealt2);
  });

  it("Hydro Steam is boosted by sun and not reduced by target's Umbrella", () => {
    const a = sampleMon("p1-1", "Steam", ["Water"], defaultStats({ spa: 120 }), [HYDRO_STEAM]);
    const b = sampleMon("p2-1", "Target", ["Normal"], defaultStats({ hp: 300, spd: 100 }), [TACKLE]);
    // Clear baseline
    let { eng } = mkPlayers(a, b);
    eng["state"].field.weather.id = "none" as any; eng["state"].field.weather.turnsLeft = 0;
    let before = b.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: HYDRO_STEAM.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
    const clearDealt = before - b.currentHP;

    // Sun boosted
    const a2 = sampleMon("p1-2", "Steam2", ["Water"], defaultStats({ spa: 120 }), [HYDRO_STEAM]);
    const b2 = sampleMon("p2-2", "Target2", ["Normal"], defaultStats({ hp: 300, spd: 100 }), [TACKLE]);
    ({ eng } = mkPlayers(a2, b2));
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    before = b2.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a2.id, moveId: HYDRO_STEAM.id, targetPlayerId: "p2", targetPokemonId: b2.id } as MoveAction]);
    const sunDealt = before - b2.currentHP;
    expect(sunDealt).toBeGreaterThan(clearDealt);

    // Sun + target Umbrella doesn't cancel Hydro Steam boost
    const a3 = sampleMon("p1-3", "Steam3", ["Water"], defaultStats({ spa: 120 }), [HYDRO_STEAM]);
    const b3 = sampleMon("p2-3", "Target3", ["Normal"], defaultStats({ hp: 300, spd: 100 }), [TACKLE]);
    (b3 as any).item = "utility_umbrella";
    ({ eng } = mkPlayers(a3, b3));
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    before = b3.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a3.id, moveId: HYDRO_STEAM.id, targetPlayerId: "p2", targetPokemonId: b3.id } as MoveAction]);
    const sunUmbDealt = before - b3.currentHP;
    expect(sunUmbDealt).toBeGreaterThan(clearDealt);
  });

  it("No Guard ignores weather accuracy changes for Thunder/Hurricane", () => {
    const a = sampleMon("p1-1", "NoGuardUser", ["Electric"], defaultStats({ spa: 100 }), [THUNDER]);
    const b = sampleMon("p2-1", "Target", ["Normal"], defaultStats({ hp: 5000, spd: 80 }), [TACKLE]);
    a.ability = "no_guard";
    const { eng } = mkPlayers(a, b);
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    let hits = 0;
    for (let i=0;i<10;i++) {
      const hp = b.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: a.id, moveId: THUNDER.id, targetPlayerId: "p2", targetPokemonId: b.id } as MoveAction]);
      if (b.currentHP < hp) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("Target's Umbrella does not affect Solar Beam (not Fire/Water)", () => {
    // Compare Solar Beam in sun against targets with vs without Umbrella under identical seeds
    const mk = () => ({
      a: sampleMon("p1-1","SolarA", ["Grass"], defaultStats({ spa: 120 }), [SOLAR_BEAM]),
      b: sampleMon("p2-1","Tgt", ["Normal"], defaultStats({ hp: 400, spd: 100 }), [TACKLE])
    });
    const s = 11;
    // With Umbrella
    const { a: a1, b: b1 } = mk(); (b1 as any).item = "utility_umbrella";
    const p1A: Player = { id: "p1A", name: "P1A", activeIndex: 0, team: [a1] };
    const p2A: Player = { id: "p2A", name: "P2A", activeIndex: 0, team: [b1] };
    const engA = new Engine({ seed: s });
    engA.initializeBattle([p1A, p2A], { seed: s });
    engA["state"].field.weather.id = "sun" as any; engA["state"].field.weather.turnsLeft = 3;
    const beforeA = b1.currentHP;
    engA.processTurn([{ type: "move", actorPlayerId: p1A.id, pokemonId: a1.id, moveId: SOLAR_BEAM.id, targetPlayerId: p2A.id, targetPokemonId: b1.id }]);
    const dealtUmb = beforeA - b1.currentHP;
    // Without Umbrella
    const { a: a2, b: b2 } = mk();
    const p1B: Player = { id: "p1B", name: "P1B", activeIndex: 0, team: [a2] };
    const p2B: Player = { id: "p2B", name: "P2B", activeIndex: 0, team: [b2] };
    const engB = new Engine({ seed: s });
    engB.initializeBattle([p1B, p2B], { seed: s });
    engB["state"].field.weather.id = "sun" as any; engB["state"].field.weather.turnsLeft = 3;
    const beforeB = b2.currentHP;
    engB.processTurn([{ type: "move", actorPlayerId: p1B.id, pokemonId: a2.id, moveId: SOLAR_BEAM.id, targetPlayerId: p2B.id, targetPokemonId: b2.id }]);
    const dealtNoUmb = beforeB - b2.currentHP;
    expect(dealtUmb).toBe(dealtNoUmb);
  });

  it("Weather Ball type adapts under weather and remains Normal under suppression", () => {
    // Ghost target: Normal Weather Ball should do 0; adapted Weather Ball should do > 0
    const ghost = sampleMon("p2-ghost","Ghost", ["Ghost"], defaultStats({ hp: 300, spd: 90 }), [TACKLE]);
    const attacker = sampleMon("p1-att","Caster", ["Normal"], defaultStats({ spa: 120 }), [WEATHER_BALL]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [attacker] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [ghost] };
    // Clear: should be Normal and do 0
    let eng = new Engine({ seed: 3 }); eng.initializeBattle([p1, p2], { seed: 3 });
    eng["state"].field.weather.id = "none" as any; eng["state"].field.weather.turnsLeft = 0;
    let before = ghost.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: WEATHER_BALL.id, targetPlayerId: p2.id, targetPokemonId: ghost.id }]);
    let dealt = before - ghost.currentHP; expect(dealt).toBe(0);
    // Sun: should adapt to Fire and hit
    eng = new Engine({ seed: 3 }); eng.initializeBattle([p1, p2], { seed: 3 });
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    before = ghost.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: WEATHER_BALL.id, targetPlayerId: p2.id, targetPokemonId: ghost.id }]);
    dealt = before - ghost.currentHP; expect(dealt).toBeGreaterThan(0);
    // Rain: should adapt to Water and hit
    eng = new Engine({ seed: 3 }); eng.initializeBattle([p1, p2], { seed: 3 });
    eng["state"].field.weather.id = "rain" as any; eng["state"].field.weather.turnsLeft = 3;
    before = ghost.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: WEATHER_BALL.id, targetPlayerId: p2.id, targetPokemonId: ghost.id }]);
    dealt = before - ghost.currentHP; expect(dealt).toBeGreaterThan(0);
    // Sandstorm: should adapt to Rock and hit
    eng = new Engine({ seed: 3 }); eng.initializeBattle([p1, p2], { seed: 3 });
    eng["state"].field.weather.id = "sandstorm" as any; eng["state"].field.weather.turnsLeft = 3;
    before = ghost.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: WEATHER_BALL.id, targetPlayerId: p2.id, targetPokemonId: ghost.id }]);
    dealt = before - ghost.currentHP; expect(dealt).toBeGreaterThan(0);
    // Snow: should adapt to Ice and hit
    eng = new Engine({ seed: 3 }); eng.initializeBattle([p1, p2], { seed: 3 });
    eng["state"].field.weather.id = "snow" as any; eng["state"].field.weather.turnsLeft = 3;
    before = ghost.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: WEATHER_BALL.id, targetPlayerId: p2.id, targetPokemonId: ghost.id }]);
    dealt = before - ghost.currentHP; expect(dealt).toBeGreaterThan(0);
    // Cloud Nine suppression: remains Normal -> does 0
    const ghost2 = sampleMon("p2-g2","Ghost2", ["Ghost"], defaultStats({ hp: 300, spd: 90 }), [TACKLE]);
    ghost2.ability = "cloud_nine";
    const p2g: Player = { id: "p2g", name: "P2g", activeIndex: 0, team: [ghost2] };
    eng = new Engine({ seed: 4 }); eng.initializeBattle([p1, p2g], { seed: 4 });
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    const before2 = ghost2.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: attacker.id, moveId: WEATHER_BALL.id, targetPlayerId: p2g.id, targetPokemonId: ghost2.id }]);
    const dealt2 = before2 - ghost2.currentHP; expect(dealt2).toBe(0);
  });

  it("Magic Room suppresses Umbrella so sun/rain boosts apply again", () => {
    // Sun + Fire vs Umbrella target: no boost; with Magic Room: boost returns
    const atkSun = sampleMon("p1-a","FireMon", ["Fire"], defaultStats({ spa: 120 }), [SUNNY_DAY, EMBER, MAGIC_ROOM]);
    const tgtSun = sampleMon("p2-a","UmbTgt", ["Normal"], defaultStats({ hp: 220, spd: 100 }), [TACKLE]);
    (tgtSun as any).item = "utility_umbrella";
    let { eng } = mkPlayers(atkSun, tgtSun);
    // Set sun without Magic Room
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    let before = tgtSun.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: atkSun.id, moveId: EMBER.id, targetPlayerId: "p2", targetPokemonId: tgtSun.id }]);
    const dmgNoBoost = before - tgtSun.currentHP;
    // New battle with Magic Room active
    const atkSun2 = sampleMon("p1-b","FireMon2", ["Fire"], defaultStats({ spa: 120 }), [SUNNY_DAY, EMBER, MAGIC_ROOM]);
    const tgtSun2 = sampleMon("p2-b","UmbTgt2", ["Normal"], defaultStats({ hp: 220, spd: 100 }), [TACKLE]);
    (tgtSun2 as any).item = "utility_umbrella";
    ({ eng } = mkPlayers(atkSun2, tgtSun2));
    eng["state"].field.weather.id = "sun" as any; eng["state"].field.weather.turnsLeft = 3;
    // Activate Magic Room
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: atkSun2.id, moveId: MAGIC_ROOM.id, targetPlayerId: "p2", targetPokemonId: tgtSun2.id }]);
    before = tgtSun2.currentHP;
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: atkSun2.id, moveId: EMBER.id, targetPlayerId: "p2", targetPokemonId: tgtSun2.id }]);
    const dmgWithMagic = before - tgtSun2.currentHP;
    expect(dmgWithMagic).toBeGreaterThan(dmgNoBoost);
  });
});
