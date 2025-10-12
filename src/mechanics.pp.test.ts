import { describe, it, expect } from "vitest";
import Engine from "./engine";
import { Player, MoveAction } from "./types";
import { defaultStats, sampleMon, TACKLE, CALM_MIND } from "./samples";

describe("PP tracking", () => {
  it("decrements PP and blocks when 0", () => {
    const lowPPMove = { ...CALM_MIND, id: "calmmind-pp2", name: "Calm Mind (PP2)", pp: 2 };
    const p1: Player = { id: "p1", name: "P1", activeIndex: 0, team: [sampleMon("p1-1", "A", ["Normal"], defaultStats({ hp: 100 }), [TACKLE])] };
    const p2: Player = { id: "p2", name: "P2", activeIndex: 0, team: [sampleMon("p2-1", "B", ["Psychic"], defaultStats({ hp: 100 }), [lowPPMove])] };
    const engine = new Engine({ seed: 1 });
    engine.initializeBattle([p1, p2], { seed: 1 });

    const useCalm = () => engine.processTurn([
      { type: "move", actorPlayerId: "p2", pokemonId: "p2-1", moveId: lowPPMove.id, targetPlayerId: "p2", targetPokemonId: "p2-1" } as MoveAction,
    ]).events.join("\n");

    const first = useCalm();
    expect(first).toMatch(/rose/i);
    const second = useCalm();
    expect(second).toMatch(/rose/i);
    const third = useCalm();
    expect(third).toMatch(/no PP left/i);
  });
});
