import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Action, Move, Player, Pokemon } from "./types";

function makeMon(id: string, name: string, overrides?: Partial<Pokemon>): Pokemon {
  const base: Pokemon = {
    id,
    name,
    level: 50,
    types: ["Normal"],
    baseStats: { hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
    currentHP: 200,
    maxHP: 200,
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
    status: "none",
    volatile: {},
    moves: [],
  };
  return { ...base, ...overrides };
}

function makeMove(partial: Partial<Move>): Move {
  return {
    id: partial.id || "move",
    name: partial.name || partial.id || "Move",
    type: partial.type || "Normal",
    category: partial.category || "Physical",
    power: partial.power ?? 50,
    accuracy: partial.accuracy ?? 100,
    ...partial,
  } as Move;
}

function init(players: Player[], seed = 123) {
  const engine = new Engine({ seed });
  const state = engine.initializeBattle(players, { seed });
  return { engine, state };
}

describe("weather damage modifiers", () => {
  it("boosts Fire in sun and nerfs in rain", () => {
    const fireBlast = makeMove({ id: "flame", name: "Flame", type: "Fire", category: "Special", power: 90, accuracy: 100 });
    const tackle = makeMove({ id: "tackle", name: "Tackle", type: "Normal", category: "Physical", power: 40, accuracy: 100 });
    const A = makeMon("A1", "Attacker", { baseStats: { hp: 100, atk: 50, def: 50, spa: 120, spd: 80, spe: 100 }, moves: [fireBlast] });
    const B = makeMon("B1", "Defender", { baseStats: { hp: 100, atk: 50, def: 90, spa: 80, spd: 90, spe: 80 }, moves: [tackle] });
    const players: Player[] = [
      { id: "A", name: "A", team: [A], activeIndex: 0 },
      { id: "B", name: "B", team: [B], activeIndex: 0 },
    ];
    const actions: Action[] = [
      { type: "move", actorPlayerId: "A", pokemonId: "A1", moveId: "flame", targetPlayerId: "B", targetPokemonId: "B1" },
      { type: "move", actorPlayerId: "B", pokemonId: "B1", moveId: "tackle", targetPlayerId: "A", targetPokemonId: "A1" },
    ];

  // Baseline (fresh battle)
  const base = init(JSON.parse(JSON.stringify(players)), 999);
  const resBase = base.engine.processTurn(actions);
  const baseDamage = 200 - resBase.state.players[1].team[0].currentHP;

  // Sun (set before first turn)
  const sun = init(JSON.parse(JSON.stringify(players)), 999);
  sun.state.field.weather.id = "sun";
  sun.state.field.weather.turnsLeft = 5;
  const resSun = sun.engine.processTurn(actions);
  const sunDamage = 200 - resSun.state.players[1].team[0].currentHP;

  // Rain (set before first turn)
  const rain = init(JSON.parse(JSON.stringify(players)), 999);
  rain.state.field.weather.id = "rain";
  rain.state.field.weather.turnsLeft = 5;
  const resRain = rain.engine.processTurn(actions);
  const rainDamage = 200 - resRain.state.players[1].team[0].currentHP;

    expect(sunDamage).toBeGreaterThan(baseDamage);
    expect(rainDamage).toBeLessThan(baseDamage);
  });
});

describe("accuracy/evasion with No Guard", () => {
  it("misses with high evasion but hits with No Guard", () => {
    const shaky = makeMove({ id: "shaky", name: "Shaky", type: "Normal", category: "Physical", power: 60, accuracy: 60 });
    const A = makeMon("A1", "Attacker", { baseStats: { hp: 100, atk: 100, def: 80, spa: 80, spd: 80, spe: 90 }, moves: [shaky] });
    const B = makeMon("B1", "Evader", { baseStats: { hp: 100, atk: 50, def: 80, spa: 80, spd: 80, spe: 80 }, stages: { hp:0, atk:0, def:0, spa:0, spd:0, spe:0, acc:0, eva:6 }, moves: [] });
    const players: Player[] = [
      { id: "A", name: "A", team: [A], activeIndex: 0 },
      { id: "B", name: "B", team: [B], activeIndex: 0 },
    ];
    const actions: Action[] = [
      { type: "move", actorPlayerId: "A", pokemonId: "A1", moveId: "shaky", targetPlayerId: "B", targetPokemonId: "B1" },
    ];
    // Without No Guard: expect miss (HP unchanged)
  const init1 = init(JSON.parse(JSON.stringify(players)), 321);
  const res1 = init1.engine.processTurn(actions);
  const hpAfter1 = res1.state.players[1].team[0].currentHP;
    expect(hpAfter1).toBe(200);

    // With No Guard: should hit
    const playersNG = JSON.parse(JSON.stringify(players)) as Player[];
    (playersNG[0].team[0] as Pokemon).ability = "no_guard";
  const init2 = init(playersNG, 321);
  const res2 = init2.engine.processTurn(actions);
  const hpAfter2 = res2.state.players[1].team[0].currentHP;
    expect(hpAfter2).toBeLessThan(200);
  });
});

describe("Focus Sash and Sturdy survival", () => {
  it("Focus Sash leaves at 1 HP and consumes item", () => {
    const nuke = makeMove({ id: "nuke", name: "Nuke", type: "Normal", category: "Physical", power: 200, accuracy: 100 });
    const A = makeMon("A1", "Attacker", { baseStats: { hp: 100, atk: 200, def: 80, spa: 80, spd: 80, spe: 100 }, moves: [nuke] });
    const B = makeMon("B1", "Sashed", { item: "focus_sash" });
    const players: Player[] = [
      { id: "A", name: "A", team: [A], activeIndex: 0 },
      { id: "B", name: "B", team: [B], activeIndex: 0 },
    ];
    const actions: Action[] = [
      { type: "move", actorPlayerId: "A", pokemonId: "A1", moveId: "nuke", targetPlayerId: "B", targetPokemonId: "B1" },
    ];
  const i = init(JSON.parse(JSON.stringify(players)), 111);
  const res = i.engine.processTurn(actions);
  expect(res.state.players[1].team[0].currentHP).toBe(1);
  expect(res.state.players[1].team[0].item).toBeUndefined();
  });

  it("Sturdy leaves at 1 HP from full", () => {
    const nuke = makeMove({ id: "nuke", name: "Nuke", type: "Normal", category: "Physical", power: 200, accuracy: 100 });
    const A = makeMon("A1", "Attacker", { baseStats: { hp: 100, atk: 200, def: 80, spa: 80, spd: 80, spe: 100 }, moves: [nuke] });
    const B = makeMon("B1", "SturdyMon", { ability: "sturdy" });
    const players: Player[] = [
      { id: "A", name: "A", team: [A], activeIndex: 0 },
      { id: "B", name: "B", team: [B], activeIndex: 0 },
    ];
    const actions: Action[] = [
      { type: "move", actorPlayerId: "A", pokemonId: "A1", moveId: "nuke", targetPlayerId: "B", targetPokemonId: "B1" },
    ];
  const i2 = init(JSON.parse(JSON.stringify(players)), 222);
  const resx = i2.engine.processTurn(actions);
  expect(resx.state.players[1].team[0].currentHP).toBe(1);
  });
});
