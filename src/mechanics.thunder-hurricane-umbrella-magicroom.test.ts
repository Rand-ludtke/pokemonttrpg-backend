import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, RAIN_DANCE, SUNNY_DAY, THUNDER, HURRICANE, TACKLE } from "./samples";

describe("Thunder/Hurricane with Umbrella and Magic Room", () => {
  it("Thunder in rain normally bypasses accuracy, but target Umbrella restores accuracy check", () => {
    const atk = sampleMon("p1-1","RainCaster", ["Water"], defaultStats({}), [RAIN_DANCE, THUNDER]);
    const def = sampleMon("p2-1","UmbrellaTarget", ["Normal"], defaultStats({}), [TACKLE]);
    (def as any).item = "utility_umbrella";
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [atk] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [def] };
    const eng = new Engine({ seed: 2 }); eng.initializeBattle([p1, p2], { seed: 2 });

    // Set rain
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: atk.id, moveId: RAIN_DANCE.id, targetPlayerId: "p2", targetPokemonId: def.id } as MoveAction]);

    // With Umbrella on target, Thunder should no longer be 100% in rain. With our deterministic seed, force a miss at least once across retries.
    let sawMiss = false;
    for (let i=0;i<5;i++) {
      const hpBefore = def.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: atk.id, moveId: THUNDER.id, targetPlayerId: "p2", targetPokemonId: def.id } as MoveAction]);
      if (def.currentHP === hpBefore) { sawMiss = true; break; }
    }
    expect(sawMiss).toBe(true);
  });

  it("Magic Room suppresses Umbrella, re-enabling Thunder's perfect rain accuracy", () => {
    const atk = sampleMon("p1-1","RainCaster", ["Water"], defaultStats({}), [RAIN_DANCE, THUNDER]);
    const def = sampleMon("p2-1","Target", ["Normal"], defaultStats({}), [TACKLE]);
    (def as any).item = "utility_umbrella";
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [atk] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [def] };
    const eng = new Engine({ seed: 3 }); eng.initializeBattle([p1, p2], { seed: 3 });

    // Set rain via move
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: atk.id, moveId: RAIN_DANCE.id, targetPlayerId: "p2", targetPokemonId: def.id } as MoveAction]);

  // Turn on Magic Room
  eng["state"].field.magicRoom.id = "magic_room" as any;
  eng["state"].field.magicRoom.turnsLeft = 5;

    // Now Thunder should always connect in rain (No Guard-like behavior), so across a few tries we should see no misses
    let anyMiss = false;
    for (let i=0;i<3;i++) {
      const hpBefore = def.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: atk.id, moveId: THUNDER.id, targetPlayerId: "p2", targetPokemonId: def.id } as MoveAction]);
      if (def.currentHP === hpBefore) { anyMiss = true; }
    }
    expect(anyMiss).toBe(false);
  });

  it("Hurricane in sun is normally accuracy-reduced; Umbrella on target cancels the sun penalty restoring standard accuracy, and Magic Room re-applies sun penalty", () => {
    const atk = sampleMon("p1-1","SunCaster", ["Flying"], defaultStats({}), [SUNNY_DAY, HURRICANE]);
    const def = sampleMon("p2-1","Target", ["Normal"], defaultStats({}), [TACKLE]);
    (def as any).item = "utility_umbrella";
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [atk] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [def] };
    const eng = new Engine({ seed: 5 }); eng.initializeBattle([p1, p2], { seed: 5 });

    // Set sun
    eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: atk.id, moveId: SUNNY_DAY.id, targetPlayerId: "p2", targetPokemonId: def.id } as MoveAction]);

    // With target Umbrella, Hurricane sun penalty is canceled; across a few tries we expect at least one hit
    let hit = false;
    for (let i=0;i<5;i++) {
      const hpBefore = def.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: atk.id, moveId: HURRICANE.id, targetPlayerId: "p2", targetPokemonId: def.id } as MoveAction]);
      if (def.currentHP < hpBefore) { hit = true; break; }
    }
    expect(hit).toBe(true);

    // Now enable Magic Room to suppress Umbrella; sun penalty should apply again, so we should be able to see at least one miss across attempts
    eng["state"].field.magicRoom.id = "magic_room" as any;
    eng["state"].field.magicRoom.turnsLeft = 5;
    let sawMiss = false;
    for (let i=0;i<5;i++) {
      const hpBefore = def.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: "p1", pokemonId: atk.id, moveId: HURRICANE.id, targetPlayerId: "p2", targetPokemonId: def.id } as MoveAction]);
      if (def.currentHP === hpBefore) { sawMiss = true; break; }
    }
    expect(sawMiss).toBe(true);
  });
});
