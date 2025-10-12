import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, RAIN_DANCE, SUNNY_DAY, THUNDER, HURRICANE, MAGIC_ROOM, TACKLE } from "./samples";

// Validate precedence: Cloud Nine/Air Lock should suppress weather effects regardless of Magic Room and Umbrella.
// That means Thunder/Hurricane should use their baseline accuracy when Cloud Nine/Air Lock is present.

describe("Cloud Nine/Air Lock gating with Magic Room and Umbrella", () => {
  function setup(seed = 21) {
    const a = sampleMon("p1-1","Caster", ["Normal"], defaultStats({ spa: 100 }), [RAIN_DANCE, SUNNY_DAY, THUNDER, HURRICANE, MAGIC_ROOM]);
    const b = sampleMon("p2-1","Target", ["Normal"], defaultStats({ hp: 5000, spd: 80 }), [TACKLE]);
    (b as any).item = "utility_umbrella";
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };
    const eng = new Engine({ seed }); eng.initializeBattle([p1, p2], { seed });
    return { eng, a, b, p1, p2 };
  }

  it("Thunder in rain is baseline accuracy when Cloud Nine is active, even if Umbrella and Magic Room interact", () => {
    const { eng, a, b, p1, p2 } = setup(22);
    // Set rain
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: RAIN_DANCE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    // Apply Cloud Nine on target
    (b as any).ability = "cloud_nine";

    // Without MR: rain accuracy should be suppressed by Cloud Nine -> not guaranteed hit; check across attempts for at least one miss
    let miss = false;
    for (let i=0;i<5;i++) {
      const hp = b.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: THUNDER.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
      if (b.currentHP === hp) { miss = true; break; }
    }
    expect(miss).toBe(true);

    // With MR active (suppress Umbrella): still suppressed by Cloud Nine
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: MAGIC_ROOM.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    miss = false;
    for (let i=0;i<5;i++) {
      const hp = b.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: THUNDER.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
      if (b.currentHP === hp) { miss = true; break; }
    }
    expect(miss).toBe(true);
  });

  it("Hurricane in sun is baseline accuracy when Cloud Nine is active, regardless of Umbrella and MR", () => {
    const { eng, a, b, p1, p2 } = setup(23);
    // Set sun
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: SUNNY_DAY.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    (b as any).ability = "cloud_nine";

    // Without MR first
    let sawHit = false;
    for (let i=0;i<5;i++) {
      const hp = b.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: HURRICANE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
      if (b.currentHP < hp) { sawHit = true; break; }
    }
    expect(sawHit).toBe(true);

    // With MR next
    eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: MAGIC_ROOM.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
    sawHit = false;
    for (let i=0;i<5;i++) {
      const hp = b.currentHP;
      eng.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: HURRICANE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
      if (b.currentHP < hp) { sawHit = true; break; }
    }
    expect(sawHit).toBe(true);
  });
});
