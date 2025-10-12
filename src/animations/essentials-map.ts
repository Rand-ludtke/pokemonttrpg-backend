import { AnimationEvent } from "../types";

export interface EssentialsAnim {
  key: string; // e.g., "Moves/Ember", "Hit/Default", "Weather/SandstormTick"
  params?: Record<string, unknown>;
}

// Very rough starter mapping to Pokémon Essentials-style animation keys.
// Frontend can use this to choose which animation to play.
export function mapAnimationEventToEssentials(ev: AnimationEvent): EssentialsAnim | null {
  switch (ev.type) {
    case "move:start": {
      const moveId = ev.payload?.moveId as string | undefined;
      if (!moveId) return { key: "Moves/Unknown" };
      // Title-case common IDs and map to a folder namespace
      const name = moveId.replace(/(^|[-_\s])([a-z])/g, (_, s, c) => s + c.toUpperCase());
      return { key: `Moves/${name}`, params: { userId: ev.payload?.userId } };
    }
    case "move:hit":
      return { key: "Hit/Default", params: { targetId: ev.payload?.targetId, damage: ev.payload?.damage } };
    case "pokemon:faint":
      return { key: "Pokemon/Faint", params: { pokemonId: ev.payload?.pokemonId } };
    case "switch":
      return { key: "Pokemon/SendOut", params: { playerId: ev.payload?.playerId, pokemonId: ev.payload?.pokemonId } };
    case "move:blocked":
      return { key: "Moves/Blocked", params: { targetId: ev.payload?.targetId } };
    case "move:charge":
      return { key: "Moves/Charge", params: { userId: ev.payload?.userId, moveId: ev.payload?.moveId } };
    case "weather:sandstorm:tick":
      return { key: "Weather/SandstormTick", params: { pokemonId: ev.payload?.pokemonId, damage: ev.payload?.damage } };
    case "weather:sandstorm:start":
      return { key: "Weather/SandstormStart" };
    case "weather:sandstorm:end":
      return { key: "Weather/SandstormEnd" };
    case "terrain:grassy:heal":
      return { key: "Terrain/GrassyHeal", params: { pokemonId: ev.payload?.pokemonId, heal: ev.payload?.heal } };
    case "terrain:grassy:start":
      return { key: "Terrain/GrassyStart" };
    case "terrain:grassy:end":
      return { key: "Terrain/GrassyEnd" };
    case "survive:focus-sash":
      return { key: "Items/FocusSash", params: { pokemonId: ev.payload?.pokemonId } };
    case "survive:sturdy":
      return { key: "Abilities/Sturdy", params: { pokemonId: ev.payload?.pokemonId } };
    case "ability:flash-fire":
      return { key: "Abilities/FlashFire", params: { pokemonId: ev.payload?.pokemonId } };
    case "item:life-orb:recoil":
      return { key: "Items/LifeOrb", params: { pokemonId: ev.payload?.pokemonId, damage: ev.payload?.damage } };
    case "item:air-balloon:pop":
      return { key: "Items/AirBalloonPop", params: { pokemonId: ev.payload?.pokemonId } };
    default:
      return null;
  }
}
