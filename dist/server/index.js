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
if (!fs_1.default.existsSync(DATA_DIR))
    fs_1.default.mkdirSync(DATA_DIR);
if (!fs_1.default.existsSync(REPLAYS_DIR))
    fs_1.default.mkdirSync(REPLAYS_DIR);
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get("/api/rooms", (_req, res) => {
    const list = Array.from(rooms.values()).map((r) => ({
        id: r.id,
        name: r.name,
        players: r.players.map((p) => p.username),
        spectCount: r.spectators.length,
        started: r.battleStarted,
    }));
    res.json(list);
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
        const id = (0, uuid_1.v4)().slice(0, 8);
        const room = {
            id,
            name: data?.name || `Room ${id}`,
            players: [],
            spectators: [],
            battleStarted: false,
            turnBuffer: {},
            replay: [],
        };
        rooms.set(id, room);
        socket.join(id);
        socket.emit("roomCreated", { id, name: room.name });
        io.to(id).emit("roomUpdate", summary(room));
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
        io.to(room.id).emit("roomUpdate", summary(room));
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
    socket.on("disconnect", () => {
        // Remove from any rooms
        for (const room of rooms.values()) {
            room.players = room.players.filter((p) => p.socketId !== socket.id);
            room.spectators = room.spectators.filter((s) => s.socketId !== socket.id);
            io.to(room.id).emit("roomUpdate", summary(room));
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