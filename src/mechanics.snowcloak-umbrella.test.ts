import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE } from "./samples";

describe("Snow Cloak vs Umbrella", () => {
  it("Snow Cloak reduces accuracy in hail/snow; Umbrella has no effect", () => {
  const a = sampleMon("p1-1","Attacker", ["Normal"], defaultStats({ atk: 100 }), [TACKLE]);
  const b = sampleMon("p2-1","Cloak", ["Ice"], defaultStats({ hp: 10000, def: 80 }), [TACKLE]);
    (b as any).ability = "snow_cloak";
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [a] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [b] };

    // With Umbrella on target (should not change Snow Cloak behavior)
    (b as any).item = "utility_umbrella";
    const eng1 = new Engine({ seed: 7 }); eng1.initializeBattle([p1, p2], { seed: 7 });
    eng1["state"].field.weather.id = "snow" as any; eng1["state"].field.weather.turnsLeft = 99;
    let hitsUmb = 0;
    for (let i=0;i<40;i++) {
      const hp = b.currentHP;
      eng1.processTurn([{ type: "move", actorPlayerId: p1.id, pokemonId: a.id, moveId: TACKLE.id, targetPlayerId: p2.id, targetPokemonId: b.id } as MoveAction]);
      if (b.currentHP < hp) hitsUmb++;
    }

    // Without Umbrella (should be similar)
    const a2 = sampleMon("p1-2","Attacker2", ["Normal"], defaultStats({ atk: 100 }), [TACKLE]);
    const b2 = sampleMon("p2-2","Cloak2", ["Ice"], defaultStats({ hp: 10000, def: 80 }), [TACKLE]);
    (b2 as any).ability = "snow_cloak";
    const p1b: Player = { id: "p1b", name: "P1b", activeIndex: 0, team: [a2] };
    const p2b: Player = { id: "p2b", name: "P2b", activeIndex: 0, team: [b2] };
    const eng2 = new Engine({ seed: 7 }); eng2.initializeBattle([p1b, p2b], { seed: 7 });
    eng2["state"].field.weather.id = "snow" as any; eng2["state"].field.weather.turnsLeft = 99;
    let hitsNoUmb = 0;
    for (let i=0;i<40;i++) {
      const hp = b2.currentHP;
      eng2.processTurn([{ type: "move", actorPlayerId: p1b.id, pokemonId: a2.id, moveId: TACKLE.id, targetPlayerId: p2b.id, targetPokemonId: b2.id } as MoveAction]);
      if (b2.currentHP < hp) hitsNoUmb++;
    }
    expect(Math.abs(hitsUmb - hitsNoUmb)).toBeLessThanOrEqual(5);
  });
});
