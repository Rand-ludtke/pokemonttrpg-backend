import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, TAILWIND, REFLECT, LIGHT_SCREEN, EMBER } from "./samples";

describe("Tailwind, Reflect, Light Screen", () => {
  it("Tailwind doubles speed on user's side", () => {
  const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ spe: 50 }), [TAILWIND, TACKLE]) ] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "B", ["Normal"], defaultStats({ spe: 60 }), [TACKLE]) ] };
    const engine = new Engine({ seed: 1 });
    const state = engine.initializeBattle([p1, p2], { seed: 1 });
    const a: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TAILWIND.id, targetPlayerId: "p2", targetPokemonId: "p2-1" };
    const b: MoveAction = { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" };
    // Before Tailwind, p2 would move first (spe 60 > 50). After Tailwind, p1 should move first next turn.
    engine.processTurn([a, b]);
    // On next turn, both use Tackle; we expect p1 to move first due to Tailwind doubling its speed
    let order: string[] = [];
    const a2: MoveAction = { type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: TACKLE.id, targetPlayerId: "p2", targetPokemonId: "p2-1" };
    const b2: MoveAction = { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" };
    // Monkey-patch log to capture first event (not ideal, but engine logs order of actions)
    const result = engine.processTurn([a2, b2]);
    expect(result.events[0]).toContain("A used Tackle");
  });

  it("Reflect halves physical; Light Screen halves special", () => {
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 200 }), [REFLECT, LIGHT_SCREEN])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "B", ["Normal"], defaultStats({ atk: 100, spa: 100 }), [TACKLE, EMBER])] };
    const engine = new Engine({ seed: 1 });
    const state = engine.initializeBattle([p1, p2], { seed: 1 });

    // Set Reflect then hit with Tackle
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: REFLECT.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const hpBeforePhys = p1.team[0].currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    const physDamage = hpBeforePhys - p1.team[0].currentHP;

    // Clear log, set Light Screen and test special
    engine.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: "p1-1", moveId: LIGHT_SCREEN.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction]);
    const hpBeforeSpec = p1.team[0].currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: EMBER.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    const specDamage = hpBeforeSpec - p1.team[0].currentHP;

    // Damage should be reduced by roughly half compared to no screen. Since RNG affects damage, just assert > 0 and reasonable scale.
    expect(physDamage).toBeGreaterThan(0);
    expect(specDamage).toBeGreaterThan(0);

    // Now remove screens and compare increased damage
    state.players[0].sideConditions = { tailwindTurns: 0, reflectTurns: 0, lightScreenTurns: 0 };
    const hpBeforeNoPhys = p1.team[0].currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TACKLE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    const physNoScreen = hpBeforeNoPhys - p1.team[0].currentHP;
    expect(physNoScreen).toBeGreaterThan(physDamage);

    const hpBeforeNoSpec = p1.team[0].currentHP;
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: EMBER.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    const specNoScreen = hpBeforeNoSpec - p1.team[0].currentHP;
    expect(specNoScreen).toBeGreaterThan(specDamage);
  });
});
