import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { MoveAction, Player } from "./types";
import { QUICK_ATTACK, TACKLE, defaultStats, sampleMon } from "./samples";

const setup = () => {
  const p1 = {
    id: "p1",
    name: "P1",
    team: [sampleMon("p1-1", "FastMon", ["Normal"], defaultStats({ spe: 100, hp: 100 }), [TACKLE, QUICK_ATTACK])],
    activeIndex: 0,
  } satisfies Player;
  const p2 = {
    id: "p2",
    name: "P2",
    team: [sampleMon("p2-1", "SlowMon", ["Normal"], defaultStats({ spe: 50, hp: 100 }), [TACKLE])],
    activeIndex: 0,
  } satisfies Player;
  const engine = new Engine({ seed: 42 });
  engine.initializeBattle([p1, p2]);
  return { engine, p1, p2 };
};

describe("action ordering", () => {
  it("resolves by priority then speed", () => {
    const { engine, p1, p2 } = setup();
    const a1: MoveAction = {
      type: "move",
      actorPlayerId: p1.id,
      pokemonId: p1.team[0].id,
      moveId: QUICK_ATTACK.id,
      targetPlayerId: p2.id,
      targetPokemonId: p2.team[0].id,
    };
    const a2: MoveAction = {
      type: "move",
      actorPlayerId: p2.id,
      pokemonId: p2.team[0].id,
      moveId: TACKLE.id,
      targetPlayerId: p1.id,
      targetPokemonId: p1.team[0].id,
    };
    const res = engine.processTurn([a2, a1]);
    // Quick Attack (priority 1) should go before Tackle (0)
    expect(res.events[0]).toContain("FastMon used Quick Attack");
  });
});

describe("burn residual", () => {
  it("applies burn damage at end of turn when status is burn", () => {
    const { engine, p1, p2 } = setup();
    // Manually set burn on p1 active
    p1.team[0].status = "burn";
    const a1: MoveAction = {
      type: "move",
      actorPlayerId: p1.id,
      pokemonId: p1.team[0].id,
      moveId: TACKLE.id,
      targetPlayerId: p2.id,
      targetPokemonId: p2.team[0].id,
    };
    const a2: MoveAction = {
      type: "move",
      actorPlayerId: p2.id,
      pokemonId: p2.team[0].id,
      moveId: TACKLE.id,
      targetPlayerId: p1.id,
      targetPokemonId: p1.team[0].id,
    };

    // Register burn tick
    engine.onStatusTick((pokemon, status, _state, log) => {
      if (status === "burn") {
        const dmg = Math.max(1, Math.floor(pokemon.maxHP / 16));
        pokemon.currentHP = Math.max(0, pokemon.currentHP - dmg);
        log(`${pokemon.name} is hurt by its burn! (${dmg})`);
      }
    });

    const before = p1.team[0].currentHP;
    const res = engine.processTurn([a1, a2]);
    const after = p1.team[0].currentHP;
    expect(after).toBeLessThan(before);
    expect(res.events.some((e) => e.includes("hurt by its burn"))).toBeTruthy();
  });
});
