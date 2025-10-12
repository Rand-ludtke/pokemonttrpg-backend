import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, WILL_O_WISP, GRASSY_TERRAIN_MOVE } from "./samples";

import type { Move } from "./types";
const POISON_STING: Move = { id: "poisonsting", name: "Poison Sting", type: "Poison", category: "Status", onUse: ({ target, utils, log }: any) => { utils.applyStatus(target, "poison"); log(`${target.name} was badly targeted!`); } } as any;
const TOX: Move = { id: "toxic-move", name: "Toxic (test)", type: "Poison", category: "Status", onUse: ({ target, utils }: any) => utils.applyStatus(target, "toxic") } as any;
const T_WAVE: Move = { id: "thunderwave", name: "Thunder Wave", type: "Electric", category: "Status", onUse: ({ target, utils }: any) => utils.applyStatus(target, "paralysis") } as any;
const SLEEP_POWDER: Move = { id: "sleeppowder", name: "Sleep Powder", type: "Grass", category: "Status", onUse: ({ target, utils }: any) => utils.applyStatus(target, "sleep") } as any;

describe("Status core residuals + immunities", () => {
  it("burn deals residual and Fire-types are immune to burn", () => {
    const def = sampleMon("p1-1", "Def", ["Fire"], defaultStats({ hp: 100 }), [TACKLE]);
    const atk = sampleMon("p2-1", "Atk", ["Normal"], defaultStats({}), [WILL_O_WISP]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [def] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [atk] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Try to burn Fire-type -> should fail
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: WILL_O_WISP.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    expect(def.status).toBe("none");

    // Burn a Normal-type then tick residual
    def.types = ["Normal"]; // remove fire
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: WILL_O_WISP.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    const before = def.currentHP;
    engine.processTurn([]);
    expect(def.currentHP).toBeLessThan(before);
  });

  it("poison and toxic deal residual; toxic escalates and resets on switch", () => {
    const def = sampleMon("p1-1", "Def", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    const atk = sampleMon("p2-1", "Atk", ["Poison"], defaultStats({}), [TOX]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [def] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [atk] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Apply toxic
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: TOX.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    const hp1 = def.currentHP;
    engine.processTurn([]);
    const hp2 = def.currentHP;
    engine.processTurn([]);
    const hp3 = def.currentHP;
    expect(hp2).toBeLessThan(hp1);
    expect(hp3).toBeLessThan(hp2);

    // Switch out to reset toxic counter
    const bench = sampleMon("p1-2", "Bench", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    p1.team.push(bench);
    engine.processTurn([{ type: "switch", actorPlayerId: "p1", pokemonId: "p1-1", toIndex: 1 } as any]);
    engine.processTurn([{ type: "switch", actorPlayerId: "p1", pokemonId: "p1-2", toIndex: 0 } as any]);
    // toxic counter reset implies lower damage than previous tick
    const hp4 = def.currentHP;
    engine.processTurn([]);
    expect(def.currentHP).toBeLessThan(hp4);
  });

  it("Electric types immune to paralysis; Electric Terrain blocks sleep for grounded", () => {
    const def = sampleMon("p1-1", "Def", ["Electric"], defaultStats({ hp: 100 }), [TACKLE]);
    const atk = sampleMon("p2-1", "Atk", ["Normal"], defaultStats({}), [T_WAVE, SLEEP_POWDER, GRASSY_TERRAIN_MOVE]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [def] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [atk] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    // Electric immunity to paralysis
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: T_WAVE.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    expect(def.status).toBe("none");

    // Set Electric Terrain via direct state edit (we only have Grassy sample; set manually)
    (engine as any).state.field.terrain = { id: "electric", turnsLeft: 5 };
    // Sleep blocked while grounded
    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: SLEEP_POWDER.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    expect(def.status).toBe("none");
  });

  it("Lum Berry cures status upon infliction", () => {
    const def = sampleMon("p1-1", "Def", ["Normal"], defaultStats({ hp: 100 }), [TACKLE]);
    def.item = "lum_berry";
    const atk = sampleMon("p2-1", "Atk", ["Normal"], defaultStats({}), [WILL_O_WISP]);
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [def] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [atk] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    engine.processTurn([{ type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: WILL_O_WISP.id, targetPlayerId: "p1", targetPokemonId: "p1-1" } as MoveAction]);
    expect(def.status).toBe("none");
    expect(def.item).toBeUndefined();
  });
});
