"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeNeedsSwitch = computeNeedsSwitch;
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const engine_1 = __importDefault(require("../engine"));
const sync_ps_engine_1 = __importDefault(require("../sync-ps-engine"));
const abilities_1 = require("../data/abilities");
const items_1 = require("../data/items");
const showdown_converter_1 = require("../data/converters/showdown-converter");
const showdown_species_moves_1 = require("../data/converters/showdown-species-moves");
// Configuration: Use Pokemon Showdown engine (true) or custom engine (false)
const USE_PS_ENGINE = process.env.USE_PS_ENGINE !== "false"; // Default to PS engine
// Simple JSON persistence directories (for Raspberry Pi prototype)
const DATA_DIR = path_1.default.resolve(process.cwd(), "data");
const REPLAYS_DIR = path_1.default.join(DATA_DIR, "replays");
const CUSTOM_DEX_FILE = path_1.default.join(DATA_DIR, "customdex.json");
if (!fs_1.default.existsSync(DATA_DIR))
    fs_1.default.mkdirSync(DATA_DIR);
if (!fs_1.default.existsSync(REPLAYS_DIR))
    fs_1.default.mkdirSync(REPLAYS_DIR);
const DEFAULT_LOBBY_ID = "global-lobby";
const DEFAULT_LOBBY_NAME = "Global Lobby";
function createRoomRecord(id, name) {
    return {
        id,
        name,
        players: [],
        spectators: [],
        engine: undefined,
        battleStarted: false,
        startProtocolSent: false,
        turnBuffer: {},
        replay: [],
        phase: "normal",
        teamPreviewPlayers: undefined,
        teamPreviewOrders: undefined,
        teamPreviewRules: undefined,
        forceSwitchNeeded: new Set(),
        forceSwitchTimer: undefined,
        forceSwitchDeadline: undefined,
        turnTimer: undefined,
        turnDeadline: undefined,
        challenges: new Map(),
        lastPromptByPlayer: {},
    };
}
function challengeSummary(ch) {
    return {
        id: ch.id,
        roomId: ch.roomId,
        status: ch.status,
        createdAt: ch.createdAt,
        open: ch.open && !ch.target,
        format: ch.format,
        rules: ch.rules,
        owner: {
            id: ch.owner.playerId,
            username: ch.owner.username,
            accepted: ch.owner.accepted,
            ready: Boolean(ch.owner.playerPayload),
        },
        target: ch.target
            ? {
                id: ch.target.playerId,
                username: ch.target.username,
                accepted: ch.target.accepted,
                ready: Boolean(ch.target.playerPayload),
            }
            : null,
    };
}
function challengeSummaries(room) {
    return Array.from(room.challenges.values()).map(challengeSummary);
}
function findPlayerBySocket(room, socketId) {
    return room.players.find((p) => p.socketId === socketId);
}
function findSpectatorBySocket(room, socketId) {
    return room.spectators.find((s) => s.socketId === socketId);
}
function removeClientFromRoom(room, socketId) {
    const playersBefore = room.players.length;
    room.players = room.players.filter((p) => p.socketId !== socketId);
    const spectatorsBefore = room.spectators.length;
    room.spectators = room.spectators.filter((s) => s.socketId !== socketId);
    return playersBefore !== room.players.length || spectatorsBefore !== room.spectators.length;
}
const app = (0, express_1.default)();
// Enable CORS for all API routes
app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (_req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});
app.use(express_1.default.json());
// --- Custom Dex persistence & helpers ---
function loadCustomDex() {
    try {
        if (fs_1.default.existsSync(CUSTOM_DEX_FILE)) {
            const json = JSON.parse(fs_1.default.readFileSync(CUSTOM_DEX_FILE, "utf-8"));
            // Ensure shape
            return { species: json.species ?? {}, moves: json.moves ?? {} };
        }
    }
    catch { }
    return { species: {}, moves: {} };
}
function saveCustomDex(dex) {
    const payload = { species: dex.species ?? {}, moves: dex.moves ?? {} };
    fs_1.default.writeFileSync(CUSTOM_DEX_FILE, JSON.stringify(payload, null, 2));
}
function diffDex(serverDex, clientDex) {
    const missingOnClient = { species: {}, moves: {} };
    const missingOnServer = { species: {}, moves: {} };
    // Server -> Client (what client lacks)
    for (const [id, s] of Object.entries(serverDex.species ?? {})) {
        if (!clientDex.species || !clientDex.species[id])
            missingOnClient.species[id] = s;
    }
    for (const [id, m] of Object.entries(serverDex.moves ?? {})) {
        if (!clientDex.moves || !clientDex.moves[id])
            missingOnClient.moves[id] = m;
    }
    // Client -> Server (what server lacks)
    for (const [id, s] of Object.entries(clientDex.species ?? {})) {
        if (!serverDex.species || !serverDex.species[id])
            missingOnServer.species[id] = s;
    }
    for (const [id, m] of Object.entries(clientDex.moves ?? {})) {
        if (!serverDex.moves || !serverDex.moves[id])
            missingOnServer.moves[id] = m;
    }
    return { missingOnClient, missingOnServer };
}
app.get("/api/rooms", (_req, res) => {
    const list = Array.from(rooms.values()).map((r) => ({
        id: r.id,
        name: r.name,
        players: r.players.map((p) => p.username),
        spectCount: r.spectators.length,
        started: r.battleStarted,
        challengeCount: r.challenges.size,
    }));
    res.json(list);
});
// Custom Dex APIs
// 1) Read server-side store
app.get("/api/customdex", (_req, res) => {
    const dex = loadCustomDex();
    res.json(dex);
});
// 2) Sync: client posts its dex; server returns what client is missing (from server),
//    and what server is missing (from client). Client may then call /upload to add to server.
app.post("/api/customdex/sync", (req, res) => {
    const clientDex = (req.body ?? {});
    const serverDex = loadCustomDex();
    const { missingOnClient, missingOnServer } = diffDex(serverDex, clientDex);
    res.json({ missingOnClient, missingOnServer });
});
// 3) Upload: merge new entries from client into server store (no overwrite by default)
app.post("/api/customdex/upload", (req, res) => {
    const incoming = (req.body ?? {});
    const serverDex = loadCustomDex();
    let addedSpecies = 0;
    let addedMoves = 0;
    serverDex.species = serverDex.species || {};
    serverDex.moves = serverDex.moves || {};
    for (const [id, s] of Object.entries(incoming.species ?? {})) {
        if (!serverDex.species[id]) {
            serverDex.species[id] = s;
            addedSpecies++;
        }
    }
    for (const [id, m] of Object.entries(incoming.moves ?? {})) {
        if (!serverDex.moves[id]) {
            serverDex.moves[id] = m;
            addedMoves++;
        }
    }
    saveCustomDex(serverDex);
    res.json({ ok: true, added: { species: addedSpecies, moves: addedMoves } });
});
app.get("/api/rooms/:id", (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room)
        return res.status(404).json({ error: "room not found" });
    res.json({
        id: room.id,
        name: room.name,
        players: room.players.map((p) => ({ id: p.id, username: p.username })),
        spectCount: room.spectators.length,
        started: room.battleStarted,
        challengeCount: room.challenges.size,
    });
});
app.get("/api/replay/:id", (req, res) => {
    const file = path_1.default.join(REPLAYS_DIR, `${req.params.id}.json`);
    if (!fs_1.default.existsSync(file))
        return res.status(404).send("Replay not found");
    res.download(file);
});
app.get("/api/replays", (_req, res) => {
    const files = fs_1.default.readdirSync(REPLAYS_DIR).filter(f => f.endsWith('.json'));
    const list = files.map(f => ({ id: f.replace(/\.json$/, ''), size: fs_1.default.statSync(path_1.default.join(REPLAYS_DIR, f)).size }));
    res.json(list);
});
app.get("/api/replays/:id/meta", (req, res) => {
    const file = path_1.default.join(REPLAYS_DIR, `${req.params.id}.json`);
    if (!fs_1.default.existsSync(file))
        return res.status(404).json({ error: "not found" });
    const json = JSON.parse(fs_1.default.readFileSync(file, "utf-8"));
    res.json({ id: json.id, room: json.room, createdAt: json.createdAt, turns: json.replay?.length ?? 0 });
});
// Compact spectator snapshot: mirrors spectate_start payload
app.get("/api/rooms/:id/snapshot", (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room || !room.engine)
        return res.status(404).json({ error: "room not found or battle not started" });
    const needsSwitch = room.forceSwitchNeeded ? Array.from(room.forceSwitchNeeded) : [];
    const state = room.engine.getState();
    res.json({ state, replay: room.replay, phase: room.phase ?? "normal", needsSwitch, deadline: room.forceSwitchDeadline ?? null, rooms: { trick: state.field.room, magic: state.field.magicRoom, wonder: state.field.wonderRoom } });
});
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, { cors: { origin: "*" } });
process.on("uncaughtException", (err) => {
    console.error("[Server] Uncaught exception:", err?.stack || err);
});
process.on("unhandledRejection", (err) => {
    console.error("[Server] Unhandled rejection:", err);
});
function emitChallengeCreated(room, challenge) {
    io.to(room.id).emit("challengeCreated", { roomId: room.id, challenge: challengeSummary(challenge) });
}
function emitChallengeUpdated(room, challenge) {
    io.to(room.id).emit("challengeUpdated", { roomId: room.id, challenge: challengeSummary(challenge) });
}
function emitChallengeRemoved(room, challengeId, reason) {
    io.to(room.id).emit("challengeRemoved", { roomId: room.id, challengeId, reason });
}
function coerceTrainerSprite(value) {
    let raw;
    if (typeof value === "string") {
        raw = value.trim();
    }
    else if (typeof value === "number" && Number.isFinite(value)) {
        raw = String(Math.trunc(value));
    }
    if (!raw)
        return undefined;
    // Normalize: lowercase, remove spaces/special chars
    const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "").replace(/[^a-z0-9]/gi, "");
    // Filter out invalid/placeholder values
    const invalid = ["pending", "random", "default", "unknown", "none", ""];
    if (invalid.includes(normalized))
        return undefined;
    return raw;
}
function sanitizePlayerPayload(player, participant) {
    const clone = JSON.parse(JSON.stringify(player));
    const cloneAny = clone;
    const trainerSprite = coerceTrainerSprite(cloneAny.trainerSprite ?? cloneAny.avatar ?? participant.trainerSprite);
    clone.id = participant.playerId;
    clone.name = clone.name || participant.username;
    if (typeof clone.activeIndex !== "number")
        clone.activeIndex = 0;
    // Always set/clear trainerSprite and avatar to ensure invalid values are removed
    cloneAny.trainerSprite = trainerSprite || undefined;
    cloneAny.avatar = trainerSprite || undefined;
    return clone;
}
function startTeamPreview(room, players, rules) {
    room.phase = "team-preview";
    room.teamPreviewPlayers = players;
    room.teamPreviewOrders = {};
    room.teamPreviewRules = rules;
    // Emit teamPreviewStarted FIRST so client can mount the battle tab before receiving prompts
    io.to(room.id).emit("teamPreviewStarted", { roomId: room.id });
    // Send team preview request to each player (after tab is mounted)
    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const playerSocket = room.players.find(p => p.id === player.id)?.socketId;
        if (!playerSocket)
            continue;
        const sock = io.sockets.sockets.get(playerSocket);
        if (!sock)
            continue;
        // Find opponent(s) for team preview display
        const opponents = players.filter((p, idx) => idx !== i);
        const maxTeamSize = rules?.maxTeamSize || Math.min(6, player.team.length);
        sock.emit("promptAction", {
            roomId: room.id,
            requestType: "teampreview",
            playerId: player.id,
            side: `p${i + 1}`,
            prompt: {
                teamPreview: true,
                maxTeamSize,
                side: {
                    id: `p${i + 1}`,
                    name: player.name || player.id,
                    pokemon: player.team.map((p, idx) => ({
                        id: p.id,
                        pokemonId: p.id,
                        ident: `p${i + 1}: ${p.name || p.species}`,
                        details: `${p.species}, L${p.level || 50}`,
                        condition: `${p.currentHP || p.stats?.hp || 100}/${p.stats?.hp || 100}`,
                        active: idx === 0,
                        stats: p.stats,
                        moves: p.moves,
                        baseAbility: p.ability,
                        item: p.item,
                        pokeball: p.pokeball || "pokeball",
                    })),
                },
            },
            // Include all players' teams so opponent can be displayed
            state: {
                players: players.map((p, pIdx) => ({
                    id: p.id,
                    name: p.name || p.id,
                    trainerSprite: p.trainerSprite,
                    avatar: p.avatar ?? p.trainerSprite,
                    activeIndex: 0,
                    team: p.team.map((mon) => ({
                        id: mon.id,
                        pokemonId: mon.id,
                        // Use mon.name as the species (in our type system, 'name' IS the species, 'nickname' is for display)
                        name: mon.nickname || mon.name || mon.species,
                        species: mon.species || mon.name, // Ensure species is always set
                        nickname: mon.nickname,
                        level: mon.level || 50,
                        types: mon.types,
                        gender: mon.gender,
                        shiny: mon.shiny,
                        item: mon.item,
                    })),
                })),
            },
        });
    }
}
function applyTeamOrder(player, order) {
    if (!order || !order.length)
        return player;
    const clone = JSON.parse(JSON.stringify(player));
    const newTeam = [];
    for (const slot of order) {
        const idx = slot - 1; // order is 1-based
        if (idx >= 0 && idx < clone.team.length) {
            newTeam.push(clone.team[idx]);
        }
    }
    // Add any remaining Pokemon not in the order
    for (let i = 0; i < clone.team.length; i++) {
        if (!order.includes(i + 1)) {
            newTeam.push(clone.team[i]);
        }
    }
    clone.team = newTeam;
    clone.activeIndex = 0;
    return clone;
}
function checkTeamPreviewComplete(room) {
    console.log(`[checkTeamPreviewComplete] phase=${room.phase}, hasPlayers=${!!room.teamPreviewPlayers}, hasOrders=${!!room.teamPreviewOrders}`);
    if (room.phase !== "team-preview" || !room.teamPreviewPlayers || !room.teamPreviewOrders)
        return;
    console.log(`[checkTeamPreviewComplete] Players:`, room.teamPreviewPlayers.map(p => p.id));
    console.log(`[checkTeamPreviewComplete] Orders submitted:`, Object.keys(room.teamPreviewOrders));
    const allSubmitted = room.teamPreviewPlayers.every(p => room.teamPreviewOrders[p.id]);
    console.log(`[checkTeamPreviewComplete] allSubmitted=${allSubmitted}`);
    if (!allSubmitted)
        return;
    // Apply team orders and start the battle
    const orderedPlayers = room.teamPreviewPlayers.map(player => {
        const order = room.teamPreviewOrders[player.id];
        return applyTeamOrder(player, order);
    });
    // Clear team preview state
    room.teamPreviewPlayers = undefined;
    room.teamPreviewOrders = undefined;
    const rules = room.teamPreviewRules;
    room.teamPreviewRules = undefined;
    // Start the actual battle
    beginBattle(room, orderedPlayers, rules?.seed);
}
function beginBattle(room, players, seed, rules) {
    try {
        // Check if team preview is enabled
        if (rules?.teamPreview && room.phase !== "team-preview") {
            startTeamPreview(room, players, rules);
            return;
        }
        const battleSeed = Number.isFinite(seed) ? seed : undefined;
        // Use Pokemon Showdown engine or custom engine based on configuration
        if (USE_PS_ENGINE) {
            console.log(`[Server] Using Pokemon Showdown battle engine with rules:`, JSON.stringify(rules));
            room.engine = new sync_ps_engine_1.default({ format: "gen9customgame", seed: battleSeed, rules });
        }
        else {
            console.log(`[Server] Using custom battle engine`);
            room.engine = new engine_1.default({ seed: battleSeed });
        }
        room.turnBuffer = {};
        room.replay = [];
        clearForceSwitchTimer(room);
        const hydratedPlayers = players.map((player) => {
            const clone = JSON.parse(JSON.stringify(player));
            const roomPlayer = room.players.find((p) => p.id === player.id);
            const trainerSprite = coerceTrainerSprite(clone.trainerSprite ?? clone.avatar ?? roomPlayer?.trainerSprite);
            // Always set/clear trainerSprite and avatar to ensure invalid values are removed
            clone.trainerSprite = trainerSprite || undefined;
            clone.avatar = trainerSprite || undefined;
            return clone;
        });
        const state = room.engine.initializeBattle(hydratedPlayers, { seed: battleSeed });
        // Ensure clients treat this as turn 1 when prompting (no pre-start move UI)
        if (typeof state.turn === "number" && state.turn < 1) {
            state.turn = 1;
        }
        room.battleStarted = true;
        room.phase = "normal";
        room.forceSwitchNeeded = new Set();
        console.log(`[Server] Emitting battleStarted for room ${room.id}`);
        io.to(room.id).emit("battleStarted", { roomId: room.id, state });
        // Emit initial protocol events (|start|, |switch|, |turn|1) before prompting for moves
        // This prevents a pre-start move prompt from showing before the battle is visually started.
        // ONLY do this if the engine hasn't already generated start events (SyncPSEngine now does)
        const hasStart = Array.isArray(state.log) && state.log.some((l) => l.startsWith("|start"));
        if (hasStart)
            room.startProtocolSent = true;
        if (!hasStart) {
            const initialEvents = buildInitialBattleProtocol(state);
            if (initialEvents.length > 0) {
                // Append to state.log so SyncPSEngine won't re-send these lines later
                if (Array.isArray(state.log)) {
                    for (const line of initialEvents) {
                        if (!state.log.includes(line))
                            state.log.push(line);
                    }
                }
                room.startProtocolSent = true;
                io.to(room.id).emit("battleUpdate", {
                    result: { state, events: initialEvents, anim: [] },
                    needsSwitch: Array.from(room.forceSwitchNeeded ?? []),
                });
            }
        }
        // Emit move prompts to each player so they can choose their first action
        emitMovePrompts(room, state);
    }
    catch (err) {
        console.error(`[Server] beginBattle failed for room ${room.id}:`, err?.stack || err);
        room.engine = undefined;
        room.battleStarted = false;
        room.startProtocolSent = false;
        room.phase = "normal";
        room.turnBuffer = {};
        room.forceSwitchNeeded = new Set();
        io.to(room.id).emit("battleStartError", {
            roomId: room.id,
            message: err?.message || "Failed to start battle",
        });
    }
}
function buildInitialBattleProtocol(state) {
    if (!state?.players?.length)
        return [];
    const lines = [];
    lines.push("|start");
    state.players.forEach((player, idx) => {
        const side = `p${idx + 1}`;
        const activeIndex = player.activeIndex || 0;
        const activePoke = player.team?.[activeIndex];
        if (!activePoke)
            return;
        const nickname = activePoke.nickname || activePoke.name;
        const species = activePoke.species || activePoke.name;
        const level = activePoke.level || 100;
        const gender = activePoke.gender === "M" ? ", M" : (activePoke.gender === "F" ? ", F" : "");
        const shiny = activePoke.shiny ? ", shiny" : "";
        const hp = activePoke.currentHP ?? activePoke.maxHP ?? 100;
        const maxHP = activePoke.maxHP ?? 100;
        const details = `${species}, L${level}${gender}${shiny}`;
        lines.push(`|switch|${side}a: ${nickname}|${details}|${hp}/${maxHP}`);
    });
    const turn = state.turn || 1;
    lines.push(`|turn|${turn}`);
    return lines;
}
// Deduplicate consecutive identical switch/drag lines (PS protocol sends private + public copies)
// Also deduplicate repeated switch events for the same slot within the same turn batch
function deduplicateSwitchLines(events) {
    const result = [];
    const seenSwitches = new Set();
    const seenSwitchTargets = new Map(); // slot -> pokemon name
    for (let i = 0; i < events.length; i++) {
        const line = events[i];
        // Skip |split| lines entirely - they're PS internal markers
        if (line.startsWith('|split|')) {
            continue;
        }
        // Check if this is a switch/drag line
        if (line.startsWith('|switch|') || line.startsWith('|drag|') || line.startsWith('|replace|')) {
            // Extract just the identity part (e.g., "p1a: Typhlosion") to compare
            const parts = line.split('|');
            const ident = parts[2] || ''; // e.g., "p1a: Typhlosion"
            // Extract slot (e.g., "p1a") and pokemon name from ident
            const identMatch = ident.match(/^(p[12][a-z]?):\s*(.+)$/);
            if (identMatch) {
                const slot = identMatch[1];
                const pokeName = identMatch[2].trim();
                // Skip if we've already seen a switch to this SAME Pokemon on this SAME slot
                // (This catches duplicate switch events like "Go! Charizard!" appearing twice)
                const prevPoke = seenSwitchTargets.get(slot);
                if (prevPoke && prevPoke.toLowerCase() === pokeName.toLowerCase()) {
                    console.log(`[deduplicateSwitchLines] Skipping duplicate switch: ${slot} -> ${pokeName}`);
                    continue;
                }
                seenSwitchTargets.set(slot, pokeName);
            }
            // Skip if we've already seen this exact switch line in this batch
            if (seenSwitches.has(ident)) {
                continue;
            }
            seenSwitches.add(ident);
        }
        result.push(line);
    }
    return result;
}
// Emit move prompts to all players in a battle
function emitMovePrompts(room, state) {
    if (!room.engine)
        return;
    const turn = state.turn || 1;
    if (!room.lastPromptByPlayer)
        room.lastPromptByPlayer = {};
    // Start turn timer when prompts are sent (if not already in a waiting state)
    if (Object.keys(room.turnBuffer).length === 0) {
        startTurnTimer(room);
        console.log(`[Server] Turn timer started for room ${room.id} turn ${turn} (${TURN_TIMEOUT_MS}ms)`);
    }
    const promptedPlayers = [];
    const skippedPlayers = [];
    for (const player of state.players) {
        const candidateSockets = room.players.filter((p) => p.id === player.id).map((p) => p.socketId);
        const playerSocket = candidateSockets.find((id) => io.sockets.sockets.has(id));
        if (!playerSocket) {
            skippedPlayers.push({ id: player.id, reason: "no valid socket" });
            continue;
        }
        const sock = io.sockets.sockets.get(playerSocket);
        if (!sock) {
            skippedPlayers.push({ id: player.id, reason: "socket not found" });
            continue;
        }
        const active = player.team[player.activeIndex];
        if (!active || active.currentHP <= 0) {
            skippedPlayers.push({ id: player.id, reason: "active fainted" });
            continue;
        }
        const alreadyActed = !!room.turnBuffer[player.id];
        promptedPlayers.push(player.id);
        // Get the PS engine's native request - this has the correct pokemon array ordering
        // PS reorders the pokemon array after switches so active is always at index 0
        let psRequest = null;
        if (room.engine instanceof sync_ps_engine_1.default) {
            psRequest = room.engine.getRequest(player.id);
        }
        const sideIndex = state.players.indexOf(player);
        const sideId = `p${sideIndex + 1}`;
        // If we have a PS request, use it directly - it has correct array ordering and PP
        if (psRequest && psRequest.side) {
            // PS request already has the correct format, just add our extra fields
            const baseSide = {
                ...psRequest.side,
                playerId: player.id,
            };
            const promptType = alreadyActed ? "wait" : "move";
            const lastPrompt = room.lastPromptByPlayer[player.id];
            if (lastPrompt && lastPrompt.turn === turn && lastPrompt.type === promptType) {
                continue;
            }
            const prompt = alreadyActed
                ? { wait: true, side: baseSide, rqid: psRequest.rqid || Date.now() }
                : {
                    ...psRequest,
                    requestType: psRequest.requestType || "move",
                    playerId: player.id,
                    rqid: psRequest.rqid || Date.now(),
                    // Ensure side has our player ID for reference
                    side: baseSide,
                };
            sock.emit("promptAction", {
                roomId: room.id,
                playerId: player.id,
                prompt,
                state: state,
            });
            room.lastPromptByPlayer[player.id] = {
                turn,
                type: promptType,
                rqid: prompt.rqid,
            };
            continue;
        }
        // Fallback: Build request manually if PS request not available
        // Note: This won't have the correct pokemon ordering after switches
        const psActiveMoves = psRequest?.active?.[0]?.moves || [];
        // Also try to get PP data directly from PS engine as a backup
        let engineMovesPP = null;
        if (room.engine instanceof sync_ps_engine_1.default && psActiveMoves.length === 0) {
            engineMovesPP = room.engine.getActiveMovesPP(player.id);
            console.log(`[Server] Using engineMovesPP fallback for ${player.id}:`, engineMovesPP);
        }
        const sidePayload = {
            id: sideId,
            name: player.name || player.id,
            playerId: player.id,
            pokemon: player.team.map((p, idx) => ({
                id: p.id,
                pokemonId: p.id,
                ident: `${sideId}: ${p.name}`,
                details: `${p.species}, L${p.level}`,
                condition: p.currentHP <= 0 ? '0 fnt' : `${p.currentHP}/${p.stats?.hp || p.maxHP || 100}`,
                active: idx === player.activeIndex,
                stats: p.stats,
                moves: (p.moves || []).map((m) => typeof m === 'string' ? m : m.id || m.name),
                baseAbility: p.ability,
                item: p.item || '',
                pokeball: 'pokeball',
                ability: p.ability,
                fainted: p.currentHP <= 0,
            })),
        };
        const promptType = alreadyActed ? "wait" : "move";
        const lastPrompt = room.lastPromptByPlayer[player.id];
        if (lastPrompt && lastPrompt.turn === turn && lastPrompt.type === promptType) {
            continue;
        }
        const prompt = alreadyActed
            ? { wait: true, side: sidePayload, rqid: Date.now() }
            : {
                requestType: "move",
                side: sidePayload,
                playerId: player.id,
                rqid: Date.now(),
                active: [{
                        moves: (active.moves || []).map((move, idx) => {
                            const moveId = typeof move === "string" ? move : move.id || move.name || `move${idx}`;
                            const normalizedMoveId = moveId.toLowerCase().replace(/[^a-z0-9]/g, "");
                            // Try to find PP from multiple sources:
                            // 1. psActiveMoves from activeRequest
                            // 2. engineMovesPP from direct PS engine query
                            // 3. Fall back to defaults
                            const psMove = psActiveMoves.find((m) => m.id === normalizedMoveId || m.id === moveId);
                            const engineMove = engineMovesPP?.find((m) => m.id === normalizedMoveId || m.id === moveId);
                            const pp = psMove?.pp ?? engineMove?.pp ?? move.pp ?? 10;
                            const maxpp = psMove?.maxpp ?? engineMove?.maxpp ?? move.maxpp ?? pp;
                            return {
                                move: typeof move === "string" ? move : move.name || move.id || `Move ${idx + 1}`,
                                id: normalizedMoveId,
                                pp,
                                maxpp,
                                target: psMove?.target ?? engineMove?.target ?? move.target ?? "normal",
                                disabled: psMove?.disabled ?? engineMove?.disabled ?? move.disabled ?? false,
                            };
                        }),
                    }],
            };
        sock.emit("promptAction", {
            roomId: room.id,
            playerId: player.id,
            prompt,
            state: state,
        });
        room.lastPromptByPlayer[player.id] = {
            turn,
            type: promptType,
            rqid: prompt.rqid,
        };
    }
    console.log(`[Server] emitMovePrompts turn=${turn}: prompted=${JSON.stringify(promptedPlayers)} skipped=${JSON.stringify(skippedPlayers)}`);
}
// Emit force-switch prompts to players who need to switch due to fainted Pokemon
function emitForceSwitchPrompts(room, state, needsSwitch) {
    console.log(`[Server] emitForceSwitchPrompts called for ${needsSwitch.length} players:`, needsSwitch);
    for (const playerId of needsSwitch) {
        const playerSocket = room.players.find(p => p.id === playerId)?.socketId;
        if (!playerSocket) {
            console.log(`[Server] emitForceSwitchPrompts: No socket found for player ${playerId}`);
            continue;
        }
        const sock = io.sockets.sockets.get(playerSocket);
        if (!sock) {
            console.log(`[Server] emitForceSwitchPrompts: Socket not connected for player ${playerId}`);
            continue;
        }
        const player = state.players.find(p => p.id === playerId);
        if (!player) {
            console.log(`[Server] emitForceSwitchPrompts: Player not found in state for ${playerId}`);
            continue;
        }
        // Get the PS engine's native request - it has correctly ordered pokemon array
        let psRequest = null;
        if (room.engine instanceof sync_ps_engine_1.default) {
            psRequest = room.engine.getRequest(playerId);
            console.log(`[Server] emitForceSwitchPrompts: Got PS request for ${playerId}:`, JSON.stringify(psRequest?.forceSwitch));
        }
        const sideIndex = state.players.indexOf(player);
        const sideId = `p${sideIndex + 1}`;
        // If we have a PS request with forceSwitch, use it directly
        if (psRequest && psRequest.forceSwitch && psRequest.side) {
            const switchRequest = {
                ...psRequest,
                playerId: player.id,
                side: {
                    ...psRequest.side,
                    playerId: player.id,
                },
            };
            console.log(`[Server] emitForceSwitchPrompts: Emitting PS forceSwitch prompt to ${playerId}:`, {
                roomId: room.id,
                forceSwitch: switchRequest.forceSwitch,
                sidePokemon: switchRequest.side?.pokemon?.length,
            });
            sock.emit("promptAction", {
                roomId: room.id,
                playerId: player.id,
                prompt: switchRequest,
                state: state,
            });
            continue;
        }
        // Fallback: Build request manually if PS request not available
        const switchRequest = {
            forceSwitch: [true], // Single slot
            side: {
                id: sideId,
                name: player.name,
                playerId: player.id,
                pokemon: player.team.map((p, idx) => ({
                    id: p.id,
                    pokemonId: p.id,
                    ident: `${sideId}: ${p.name}`,
                    details: `${p.species}, L${p.level}`,
                    condition: p.currentHP <= 0 ? '0 fnt' : `${p.currentHP}/${p.stats?.hp || p.maxHP || 100}`,
                    active: idx === player.activeIndex,
                    stats: p.stats,
                    moves: (p.moves || []).map((m) => typeof m === 'string' ? m : m.id || m.name),
                    baseAbility: p.ability,
                    item: p.item || '',
                    pokeball: 'pokeball',
                    ability: p.ability,
                    fainted: p.currentHP <= 0,
                })),
            },
            playerId: player.id,
        };
        sock.emit("promptAction", {
            roomId: room.id,
            playerId: player.id,
            prompt: switchRequest,
            state: state,
        });
    }
}
function broadcastRoomSummary(room) {
    io.emit("roomUpdate", summary(room));
}
function launchChallenge(sourceRoom, challenge) {
    if (!challenge.target) {
        emitChallengeRemoved(sourceRoom, challenge.id, "no-opponent");
        sourceRoom.challenges.delete(challenge.id);
        return;
    }
    if (!challenge.owner.playerPayload || !challenge.target.playerPayload) {
        emitChallengeRemoved(sourceRoom, challenge.id, "missing-team");
        sourceRoom.challenges.delete(challenge.id);
        return;
    }
    const ownerSocket = io.sockets.sockets.get(challenge.owner.socketId);
    const targetSocket = io.sockets.sockets.get(challenge.target.socketId);
    if (!ownerSocket || !targetSocket) {
        emitChallengeRemoved(sourceRoom, challenge.id, "socket-disconnected");
        sourceRoom.challenges.delete(challenge.id);
        return;
    }
    const battleRoomId = (0, uuid_1.v4)().slice(0, 8);
    const nameTokens = [];
    if (challenge.format)
        nameTokens.push(challenge.format);
    nameTokens.push(`${challenge.owner.username} vs ${challenge.target.username}`);
    const battleRoomName = `Battle: ${nameTokens.join(" • ")}`;
    const battleRoom = createRoomRecord(battleRoomId, battleRoomName);
    rooms.set(battleRoomId, battleRoom);
    ownerSocket.join(battleRoomId);
    targetSocket.join(battleRoomId);
    const ownerTrainerSprite = coerceTrainerSprite(challenge.owner.playerPayload?.trainerSprite ?? challenge.owner.playerPayload?.avatar ?? challenge.owner.trainerSprite);
    const targetTrainerSprite = coerceTrainerSprite(challenge.target.playerPayload?.trainerSprite ?? challenge.target.playerPayload?.avatar ?? challenge.target.trainerSprite);
    battleRoom.players.push({ id: challenge.owner.playerId, username: challenge.owner.username, socketId: challenge.owner.socketId, trainerSprite: ownerTrainerSprite });
    battleRoom.players.push({ id: challenge.target.playerId, username: challenge.target.username, socketId: challenge.target.socketId, trainerSprite: targetTrainerSprite });
    const playersPayload = [
        sanitizePlayerPayload(challenge.owner.playerPayload, challenge.owner),
        sanitizePlayerPayload(challenge.target.playerPayload, challenge.target),
    ];
    beginBattle(battleRoom, playersPayload, challenge.rules?.seed, challenge.rules);
    sourceRoom.challenges.delete(challenge.id);
    emitChallengeRemoved(sourceRoom, challenge.id, "launched");
    broadcastRoomSummary(battleRoom);
    broadcastRoomSummary(sourceRoom);
}
// Optionally load external Showdown/Essentials datasets at runtime (not bundled)
async function tryLoadExternalData() {
    try {
        const abilities = (await Promise.resolve(`${path_1.default.resolve("external/showdown/abilities.js")}`).then(s => __importStar(require(s)))).default;
        if (abilities)
            (0, abilities_1.mergeAbilities)(abilities);
    }
    catch { }
    try {
        const items = (await Promise.resolve(`${path_1.default.resolve("external/showdown/items.js")}`).then(s => __importStar(require(s)))).default;
        if (items)
            (0, items_1.mergeItems)(items);
    }
    catch { }
    // If user placed Showdown-like TS/JS under data/, convert the subset we support
    try {
        const localAbilities = (await Promise.resolve(`${path_1.default.resolve("data/abilities.ts")}`).then(s => __importStar(require(s)))).default;
        if (localAbilities)
            (0, abilities_1.mergeAbilities)((0, showdown_converter_1.convertShowdownAbilities)(localAbilities));
    }
    catch { }
    try {
        const localItems = (await Promise.resolve(`${path_1.default.resolve("data/items.ts")}`).then(s => __importStar(require(s)))).default;
        if (localItems)
            (0, items_1.mergeItems)((0, showdown_converter_1.convertShowdownItems)(localItems));
    }
    catch { }
    try {
        const localSpecies = (await Promise.resolve(`${path_1.default.resolve("data/pokedex.ts")}`).then(s => __importStar(require(s)))).default;
        if (localSpecies)
            (0, showdown_species_moves_1.convertShowdownSpecies)(localSpecies);
    }
    catch { }
    try {
        const localMoves = (await Promise.resolve(`${path_1.default.resolve("data/moves.ts")}`).then(s => __importStar(require(s)))).default;
        if (localMoves) {
            // Expose moves if needed: for now just convert and keep a map here if you want to serve it.
            (0, showdown_species_moves_1.convertShowdownMoves)(localMoves);
        }
    }
    catch { }
}
tryLoadExternalData();
const rooms = new Map();
rooms.set(DEFAULT_LOBBY_ID, createRoomRecord(DEFAULT_LOBBY_ID, DEFAULT_LOBBY_NAME));
const FORCE_SWITCH_TIMEOUT_MS = Number(process.env.FORCE_SWITCH_TIMEOUT_MS || 45000);
function computeNeedsSwitch(state, engine) {
    const out = [];
    for (const pl of state.players) {
        // First check if PS engine says this player needs a force switch
        if (engine && engine.needsForceSwitch(pl.id)) {
            out.push(pl.id);
            continue;
        }
        // Fallback: check our state mirror
        const active = pl.team[pl.activeIndex];
        if (active.currentHP <= 0 && pl.team.some((m, idx) => idx !== pl.activeIndex && m.currentHP > 0)) {
            out.push(pl.id);
        }
    }
    return out;
}
function startForceSwitchTimer(room) {
    clearForceSwitchTimer(room);
    room.forceSwitchDeadline = Date.now() + FORCE_SWITCH_TIMEOUT_MS;
    room.forceSwitchTimer = setTimeout(() => {
        if (!room.engine || !room.forceSwitchNeeded || room.forceSwitchNeeded.size === 0)
            return;
        // Auto-switch remaining players to first healthy bench
        for (const pid of Array.from(room.forceSwitchNeeded)) {
            const state = room.engine.getState();
            const pl = state.players.find(p => p.id === pid);
            if (!pl)
                continue;
            const benchIndex = pl.team.findIndex((m, idx) => idx !== pl.activeIndex && m.currentHP > 0);
            if (benchIndex >= 0) {
                const res = room.engine.forceSwitch(pid, benchIndex);
                room.replay.push({ turn: res.state.turn, events: res.events, anim: res.anim, phase: "force-switch", auto: true });
                room.forceSwitchNeeded.delete(pid);
            }
        }
        io.to(room.id).emit("battleUpdate", { result: { state: room.engine.getState(), events: [], anim: [] }, needsSwitch: Array.from(room.forceSwitchNeeded ?? []) });
        if (room.forceSwitchNeeded.size === 0) {
            room.phase = "normal";
            io.to(room.id).emit("phase", { phase: room.phase });
            clearForceSwitchTimer(room);
            // Emit new move prompts so players can choose their next action
            const freshState = room.engine.getState();
            emitMovePrompts(room, freshState);
        }
        else {
            // Extend time for any still-required (optional). For simplicity, clear deadline and keep old until manual switches.
        }
    }, FORCE_SWITCH_TIMEOUT_MS);
}
function clearForceSwitchTimer(room) {
    if (room.forceSwitchTimer) {
        clearTimeout(room.forceSwitchTimer);
        room.forceSwitchTimer = undefined;
    }
    room.forceSwitchDeadline = undefined;
}
// Turn timeout - disabled auto-fill, just log a warning
// Set TURN_TIMEOUT_MS env var to customize (in milliseconds). Default is 60 seconds.
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS || 60000); // 60 seconds default
function startTurnTimer(room) {
    clearTurnTimer(room);
    room.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
    room.turnTimer = setTimeout(() => {
        if (!room.engine || room.phase === "force-switch" || room.phase === "team-preview")
            return;
        const state = room.engine.getState();
        const expected = state.players.length;
        const submitted = Object.keys(room.turnBuffer);
        if (submitted.length >= expected)
            return; // Already complete
        // Log detailed info about who hasn't submitted - but DO NOT auto-fill
        const missing = state.players.filter(p => !room.turnBuffer[p.id]).map(p => p.id);
        console.warn(`[Server] Turn ${state.turn} timeout - still waiting for ${missing.length} players: ${missing.join(', ')}`);
        console.warn(`[Server] Submitted: ${submitted.join(', ') || 'none'} | Missing: ${missing.join(', ')}`);
        // DO NOT auto-fill moves - just continue waiting
        // The battle will only progress when all players submit their actions
        // Restart the timer to keep checking
        startTurnTimer(room);
    }, TURN_TIMEOUT_MS);
}
function clearTurnTimer(room) {
    if (room.turnTimer) {
        clearTimeout(room.turnTimer);
        room.turnTimer = undefined;
    }
    room.turnDeadline = undefined;
}
// Helper to process turn when buffer is full - extracted from sendAction handler
function processTurnWithBuffer(room) {
    if (!room.engine)
        return;
    const state = room.engine.getState();
    const actions = Object.values(room.turnBuffer);
    room.turnBuffer = {};
    clearTurnTimer(room);
    // Filter to only battle actions (move/switch)
    const battleActions = actions.filter((a) => a.type === "move" || a.type === "switch");
    console.log('[Server] Processing turn with actions:', JSON.stringify(battleActions.map(a => ({ type: a.type, pokemonId: a.pokemonId, ...(a.type === 'move' ? { moveId: a.moveId, targetPokemonId: a.targetPokemonId } : {}) }))));
    let result = room.engine.processTurn(battleActions);
    // Deduplicate switch lines (PS sends private + public copies after |split| markers)
    if (Array.isArray(result.events)) {
        result = { ...result, events: deduplicateSwitchLines(result.events) };
    }
    // Filter duplicate start/switch batches after start protocol has already been sent
    if (room.startProtocolSent && Array.isArray(result.events) && result.events.some((l) => l.startsWith("|start"))) {
        const hasActionLine = result.events.some((l) => l.startsWith("|move|") ||
            l.startsWith("|cant|") ||
            l.startsWith("|-damage|") ||
            l.startsWith("|damage|") ||
            l.startsWith("|-heal|") ||
            l.startsWith("|heal|") ||
            l.startsWith("|faint|") ||
            l.startsWith("|-"));
        if (!hasActionLine) {
            result = { ...result, events: [], anim: [] };
        }
        else {
            const initPrefixes = [
                "|start",
                "|teampreview",
                "|clearpoke",
                "|poke|",
                "|player|",
                "|teamsize|",
                "|gen|",
                "|tier|",
                "|gametype|",
                "|t:|",
                "|split|",
            ];
            const filteredEvents = result.events.filter((line) => {
                if (line === "|")
                    return false;
                return !initPrefixes.some((prefix) => line.startsWith(prefix));
            });
            result = { ...result, events: filteredEvents };
        }
    }
    if (!room.startProtocolSent && Array.isArray(result.events) && result.events.some((l) => l.startsWith("|start"))) {
        room.startProtocolSent = true;
    }
    room.replay.push({ turn: result.state.turn, events: result.events, anim: result.anim });
    const needsSwitch = computeNeedsSwitch(result.state, room.engine instanceof sync_ps_engine_1.default ? room.engine : undefined);
    console.log(`[Server] Turn ${result.state.turn} results: events=${result.events.length} needsSwitch=${needsSwitch.length} (${needsSwitch.join(', ')})`);
    if (needsSwitch.length > 0) {
        room.phase = "force-switch";
        room.forceSwitchNeeded = new Set(needsSwitch);
        io.to(room.id).emit("phase", { phase: room.phase, deadline: (room.forceSwitchDeadline = Date.now() + FORCE_SWITCH_TIMEOUT_MS) });
        startForceSwitchTimer(room);
        // Emit force-switch prompts to players who need to switch
        emitForceSwitchPrompts(room, result.state, needsSwitch);
    }
    if (Array.isArray(result?.events)) {
        const hasStart = result.events.some((l) => l === "|start" || l.startsWith("|start|"));
        const hasTurn = result.events.some((l) => l.startsWith("|turn|"));
        const sample = result.events.slice(0, 8);
        console.log(`[DIAG-PROTOCOL] [server] battleUpdate events=${result.events.length} start=${hasStart} turn=${hasTurn} sample=${JSON.stringify(sample)}`);
    }
    else {
        console.log(`[DIAG-PROTOCOL] [server] battleUpdate events=none`);
    }
    io.to(room.id).emit("battleUpdate", { result, needsSwitch, rooms: { trick: result.state.field.room, magic: result.state.field.magicRoom, wonder: result.state.field.wonderRoom } });
    // Simple end detection: if any player's active mon is fainted and no healthy mons remain
    const sideDefeated = result.state.players.find((pl) => pl.team.every(m => m.currentHP <= 0));
    if (sideDefeated) {
        const winner = result.state.players.find(pl => pl.id !== sideDefeated.id)?.id;
        const replayId = saveReplay(room);
        io.to(room.id).emit("battleEnd", { winner, replayId });
        clearForceSwitchTimer(room);
        clearTurnTimer(room);
    }
    else if (needsSwitch.length === 0) {
        // Emit new move prompts for the next turn
        emitMovePrompts(room, result.state);
    }
}
io.on("connection", (socket) => {
    let user = { id: socket.id, username: `Guest-${socket.id.slice(0, 4)}` };
    socket.on("identify", (data) => {
        if (data?.username)
            user.username = data.username;
        const nextTrainerSprite = coerceTrainerSprite(data?.trainerSprite ?? data?.avatar);
        if (nextTrainerSprite)
            user.trainerSprite = nextTrainerSprite;
        const touchedRooms = [];
        for (const room of rooms.values()) {
            let touched = false;
            const player = room.players.find((p) => p.socketId === socket.id);
            if (player) {
                player.username = user.username;
                if (user.trainerSprite)
                    player.trainerSprite = user.trainerSprite;
                touched = true;
            }
            const spectator = room.spectators.find((s) => s.socketId === socket.id);
            if (spectator) {
                spectator.username = user.username;
                if (user.trainerSprite)
                    spectator.trainerSprite = user.trainerSprite;
                touched = true;
            }
            if (touched)
                touchedRooms.push(room);
        }
        socket.emit("identified", { id: user.id, username: user.username, trainerSprite: user.trainerSprite, avatar: user.trainerSprite });
        for (const room of touchedRooms) {
            broadcastRoomSummary(room);
        }
    });
    socket.on("createRoom", (data) => {
        const requestedId = data?.id && typeof data.id === "string" ? data.id.trim() : "";
        const id = requestedId && !rooms.has(requestedId) ? requestedId : (0, uuid_1.v4)().slice(0, 8);
        const room = createRoomRecord(id, data?.name || `Room ${id}`);
        rooms.set(id, room);
        socket.join(id);
        socket.emit("roomCreated", { id, name: room.name });
        io.emit("roomUpdate", summary(room));
    });
    socket.on("joinRoom", (data) => {
        const room = rooms.get(data.roomId);
        if (!room)
            return socket.emit("error", { error: "room not found" });
        socket.join(room.id);
        if (data.role === "player") {
            // De-duplicate any stale entries for this user/socket
            room.spectators = room.spectators.filter((s) => s.id !== user.id && s.socketId !== socket.id);
            room.players = room.players.filter((p) => p.socketId !== socket.id || p.id === user.id);
            const existingIndex = room.players.findIndex((p) => p.id === user.id);
            if (existingIndex >= 0) {
                room.players[existingIndex] = {
                    ...room.players[existingIndex],
                    id: user.id,
                    username: user.username,
                    socketId: socket.id,
                    trainerSprite: user.trainerSprite,
                };
            }
            else {
                room.players.push({ id: user.id, username: user.username, socketId: socket.id, trainerSprite: user.trainerSprite });
            }
        }
        else {
            // De-duplicate any stale entries for this user/socket
            room.players = room.players.filter((p) => p.id !== user.id && p.socketId !== socket.id);
            room.spectators = room.spectators.filter((s) => s.socketId !== socket.id || s.id === user.id);
            const existingIndex = room.spectators.findIndex((s) => s.id === user.id);
            if (existingIndex >= 0) {
                room.spectators[existingIndex] = {
                    ...room.spectators[existingIndex],
                    id: user.id,
                    username: user.username,
                    socketId: socket.id,
                    trainerSprite: user.trainerSprite,
                };
            }
            else {
                room.spectators.push({ id: user.id, username: user.username, socketId: socket.id, trainerSprite: user.trainerSprite });
            }
            // Send spectator snapshot if battle started
            if (room.battleStarted && room.engine) {
                const state = room.engine.getState();
                socket.emit("spectate_start", { state, replay: room.replay, phase: room.phase ?? "normal", needsSwitch: Array.from(room.forceSwitchNeeded ?? []), deadline: room.forceSwitchDeadline ?? null, rooms: { trick: state.field.room, magic: state.field.magicRoom, wonder: state.field.wonderRoom } });
            }
        }
        io.emit("roomUpdate", summary(room));
        socket.emit("challengeSync", { roomId: room.id, challenges: challengeSummaries(room) });
    });
    socket.on("startBattle", (data) => {
        const room = rooms.get(data.roomId);
        if (!room)
            return socket.emit("error", { error: "room not found" });
        if (room.battleStarted)
            return;
        const battleSeed = Number.isFinite(data.seed) ? data.seed : undefined;
        if (USE_PS_ENGINE) {
            room.engine = new sync_ps_engine_1.default({ format: "gen9customgame", seed: battleSeed, rules: data.rules });
        }
        else {
            room.engine = new engine_1.default({ seed: battleSeed });
        }
        const hydratedPlayers = data.players.map((player) => {
            const clone = JSON.parse(JSON.stringify(player));
            const roomPlayer = room.players.find((p) => p.id === player.id);
            const trainerSprite = coerceTrainerSprite(clone.trainerSprite ?? clone.avatar ?? roomPlayer?.trainerSprite);
            clone.trainerSprite = trainerSprite || undefined;
            clone.avatar = trainerSprite || undefined;
            return clone;
        });
        const state = room.engine.initializeBattle(hydratedPlayers, { seed: battleSeed });
        if (typeof state.turn === "number" && state.turn < 1) {
            state.turn = 1;
        }
        room.battleStarted = true;
        room.phase = "normal";
        room.forceSwitchNeeded = new Set();
        console.log(`[Server] Emitting battleStarted for room ${room.id} (startBattle socket)`);
        io.to(room.id).emit("battleStarted", { roomId: room.id, state });
        // Only verify/inject start events if the engine hasn't already done so
        const hasStart = Array.isArray(state.log) && state.log.some((l) => l.startsWith("|start"));
        if (hasStart)
            room.startProtocolSent = true;
        if (!hasStart) {
            const initialEvents = buildInitialBattleProtocol(state);
            if (initialEvents.length > 0) {
                if (Array.isArray(state.log)) {
                    for (const line of initialEvents) {
                        if (!state.log.includes(line))
                            state.log.push(line);
                    }
                }
                room.startProtocolSent = true;
                io.to(room.id).emit("battleUpdate", {
                    result: { state, events: initialEvents, anim: [] },
                    needsSwitch: Array.from(room.forceSwitchNeeded ?? []),
                });
            }
        }
        emitMovePrompts(room, state);
    });
    socket.on("sendAction", (data) => {
        const room = rooms.get(data.roomId);
        if (!room)
            return socket.emit("error", { error: "room not found" });
        // Validate sender is a player in the room and matches playerId
        let sender = room.players.find((p) => p.socketId === socket.id);
        if (!sender || sender.id !== data.playerId) {
            const inRoom = socket.rooms.has(room.id);
            const statePlayer = room.engine?.getState().players.find((p) => p.id === data.playerId);
            if (inRoom && statePlayer) {
                console.warn(`[Server] Recovering missing room player for ${data.playerId} (socket ${socket.id})`);
                // Upsert player record so future prompts/actions have a live socket
                room.players = room.players.filter((p) => p.id !== data.playerId && p.socketId !== socket.id);
                room.players.push({ id: data.playerId, username: statePlayer.name || data.playerId, socketId: socket.id, trainerSprite: statePlayer.trainerSprite });
                sender = room.players.find((p) => p.socketId === socket.id);
            }
            else {
                return socket.emit("error", { error: "not authorized for this action" });
            }
        }
        // Handle team preview phase
        if (room.phase === "team-preview") {
            if (data.action.type === "team" && Array.isArray(data.action.order)) {
                console.log(`[Server] Team preview order received from ${data.playerId}:`, data.action.order);
                if (!room.teamPreviewOrders)
                    room.teamPreviewOrders = {};
                room.teamPreviewOrders[data.playerId] = data.action.order;
                socket.emit("teamPreviewSubmitted", { playerId: data.playerId });
                io.to(room.id).emit("teamPreviewProgress", {
                    playerId: data.playerId,
                    submitted: Object.keys(room.teamPreviewOrders).length,
                    total: room.teamPreviewPlayers?.length || 2
                });
                checkTeamPreviewComplete(room);
                return;
            }
            else if (data.action.type === "auto") {
                // Auto-submit with default order
                if (!room.teamPreviewOrders)
                    room.teamPreviewOrders = {};
                const playerData = room.teamPreviewPlayers?.find(p => p.id === data.playerId);
                const defaultOrder = playerData?.team.map((_, i) => i + 1) || [1, 2, 3, 4, 5, 6];
                room.teamPreviewOrders[data.playerId] = defaultOrder;
                socket.emit("teamPreviewSubmitted", { playerId: data.playerId });
                io.to(room.id).emit("teamPreviewProgress", {
                    playerId: data.playerId,
                    submitted: Object.keys(room.teamPreviewOrders).length,
                    total: room.teamPreviewPlayers?.length || 2
                });
                checkTeamPreviewComplete(room);
                return;
            }
            return socket.emit("error", { error: "in team preview phase - must submit team order" });
        }
        if (!room.engine)
            return socket.emit("error", { error: "battle not started" });
        // If we're in force-switch phase, only accept switch actions from required players
        if (room.phase === "force-switch") {
            if (!room.forceSwitchNeeded?.has(data.playerId)) {
                return socket.emit("error", { error: "no switch required" });
            }
            if (data.action.type !== "switch") {
                return socket.emit("error", { error: "must switch due to faint" });
            }
            // Validate switch target is not fainted
            const forceSwitchState = room.engine.getState();
            const forceSwitchPlayer = forceSwitchState.players.find(p => p.id === data.playerId);
            if (forceSwitchPlayer) {
                const targetMon = forceSwitchPlayer.team[data.action.toIndex];
                if (!targetMon || targetMon.currentHP <= 0) {
                    return socket.emit("error", { error: "cannot switch to a fainted Pokemon" });
                }
                if (data.action.toIndex === forceSwitchPlayer.activeIndex) {
                    return socket.emit("error", { error: "cannot switch to the same Pokemon" });
                }
            }
            // Perform immediate forced switch via engine
            let res = room.engine.forceSwitch(data.playerId, data.action.toIndex);
            // Deduplicate switch lines (PS sends private + public copies)
            if (Array.isArray(res.events)) {
                res = { ...res, events: deduplicateSwitchLines(res.events) };
            }
            room.replay.push({ turn: res.state.turn, events: res.events, anim: res.anim, phase: "force-switch" });
            room.forceSwitchNeeded.delete(data.playerId);
            {
                const s = room.engine.getState();
                io.to(room.id).emit("battleUpdate", { result: res, needsSwitch: Array.from(room.forceSwitchNeeded), deadline: room.forceSwitchDeadline ?? null, rooms: { trick: s.field.room, magic: s.field.magicRoom, wonder: s.field.wonderRoom } });
            }
            if (room.forceSwitchNeeded.size === 0) {
                room.phase = "normal";
                io.to(room.id).emit("phase", { phase: room.phase });
                clearForceSwitchTimer(room);
                // Emit new move prompts so players can choose their next action
                const freshState = room.engine.getState();
                emitMovePrompts(room, freshState);
            }
            return;
        }
        // Validate switch actions before buffering
        if (data.action.type === "switch") {
            const normalState = room.engine.getState();
            const normalPlayer = normalState.players.find(p => p.id === data.playerId);
            if (normalPlayer) {
                const targetMon = normalPlayer.team[data.action.toIndex];
                if (!targetMon || targetMon.currentHP <= 0) {
                    return socket.emit("error", { error: "cannot switch to a fainted Pokemon" });
                }
                if (data.action.toIndex === normalPlayer.activeIndex) {
                    return socket.emit("error", { error: "cannot switch to the same Pokemon" });
                }
            }
        }
        // Convert moveIndex-based action to moveId-based action
        // Client may send { type: 'move', moveId: '...', moveIndex: 0 }
        let processedAction = data.action;
        if (data.action.type === "move") {
            const moveState = room.engine.getState();
            const movePlayer = moveState.players.find(p => p.id === data.playerId);
            if (movePlayer) {
                const activePokemon = movePlayer.team[movePlayer.activeIndex];
                const opponent = moveState.players.find(p => p.id !== data.playerId);
                const opponentActive = opponent?.team[opponent.activeIndex];
                const providedMoveId = data.action.moveId;
                const moveIndex = data.action.moveIndex;
                const moveFromIndex = typeof moveIndex === "number" ? activePokemon?.moves?.[moveIndex] : undefined;
                const resolvedMoveId = providedMoveId || (moveFromIndex ? (typeof moveFromIndex === 'string' ? moveFromIndex : (moveFromIndex.id || moveFromIndex.name)) : undefined);
                if (resolvedMoveId) {
                    processedAction = {
                        type: "move",
                        actorPlayerId: data.playerId,
                        pokemonId: activePokemon.id,
                        moveId: resolvedMoveId,
                        targetPlayerId: opponent?.id || "",
                        targetPokemonId: opponentActive?.id || "",
                        mega: !!data.action.mega,
                        zmove: !!data.action.zmove,
                        dynamax: !!data.action.dynamax,
                        terastallize: !!data.action.terastallize,
                    };
                    if (typeof moveIndex === "number") {
                        console.log(`[Server] Converted moveIndex ${moveIndex} to moveId ${resolvedMoveId}`);
                    }
                    else {
                        console.log(`[Server] Using provided moveId ${resolvedMoveId}`);
                    }
                }
            }
        }
        // Handle switch action - client may send switchTo or toIndex
        if (data.action.type === "switch") {
            const switchState = room.engine.getState();
            const switchPlayer = switchState.players.find(p => p.id === data.playerId);
            if (switchPlayer) {
                const activePokemon = switchPlayer.team[switchPlayer.activeIndex];
                // Support both switchTo (legacy) and toIndex
                const targetIndex = data.action.toIndex ?? data.action.switchTo;
                processedAction = {
                    type: "switch",
                    actorPlayerId: data.playerId,
                    pokemonId: activePokemon?.id || "",
                    toIndex: targetIndex,
                };
                console.log(`[Server] Processed switch action to index ${targetIndex}`);
            }
        }
        room.turnBuffer[data.playerId] = processedAction;
        console.log(`[Server] Action received from ${data.playerId}:`, JSON.stringify(processedAction));
        const currentState = room.engine.getState();
        const expected = currentState.players.length;
        // Log disconnected players but DO NOT auto-fill their actions
        const livePlayerIds = new Set(room.players.filter((p) => io.sockets.sockets.has(p.socketId)).map((p) => p.id));
        const missingPlayers = currentState.players.filter((p) => !livePlayerIds.has(p.id));
        if (missingPlayers.length > 0) {
            console.warn(`[Server] Disconnected players: ${missingPlayers.map(p => p.id).join(', ')} - waiting for reconnection or timeout`);
        }
        console.log(`[Server] Turn buffer size: ${Object.keys(room.turnBuffer).length}/${expected}`);
        if (Object.keys(room.turnBuffer).length >= expected) {
            processTurnWithBuffer(room);
        }
        else {
            // Send "waiting" notification ONLY to the player who just submitted
            // Not to all players - that would incorrectly put both in waiting state
            socket.emit("promptAction", {
                roomId: data.roomId,
                playerId: data.playerId,
                waitingFor: expected - Object.keys(room.turnBuffer).length,
                prompt: { wait: true }
            });
        }
    });
    socket.on("sendChat", (data) => {
        const room = rooms.get(data.roomId);
        if (!room)
            return;
        io.to(room.id).emit("chatMessage", { user: user.username, text: data.text, time: Date.now() });
    });
    socket.on("createChallenge", (data) => {
        const room = data?.roomId ? rooms.get(data.roomId) : undefined;
        if (!room)
            return socket.emit("error", { error: "room not found" });
        const isPlayer = Boolean(findPlayerBySocket(room, socket.id));
        if (!isPlayer)
            return socket.emit("error", { error: "must join as player" });
        const rawId = typeof data?.challengeId === "string" ? data.challengeId.trim() : "";
        const challengeId = rawId && !room.challenges.has(rawId) ? rawId : (0, uuid_1.v4)().slice(0, 8);
        const targetPlayer = data?.toPlayerId ? room.players.find((p) => p.id === data.toPlayerId) : undefined;
        const ownerPayload = data?.player ? JSON.parse(JSON.stringify(data.player)) : undefined;
        const ownerTrainerSprite = coerceTrainerSprite(ownerPayload?.trainerSprite ?? ownerPayload?.avatar ?? user.trainerSprite);
        if (ownerPayload && ownerTrainerSprite) {
            ownerPayload.trainerSprite = ownerTrainerSprite;
            ownerPayload.avatar = ownerTrainerSprite;
        }
        const challenge = {
            id: challengeId,
            roomId: room.id,
            createdAt: Date.now(),
            rules: data?.rules,
            format: data?.format,
            status: "pending",
            owner: {
                playerId: user.id,
                username: user.username,
                socketId: socket.id,
                accepted: true,
                trainerSprite: ownerTrainerSprite,
                playerPayload: ownerPayload,
            },
            target: targetPlayer
                ? {
                    playerId: targetPlayer.id,
                    username: targetPlayer.username,
                    socketId: targetPlayer.socketId,
                    accepted: false,
                }
                : undefined,
            open: !targetPlayer,
        };
        room.challenges.set(challenge.id, challenge);
        emitChallengeCreated(room, challenge);
        broadcastRoomSummary(room);
    });
    socket.on("cancelChallenge", (data) => {
        const room = data?.roomId ? rooms.get(data.roomId) : undefined;
        if (!room)
            return;
        const challenge = data?.challengeId ? room.challenges.get(data.challengeId) : undefined;
        if (!challenge)
            return;
        if (challenge.owner.socketId !== socket.id)
            return socket.emit("error", { error: "not authorized" });
        room.challenges.delete(challenge.id);
        emitChallengeRemoved(room, challenge.id, "cancelled");
        broadcastRoomSummary(room);
    });
    socket.on("respondChallenge", (data) => {
        const room = data?.roomId ? rooms.get(data.roomId) : undefined;
        if (!room)
            return socket.emit("error", { error: "room not found" });
        const challenge = data?.challengeId ? room.challenges.get(data.challengeId) : undefined;
        if (!challenge)
            return socket.emit("error", { error: "challenge not found" });
        let participant;
        if (challenge.owner.socketId === socket.id)
            participant = challenge.owner;
        if (!participant && challenge.target && challenge.target.socketId === socket.id)
            participant = challenge.target;
        if (!participant && challenge.open && data?.accepted) {
            // Claim the open challenge
            challenge.target = {
                playerId: user.id,
                username: user.username,
                socketId: socket.id,
                accepted: false,
            };
            challenge.open = false;
            participant = challenge.target;
        }
        if (!participant)
            return socket.emit("error", { error: "not part of challenge" });
        if (!data?.accepted) {
            room.challenges.delete(challenge.id);
            emitChallengeRemoved(room, challenge.id, "declined");
            broadcastRoomSummary(room);
            return;
        }
        if (!data?.player)
            return socket.emit("error", { error: "team payload required" });
        const participantPayload = JSON.parse(JSON.stringify(data.player));
        const participantTrainerSprite = coerceTrainerSprite(participantPayload?.trainerSprite ?? participantPayload?.avatar ?? user.trainerSprite);
        if (participantTrainerSprite) {
            participantPayload.trainerSprite = participantTrainerSprite;
            participantPayload.avatar = participantTrainerSprite;
        }
        participant.accepted = true;
        participant.username = user.username;
        participant.trainerSprite = participantTrainerSprite;
        participant.playerPayload = participantPayload;
        if (challenge.owner.accepted && challenge.owner.playerPayload && challenge.target && challenge.target.accepted && challenge.target.playerPayload) {
            challenge.status = "launching";
            emitChallengeUpdated(room, challenge);
            launchChallenge(room, challenge);
        }
        else {
            emitChallengeUpdated(room, challenge);
        }
    });
    socket.on("disconnect", () => {
        // Remove from any rooms
        for (const room of rooms.values()) {
            const removed = removeClientFromRoom(room, socket.id);
            if (removed) {
                // Clean up challenges involving this socket
                for (const challenge of Array.from(room.challenges.values())) {
                    if (challenge.owner.socketId === socket.id) {
                        room.challenges.delete(challenge.id);
                        emitChallengeRemoved(room, challenge.id, "creator-left");
                    }
                    else if (challenge.target && challenge.target.socketId === socket.id) {
                        challenge.target = undefined;
                        challenge.open = true;
                        challenge.status = "pending";
                        emitChallengeUpdated(room, challenge);
                    }
                }
                broadcastRoomSummary(room);
            }
            const isEmpty = room.players.length === 0 && room.spectators.length === 0;
            if (isEmpty && room.id !== DEFAULT_LOBBY_ID) {
                rooms.delete(room.id);
                io.emit("roomRemoved", { id: room.id });
            }
        }
    });
});
function summary(room) {
    return {
        id: room.id,
        name: room.name,
        players: room.players.map((p) => ({ id: p.id, username: p.username, trainerSprite: p.trainerSprite, avatar: p.trainerSprite })),
        spectCount: room.spectators.length,
        battleStarted: room.battleStarted,
        challengeCount: room.challenges.size,
    };
}
function saveReplay(room) {
    const id = (0, uuid_1.v4)().slice(0, 8);
    const file = path_1.default.join(REPLAYS_DIR, `${id}.json`);
    const payload = {
        id,
        room: { id: room.id, name: room.name },
        createdAt: Date.now(),
        replay: room.replay,
    };
    fs_1.default.writeFileSync(file, JSON.stringify(payload, null, 2));
    return id;
}
function startServer(port = Number(process.env.PORT) || 3000) {
    server.listen(port, () => console.log(`Server running on :${port}`));
}
if (require.main === module) {
    startServer();
}
//# sourceMappingURL=index.js.map