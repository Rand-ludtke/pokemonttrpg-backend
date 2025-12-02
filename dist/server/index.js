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
const abilities_1 = require("../data/abilities");
const items_1 = require("../data/items");
const showdown_converter_1 = require("../data/converters/showdown-converter");
const showdown_species_moves_1 = require("../data/converters/showdown-species-moves");
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
        turnBuffer: {},
        replay: [],
        phase: "normal",
        forceSwitchNeeded: new Set(),
        forceSwitchTimer: undefined,
        forceSwitchDeadline: undefined,
        challenges: new Map(),
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
    const state = room.engine["state"];
    res.json({ state, replay: room.replay, phase: room.phase ?? "normal", needsSwitch, deadline: room.forceSwitchDeadline ?? null, rooms: { trick: state.field.room, magic: state.field.magicRoom, wonder: state.field.wonderRoom } });
});
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, { cors: { origin: "*" } });
function emitChallengeCreated(room, challenge) {
    io.to(room.id).emit("challengeCreated", { roomId: room.id, challenge: challengeSummary(challenge) });
}
function emitChallengeUpdated(room, challenge) {
    io.to(room.id).emit("challengeUpdated", { roomId: room.id, challenge: challengeSummary(challenge) });
}
function emitChallengeRemoved(room, challengeId, reason) {
    io.to(room.id).emit("challengeRemoved", { roomId: room.id, challengeId, reason });
}
function sanitizePlayerPayload(player, participant) {
    const clone = JSON.parse(JSON.stringify(player));
    clone.id = participant.playerId;
    clone.name = clone.name || participant.username;
    if (typeof clone.activeIndex !== "number")
        clone.activeIndex = 0;
    return clone;
}
function beginBattle(room, players, seed) {
    const battleSeed = seed ?? 123;
    room.engine = new engine_1.default({ seed: battleSeed });
    room.turnBuffer = {};
    room.replay = [];
    clearForceSwitchTimer(room);
    const state = room.engine.initializeBattle(players, { seed: battleSeed });
    room.battleStarted = true;
    room.phase = "normal";
    room.forceSwitchNeeded = new Set();
    io.to(room.id).emit("battleStarted", { state });
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
    battleRoom.players.push({ id: challenge.owner.playerId, username: challenge.owner.username, socketId: challenge.owner.socketId });
    battleRoom.players.push({ id: challenge.target.playerId, username: challenge.target.username, socketId: challenge.target.socketId });
    const playersPayload = [
        sanitizePlayerPayload(challenge.owner.playerPayload, challenge.owner),
        sanitizePlayerPayload(challenge.target.playerPayload, challenge.target),
    ];
    beginBattle(battleRoom, playersPayload, challenge.rules?.seed);
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
function computeNeedsSwitch(state) {
    const out = [];
    for (const pl of state.players) {
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
            const state = room.engine["state"];
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
        io.to(room.id).emit("battleUpdate", { result: { state: room.engine["state"], events: [], anim: [] }, needsSwitch: Array.from(room.forceSwitchNeeded ?? []) });
        if (room.forceSwitchNeeded.size === 0) {
            room.phase = "normal";
            io.to(room.id).emit("phase", { phase: room.phase });
            clearForceSwitchTimer(room);
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
io.on("connection", (socket) => {
    let user = { id: socket.id, username: `Guest-${socket.id.slice(0, 4)}` };
    socket.on("identify", (data) => {
        if (data?.username)
            user.username = data.username;
        socket.emit("identified", { id: user.id, username: user.username });
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
            room.players.push({ id: user.id, username: user.username, socketId: socket.id });
        }
        else {
            room.spectators.push({ id: user.id, username: user.username, socketId: socket.id });
            // Send spectator snapshot if battle started
            if (room.battleStarted && room.engine) {
                const state = room.engine["state"];
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
        room.engine = new engine_1.default({ seed: data.seed ?? 123 });
        const state = room.engine.initializeBattle(data.players, { seed: data.seed ?? 123 });
        room.battleStarted = true;
        room.phase = "normal";
        room.forceSwitchNeeded = new Set();
        io.to(room.id).emit("battleStarted", { state });
    });
    socket.on("sendAction", (data) => {
        const room = rooms.get(data.roomId);
        if (!room || !room.engine)
            return socket.emit("error", { error: "room not found or battle not started" });
        // Validate sender is a player in the room and matches playerId
        const sender = room.players.find((p) => p.socketId === socket.id);
        if (!sender || sender.id !== data.playerId) {
            return socket.emit("error", { error: "not authorized for this action" });
        }
        // If we're in force-switch phase, only accept switch actions from required players
        if (room.phase === "force-switch") {
            if (!room.forceSwitchNeeded?.has(data.playerId)) {
                return socket.emit("error", { error: "no switch required" });
            }
            if (data.action.type !== "switch") {
                return socket.emit("error", { error: "must switch due to faint" });
            }
            // Perform immediate forced switch via engine
            const res = room.engine.forceSwitch(data.playerId, data.action.toIndex);
            room.replay.push({ turn: res.state.turn, events: res.events, anim: res.anim, phase: "force-switch" });
            room.forceSwitchNeeded.delete(data.playerId);
            {
                const s = room.engine["state"];
                io.to(room.id).emit("battleUpdate", { result: res, needsSwitch: Array.from(room.forceSwitchNeeded), deadline: room.forceSwitchDeadline ?? null, rooms: { trick: s.field.room, magic: s.field.magicRoom, wonder: s.field.wonderRoom } });
            }
            if (room.forceSwitchNeeded.size === 0) {
                room.phase = "normal";
                io.to(room.id).emit("phase", { phase: room.phase });
                clearForceSwitchTimer(room);
            }
            return;
        }
        room.turnBuffer[data.playerId] = data.action;
        const expected = room.engine["state"].players.length; // internal access for quick prototype
        if (Object.keys(room.turnBuffer).length >= expected) {
            const actions = Object.values(room.turnBuffer);
            room.turnBuffer = {};
            const result = room.engine.processTurn(actions);
            room.replay.push({ turn: result.state.turn, events: result.events, anim: result.anim });
            const needsSwitch = computeNeedsSwitch(result.state);
            if (needsSwitch.length > 0) {
                room.phase = "force-switch";
                room.forceSwitchNeeded = new Set(needsSwitch);
                io.to(room.id).emit("phase", { phase: room.phase, deadline: (room.forceSwitchDeadline = Date.now() + FORCE_SWITCH_TIMEOUT_MS) });
                startForceSwitchTimer(room);
            }
            io.to(room.id).emit("battleUpdate", { result, needsSwitch, rooms: { trick: result.state.field.room, magic: result.state.field.magicRoom, wonder: result.state.field.wonderRoom } });
            // Simple end detection: if any player's active mon is fainted and no healthy mons remain
            const sideDefeated = result.state.players.find((pl) => pl.team.every(m => m.currentHP <= 0));
            if (sideDefeated) {
                const winner = result.state.players.find(pl => pl.id !== sideDefeated.id)?.id;
                const replayId = saveReplay(room);
                io.to(room.id).emit("battleEnd", { winner, replayId });
                clearForceSwitchTimer(room);
            }
        }
        else {
            // prompt others
            io.to(room.id).emit("promptAction", { waitingFor: expected - Object.keys(room.turnBuffer).length });
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
                playerPayload: data?.player ? JSON.parse(JSON.stringify(data.player)) : undefined,
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
        participant.accepted = true;
        participant.username = user.username;
        participant.playerPayload = JSON.parse(JSON.stringify(data.player));
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
        players: room.players.map((p) => ({ id: p.id, username: p.username })),
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