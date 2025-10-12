"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapMove = mapMove;
exports.mapPokemon = mapPokemon;
exports.mapTeamToPlayer = mapTeamToPlayer;
exports.mapMatchToPlayers = mapMatchToPlayers;
function mapMove(ext) {
    return {
        id: ext.id,
        name: ext.name,
        type: ext.type,
        category: ext.category?.toString?.().toLowerCase?.() === "status"
            ? "Status"
            : ext.category?.toString?.().toLowerCase?.() === "special"
                ? "Special"
                : "Physical",
        power: typeof ext.basePower === "number" ? ext.basePower : undefined,
        accuracy: typeof ext.accuracy === "number" ? ext.accuracy : undefined,
        priority: ext.priority ?? 0,
    };
}
function normalizeStats(raw) {
    const spa = raw.spa ?? raw.spA ?? raw.SpA ?? raw.specialAttack ?? 50;
    const spd = raw.spd ?? raw.spD ?? raw.SpD ?? raw.specialDefense ?? 50;
    return {
        hp: raw.hp ?? raw.HP ?? raw.Hp ?? 50,
        atk: raw.atk ?? raw.atk ?? raw.ATK ?? raw.attack ?? 50,
        def: raw.def ?? raw.DEF ?? raw.defense ?? 50,
        spa,
        spd,
        spe: raw.spe ?? raw.SPE ?? raw.speed ?? 50,
    };
}
function mapPokemon(idPrefix, idx, sp, tp, moveMap) {
    const name = tp.nickname || sp.name;
    const level = tp.level ?? 50;
    const moves = tp.moves.map(moveMap).filter(Boolean);
    const baseStats = normalizeStats(sp.baseStats);
    const maxHP = baseStats.hp;
    return {
        id: `${idPrefix}-${idx}`,
        name,
        level,
        types: sp.types,
        baseStats,
        currentHP: maxHP,
        maxHP,
        stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
        status: "none",
        volatile: {},
        moves,
    };
}
function mapTeamToPlayer(team, dex) {
    const moveMap = (id) => mapMove(dex.moves[id]);
    const speciesMap = (id) => dex.species[id];
    const mons = team.party.map((tp, i) => mapPokemon(team.playerId, i + 1, speciesMap(tp.speciesId), tp, moveMap));
    return {
        id: team.playerId,
        name: team.name,
        team: mons,
        activeIndex: 0,
    };
}
function mapMatchToPlayers(teams, dex) {
    return [mapTeamToPlayer(teams[0], dex), mapTeamToPlayer(teams[1], dex)];
}
//# sourceMappingURL=pokedex-adapter.js.map