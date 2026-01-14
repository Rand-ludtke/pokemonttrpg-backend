import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import Engine from "../engine";
import { Action, MoveAction, Player, TurnResult, BattleState } from "../types";
import { ExternalDexData } from "../adapters/pokedex-adapter";
import { mergeAbilities } from "../data/abilities";
import { mergeItems } from "../data/items";
import { convertShowdownAbilities, convertShowdownItems } from "../data/converters/showdown-converter";
import { convertShowdownSpecies, convertShowdownMoves } from "../data/converters/showdown-species-moves";

// Simple JSON persistence directories (for Raspberry Pi prototype)
const DATA_DIR = path.resolve(process.cwd(), "data");
const REPLAYS_DIR = path.join(DATA_DIR, "replays");
const CUSTOM_DEX_FILE = path.join(DATA_DIR, "customdex.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(REPLAYS_DIR)) fs.mkdirSync(REPLAYS_DIR);

export interface ClientInfo {
  id: string;
  username: string;
}

export interface Room {
  id: string;
  name: string;
  players: { id: string; username: string; socketId: string }[];
  spectators: { id: string; username: string; socketId: string }[];
  engine?: Engine;
  battleStarted: boolean;
  turnBuffer: Record<string, Action>; // keyed by player id
  replay: any[];
  phase?: "normal" | "force-switch" | "team-preview";
  forceSwitchNeeded?: Set<string>;
  forceSwitchTimer?: NodeJS.Timeout;
  forceSwitchDeadline?: number; // epoch ms
  challenges: Map<string, Challenge>;
  // Team preview state
  teamPreviewPlayers?: Player[];
  teamPreviewOrders?: Record<string, number[]>;
  teamPreviewRules?: any;
}

type ChallengeStatus = "pending" | "launching" | "cancelled" | "declined";

interface ChallengeParticipant {
  playerId: string;
  username: string;
  socketId: string;
  accepted: boolean;
  playerPayload?: Player;
}

interface Challenge {
  id: string;
  roomId: string;
  createdAt: number;
  rules?: any;
  format?: string;
  status: ChallengeStatus;
  owner: ChallengeParticipant;
  target?: ChallengeParticipant;
  open: boolean;
}

interface ChallengeSummary {
  id: string;
  roomId: string;
  status: ChallengeStatus;
  createdAt: number;
  open: boolean;
  format?: string;
  rules?: any;
  owner: { id: string; username: string; accepted: boolean; ready: boolean };
  target?: { id: string; username: string; accepted: boolean; ready: boolean } | null;
}

const DEFAULT_LOBBY_ID = "global-lobby";
const DEFAULT_LOBBY_NAME = "Global Lobby";

function createRoomRecord(id: string, name: string): Room {
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
    teamPreviewPlayers: undefined,
    teamPreviewOrders: undefined,
    teamPreviewRules: undefined,
    forceSwitchNeeded: new Set(),
    forceSwitchTimer: undefined,
    forceSwitchDeadline: undefined,
    challenges: new Map(),
  };
}

function challengeSummary(ch: Challenge): ChallengeSummary {
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

function challengeSummaries(room: Room): ChallengeSummary[] {
  return Array.from(room.challenges.values()).map(challengeSummary);
}

function findPlayerBySocket(room: Room, socketId: string) {
  return room.players.find((p) => p.socketId === socketId);
}

function findSpectatorBySocket(room: Room, socketId: string) {
  return room.spectators.find((s) => s.socketId === socketId);
}

function removeClientFromRoom(room: Room, socketId: string) {
  const playersBefore = room.players.length;
  room.players = room.players.filter((p) => p.socketId !== socketId);
  const spectatorsBefore = room.spectators.length;
  room.spectators = room.spectators.filter((s) => s.socketId !== socketId);
  return playersBefore !== room.players.length || spectatorsBefore !== room.spectators.length;
}

const app = express();

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

app.use(express.json());

// --- Custom Dex persistence & helpers ---
function loadCustomDex(): ExternalDexData {
  try {
    if (fs.existsSync(CUSTOM_DEX_FILE)) {
      const json = JSON.parse(fs.readFileSync(CUSTOM_DEX_FILE, "utf-8"));
      // Ensure shape
      return { species: json.species ?? {}, moves: json.moves ?? {} } as ExternalDexData;
    }
  } catch {}
  return { species: {}, moves: {} };
}

function saveCustomDex(dex: ExternalDexData) {
  const payload = { species: dex.species ?? {}, moves: dex.moves ?? {} };
  fs.writeFileSync(CUSTOM_DEX_FILE, JSON.stringify(payload, null, 2));
}

function diffDex(serverDex: ExternalDexData, clientDex: ExternalDexData) {
  const missingOnClient = { species: {} as Record<string, any>, moves: {} as Record<string, any> };
  const missingOnServer = { species: {} as Record<string, any>, moves: {} as Record<string, any> };

  // Server -> Client (what client lacks)
  for (const [id, s] of Object.entries(serverDex.species ?? {})) {
    if (!clientDex.species || !clientDex.species[id]) missingOnClient.species[id] = s;
  }
  for (const [id, m] of Object.entries(serverDex.moves ?? {})) {
    if (!clientDex.moves || !clientDex.moves[id]) missingOnClient.moves[id] = m;
  }

  // Client -> Server (what server lacks)
  for (const [id, s] of Object.entries(clientDex.species ?? {})) {
    if (!serverDex.species || !serverDex.species[id]) missingOnServer.species[id] = s;
  }
  for (const [id, m] of Object.entries(clientDex.moves ?? {})) {
    if (!serverDex.moves || !serverDex.moves[id]) missingOnServer.moves[id] = m;
  }

  return { missingOnClient, missingOnServer };
}

app.get("/api/rooms", (_req: Request, res: Response) => {
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
app.get("/api/customdex", (_req: Request, res: Response) => {
  const dex = loadCustomDex();
  res.json(dex);
});

// 2) Sync: client posts its dex; server returns what client is missing (from server),
//    and what server is missing (from client). Client may then call /upload to add to server.
app.post("/api/customdex/sync", (req: Request, res: Response) => {
  const clientDex = (req.body ?? {}) as ExternalDexData;
  const serverDex = loadCustomDex();
  const { missingOnClient, missingOnServer } = diffDex(serverDex, clientDex);
  res.json({ missingOnClient, missingOnServer });
});

// 3) Upload: merge new entries from client into server store (no overwrite by default)
app.post("/api/customdex/upload", (req: Request, res: Response) => {
  const incoming = (req.body ?? {}) as ExternalDexData;
  const serverDex = loadCustomDex();
  let addedSpecies = 0;
  let addedMoves = 0;
  serverDex.species = serverDex.species || {};
  serverDex.moves = serverDex.moves || {};
  for (const [id, s] of Object.entries(incoming.species ?? {})) {
    if (!serverDex.species[id]) {
      serverDex.species[id] = s as any;
      addedSpecies++;
    }
  }
  for (const [id, m] of Object.entries(incoming.moves ?? {})) {
    if (!serverDex.moves[id]) {
      serverDex.moves[id] = m as any;
      addedMoves++;
    }
  }
  saveCustomDex(serverDex);
  res.json({ ok: true, added: { species: addedSpecies, moves: addedMoves } });
});

app.get("/api/rooms/:id", (req: Request, res: Response) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "room not found" });
  res.json({
    id: room.id,
    name: room.name,
    players: room.players.map((p) => ({ id: p.id, username: p.username })),
    spectCount: room.spectators.length,
    started: room.battleStarted,
    challengeCount: room.challenges.size,
  });
});

app.get("/api/replay/:id", (req: Request, res: Response) => {
  const file = path.join(REPLAYS_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).send("Replay not found");
  res.download(file);
});
app.get("/api/replays", (_req: Request, res: Response) => {
  const files = fs.readdirSync(REPLAYS_DIR).filter(f => f.endsWith('.json'));
  const list = files.map(f => ({ id: f.replace(/\.json$/, ''), size: fs.statSync(path.join(REPLAYS_DIR, f)).size }));
  res.json(list);
});
app.get("/api/replays/:id/meta", (req: Request, res: Response) => {
  const file = path.join(REPLAYS_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "not found" });
  const json = JSON.parse(fs.readFileSync(file, "utf-8"));
  res.json({ id: json.id, room: json.room, createdAt: json.createdAt, turns: json.replay?.length ?? 0 });
});

// Compact spectator snapshot: mirrors spectate_start payload
app.get("/api/rooms/:id/snapshot", (req: Request, res: Response) => {
  const room = rooms.get(req.params.id);
  if (!room || !room.engine) return res.status(404).json({ error: "room not found or battle not started" });
  const needsSwitch = room.forceSwitchNeeded ? Array.from(room.forceSwitchNeeded) : [];
  const state = (room.engine as any)["state"] as import("../types").BattleState;
  res.json({ state, replay: room.replay, phase: room.phase ?? "normal", needsSwitch, deadline: room.forceSwitchDeadline ?? null, rooms: { trick: state.field.room, magic: state.field.magicRoom, wonder: state.field.wonderRoom } });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

function emitChallengeCreated(room: Room, challenge: Challenge) {
  io.to(room.id).emit("challengeCreated", { roomId: room.id, challenge: challengeSummary(challenge) });
}

function emitChallengeUpdated(room: Room, challenge: Challenge) {
  io.to(room.id).emit("challengeUpdated", { roomId: room.id, challenge: challengeSummary(challenge) });
}

function emitChallengeRemoved(room: Room, challengeId: string, reason: string) {
  io.to(room.id).emit("challengeRemoved", { roomId: room.id, challengeId, reason });
}

function sanitizePlayerPayload(player: Player, participant: ChallengeParticipant): Player {
  const clone = JSON.parse(JSON.stringify(player)) as Player;
  clone.id = participant.playerId;
  clone.name = clone.name || participant.username;
  if (typeof clone.activeIndex !== "number") clone.activeIndex = 0;
  return clone;
}

function startTeamPreview(room: Room, players: Player[], rules?: any) {
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
    if (!playerSocket) continue;
    const sock = io.sockets.sockets.get(playerSocket);
    if (!sock) continue;
    
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
          pokemon: player.team.map((p: any, idx: number) => ({
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
          activeIndex: 0,
          team: p.team.map((mon: any) => ({
            id: mon.id,
            pokemonId: mon.id,
            name: mon.name || mon.species,
            species: mon.species,
            nickname: mon.nickname,
            level: mon.level || 50,
            types: mon.types,
          })),
        })),
      },
    });
  }
}

function applyTeamOrder(player: Player, order: number[]): Player {
  if (!order || !order.length) return player;
  const clone = JSON.parse(JSON.stringify(player)) as Player;
  const newTeam: any[] = [];
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

function checkTeamPreviewComplete(room: Room) {
  if (room.phase !== "team-preview" || !room.teamPreviewPlayers || !room.teamPreviewOrders) return;
  
  const allSubmitted = room.teamPreviewPlayers.every(p => room.teamPreviewOrders![p.id]);
  if (!allSubmitted) return;
  
  // Apply team orders and start the battle
  const orderedPlayers = room.teamPreviewPlayers.map(player => {
    const order = room.teamPreviewOrders![player.id];
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

function beginBattle(room: Room, players: Player[], seed?: number, rules?: any) {
  // Check if team preview is enabled
  if (rules?.teamPreview && room.phase !== "team-preview") {
    startTeamPreview(room, players, rules);
    return;
  }
  
  const battleSeed = seed ?? 123;
  room.engine = new Engine({ seed: battleSeed });
  room.turnBuffer = {};
  room.replay = [];
  clearForceSwitchTimer(room);
  const state = room.engine.initializeBattle(players, { seed: battleSeed });
  room.battleStarted = true;
  room.phase = "normal";
  room.forceSwitchNeeded = new Set();
  console.log(`[Server] Emitting battleStarted for room ${room.id}`);
  io.to(room.id).emit("battleStarted", { roomId: room.id, state });
  
  // Emit move prompts to each player so they can choose their first action
  emitMovePrompts(room, state);
}

// Emit move prompts to all players in a battle
function emitMovePrompts(room: Room, state: BattleState) {
  if (!room.engine) return;
  for (const player of state.players) {
    const playerSocket = room.players.find(p => p.id === player.id)?.socketId;
    if (!playerSocket) continue;
    const sock = io.sockets.sockets.get(playerSocket);
    if (!sock) continue;
    
    const active = player.team[player.activeIndex];
    if (!active || active.currentHP <= 0) continue;
    
    // Build the move request similar to PS format
    const moveRequest = {
      requestType: 'move' as const,
      side: player.id,
      playerId: player.id,
      active: [{
        id: active.id,
        pokemonId: active.id,
        moves: (active.moves || []).map((move: any, idx: number) => ({
          id: typeof move === 'string' ? move : move.id || move.name || `move${idx}`,
          name: typeof move === 'string' ? move : move.name || move.id || `Move ${idx + 1}`,
          pp: ((active as any).volatile?.pp?.[typeof move === 'string' ? move : move.id] ?? move.pp ?? 10),
          maxpp: move.maxpp ?? move.pp ?? 10,
          target: move.target || 'normal',
          disabled: move.disabled || false,
        })),
        canSwitch: player.team.filter((p: any, i: number) => i !== player.activeIndex && p.currentHP > 0).length > 0,
      }],
      pokemon: player.team.map((p: any, idx: number) => ({
        id: p.id,
        pokemonId: p.id,
        ident: `p${state.players.indexOf(player) + 1}: ${p.name}`,
        details: `${p.species}, L${p.level}`,
        condition: `${p.currentHP}/${p.stats?.hp || p.maxHP || 100}`,
        active: idx === player.activeIndex,
        stats: p.stats,
        moves: p.moves,
        item: p.item,
        ability: p.ability,
      })),
    };
    
    sock.emit("promptAction", {
      roomId: room.id,
      playerId: player.id,
      prompt: moveRequest,
      state: state, // Include full battle state so client always has it
    });
  }
}

function broadcastRoomSummary(room: Room) {
  io.emit("roomUpdate", summary(room));
}

function launchChallenge(sourceRoom: Room, challenge: Challenge) {
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

  const battleRoomId = uuidv4().slice(0, 8);
  const nameTokens: string[] = [];
  if (challenge.format) nameTokens.push(challenge.format);
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

  beginBattle(battleRoom, playersPayload, challenge.rules?.seed, challenge.rules);

  sourceRoom.challenges.delete(challenge.id);
  emitChallengeRemoved(sourceRoom, challenge.id, "launched");

  broadcastRoomSummary(battleRoom);
  broadcastRoomSummary(sourceRoom);
}
// Optionally load external Showdown/Essentials datasets at runtime (not bundled)
async function tryLoadExternalData() {
  try {
    const abilities = (await import(path.resolve("external/showdown/abilities.js"))).default;
    if (abilities) mergeAbilities(abilities);
  } catch {}
  try {
    const items = (await import(path.resolve("external/showdown/items.js"))).default;
    if (items) mergeItems(items);
  } catch {}
  // If user placed Showdown-like TS/JS under data/, convert the subset we support
  try {
    const localAbilities = (await import(path.resolve("data/abilities.ts"))).default as Record<string, any>;
    if (localAbilities) mergeAbilities(convertShowdownAbilities(localAbilities));
  } catch {}
  try {
    const localItems = (await import(path.resolve("data/items.ts"))).default as Record<string, any>;
    if (localItems) mergeItems(convertShowdownItems(localItems));
  } catch {}
  try {
    const localSpecies = (await import(path.resolve("data/pokedex.ts"))).default as Record<string, any>;
    if (localSpecies) convertShowdownSpecies(localSpecies);
  } catch {}
  try {
    const localMoves = (await import(path.resolve("data/moves.ts"))).default as Record<string, any>;
    if (localMoves) {
      // Expose moves if needed: for now just convert and keep a map here if you want to serve it.
      convertShowdownMoves(localMoves);
    }
  } catch {}
}
tryLoadExternalData();

const rooms = new Map<string, Room>();
rooms.set(DEFAULT_LOBBY_ID, createRoomRecord(DEFAULT_LOBBY_ID, DEFAULT_LOBBY_NAME));

const FORCE_SWITCH_TIMEOUT_MS = Number(process.env.FORCE_SWITCH_TIMEOUT_MS || 45000);

export function computeNeedsSwitch(state: import("../types").BattleState): string[] {
  const out: string[] = [];
  for (const pl of state.players) {
    const active = pl.team[pl.activeIndex];
    if (active.currentHP <= 0 && pl.team.some((m, idx) => idx !== pl.activeIndex && m.currentHP > 0)) {
      out.push(pl.id);
    }
  }
  return out;
}

function startForceSwitchTimer(room: Room) {
  clearForceSwitchTimer(room);
  room.forceSwitchDeadline = Date.now() + FORCE_SWITCH_TIMEOUT_MS;
  room.forceSwitchTimer = setTimeout(() => {
    if (!room.engine || !room.forceSwitchNeeded || room.forceSwitchNeeded.size === 0) return;
    // Auto-switch remaining players to first healthy bench
    for (const pid of Array.from(room.forceSwitchNeeded)) {
      const state = (room.engine as any)["state"] as import("../types").BattleState;
      const pl = state.players.find(p => p.id === pid);
      if (!pl) continue;
      const benchIndex = pl.team.findIndex((m, idx) => idx !== pl.activeIndex && m.currentHP > 0);
      if (benchIndex >= 0) {
        const res = room.engine.forceSwitch(pid, benchIndex);
        room.replay.push({ turn: res.state.turn, events: res.events, anim: res.anim, phase: "force-switch", auto: true });
        room.forceSwitchNeeded.delete(pid);
      }
    }
    io.to(room.id).emit("battleUpdate", { result: { state: (room.engine as any)["state"], events: [], anim: [] }, needsSwitch: Array.from(room.forceSwitchNeeded ?? []) });
    if (room.forceSwitchNeeded.size === 0) {
      room.phase = "normal";
      io.to(room.id).emit("phase", { phase: room.phase });
      clearForceSwitchTimer(room);
    } else {
      // Extend time for any still-required (optional). For simplicity, clear deadline and keep old until manual switches.
    }
  }, FORCE_SWITCH_TIMEOUT_MS);
}

function clearForceSwitchTimer(room: Room) {
  if (room.forceSwitchTimer) {
    clearTimeout(room.forceSwitchTimer);
    room.forceSwitchTimer = undefined;
  }
  room.forceSwitchDeadline = undefined;
}

io.on("connection", (socket: Socket) => {
  let user: ClientInfo = { id: socket.id, username: `Guest-${socket.id.slice(0, 4)}` };

  socket.on("identify", (data: { username?: string }) => {
    if (data?.username) user.username = data.username;
    socket.emit("identified", { id: user.id, username: user.username });
  });

  socket.on("createRoom", (data: { name?: string; id?: string }) => {
    const requestedId = data?.id && typeof data.id === "string" ? data.id.trim() : "";
    const id = requestedId && !rooms.has(requestedId) ? requestedId : uuidv4().slice(0, 8);
    const room = createRoomRecord(id, data?.name || `Room ${id}`);
    rooms.set(id, room);
    socket.join(id);
    socket.emit("roomCreated", { id, name: room.name });
    io.emit("roomUpdate", summary(room));
  });

  socket.on("joinRoom", (data: { roomId: string; role: "player" | "spectator" }) => {
    const room = rooms.get(data.roomId);
    if (!room) return socket.emit("error", { error: "room not found" });
    socket.join(room.id);
    if (data.role === "player") {
      room.players.push({ id: user.id, username: user.username, socketId: socket.id });
    } else {
      room.spectators.push({ id: user.id, username: user.username, socketId: socket.id });
      // Send spectator snapshot if battle started
      if (room.battleStarted && room.engine) {
  const state = (room.engine as any)["state"] as import("../types").BattleState;
  socket.emit("spectate_start", { state, replay: room.replay, phase: room.phase ?? "normal", needsSwitch: Array.from(room.forceSwitchNeeded ?? []), deadline: room.forceSwitchDeadline ?? null, rooms: { trick: state.field.room, magic: state.field.magicRoom, wonder: state.field.wonderRoom } });
      }
    }
    io.emit("roomUpdate", summary(room));
    socket.emit("challengeSync", { roomId: room.id, challenges: challengeSummaries(room) });
  });

  socket.on("startBattle", (data: { roomId: string; players: Player[]; seed?: number }) => {
    const room = rooms.get(data.roomId);
    if (!room) return socket.emit("error", { error: "room not found" });
    if (room.battleStarted) return;
    room.engine = new Engine({ seed: data.seed ?? 123 });
    const state = room.engine.initializeBattle(data.players, { seed: data.seed ?? 123 });
    room.battleStarted = true;
    room.phase = "normal";
    room.forceSwitchNeeded = new Set();
    console.log(`[Server] Emitting battleStarted for room ${room.id} (startBattle socket)`);
    io.to(room.id).emit("battleStarted", { roomId: room.id, state });
  });

  socket.on("sendAction", (data: { roomId: string; playerId: string; action: Action }) => {
    const room = rooms.get(data.roomId);
    if (!room) return socket.emit("error", { error: "room not found" });
    
    // Validate sender is a player in the room and matches playerId
    const sender = room.players.find((p) => p.socketId === socket.id);
    if (!sender || sender.id !== data.playerId) {
      return socket.emit("error", { error: "not authorized for this action" });
    }
    
    // Handle team preview phase
    if (room.phase === "team-preview") {
      if (data.action.type === "team" && Array.isArray((data.action as any).order)) {
        console.log(`[Server] Team preview order received from ${data.playerId}:`, (data.action as any).order);
        if (!room.teamPreviewOrders) room.teamPreviewOrders = {};
        room.teamPreviewOrders[data.playerId] = (data.action as any).order;
        socket.emit("teamPreviewSubmitted", { playerId: data.playerId });
        io.to(room.id).emit("teamPreviewProgress", { 
          playerId: data.playerId, 
          submitted: Object.keys(room.teamPreviewOrders).length,
          total: room.teamPreviewPlayers?.length || 2 
        });
        checkTeamPreviewComplete(room);
        return;
      } else if (data.action.type === "auto") {
        // Auto-submit with default order
        if (!room.teamPreviewOrders) room.teamPreviewOrders = {};
        const playerData = room.teamPreviewPlayers?.find(p => p.id === data.playerId);
        const defaultOrder = playerData?.team.map((_: any, i: number) => i + 1) || [1, 2, 3, 4, 5, 6];
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
    
    if (!room.engine) return socket.emit("error", { error: "battle not started" });
    // If we're in force-switch phase, only accept switch actions from required players
    if (room.phase === "force-switch") {
      if (!room.forceSwitchNeeded?.has(data.playerId)) {
        return socket.emit("error", { error: "no switch required" });
      }
      if (data.action.type !== "switch") {
        return socket.emit("error", { error: "must switch due to faint" });
      }
      // Perform immediate forced switch via engine
      const res = room.engine.forceSwitch(data.playerId, (data.action as any).toIndex);
      room.replay.push({ turn: res.state.turn, events: res.events, anim: res.anim, phase: "force-switch" });
      room.forceSwitchNeeded.delete(data.playerId);
      {
        const s = (room.engine as any)["state"] as import("../types").BattleState;
        io.to(room.id).emit("battleUpdate", { result: res, needsSwitch: Array.from(room.forceSwitchNeeded), deadline: room.forceSwitchDeadline ?? null, rooms: { trick: s.field.room, magic: s.field.magicRoom, wonder: s.field.wonderRoom } });
      }
      if (room.forceSwitchNeeded.size === 0) {
        room.phase = "normal";
        io.to(room.id).emit("phase", { phase: room.phase });
        clearForceSwitchTimer(room);
        // Emit new move prompts so players can choose their next action
        const freshState = (room.engine as any)["state"] as import("../types").BattleState;
        emitMovePrompts(room, freshState);
      }
      return;
    }
    room.turnBuffer[data.playerId] = data.action;
    console.log(`[Server] Action received from ${data.playerId}:`, JSON.stringify(data.action));
    const expected = room.engine["state"].players.length; // internal access for quick prototype
    console.log(`[Server] Turn buffer size: ${Object.keys(room.turnBuffer).length}/${expected}`);
    if (Object.keys(room.turnBuffer).length >= expected) {
      const actions = Object.values(room.turnBuffer);
      room.turnBuffer = {};
      // Filter to only battle actions (move/switch)
      const battleActions = actions.filter((a): a is import("../types").BattleAction => a.type === "move" || a.type === "switch");
      console.log('[Server] Processing turn with actions:', JSON.stringify(battleActions.map(a => ({ type: a.type, pokemonId: a.pokemonId, ...(a.type === 'move' ? { moveId: (a as any).moveId, targetPokemonId: (a as any).targetPokemonId } : {}) }))));
      const result: TurnResult = room.engine.processTurn(battleActions);
      room.replay.push({ turn: result.state.turn, events: result.events, anim: result.anim });
      const needsSwitch: string[] = computeNeedsSwitch(result.state);
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
      } else if (needsSwitch.length === 0) {
        // Emit new move prompts for the next turn
        emitMovePrompts(room, result.state);
      }
    } else {
      // prompt others that we're waiting
      io.to(room.id).emit("promptAction", { waitingFor: expected - Object.keys(room.turnBuffer).length });
    }
  });

  socket.on("sendChat", (data: { roomId: string; text: string }) => {
    const room = rooms.get(data.roomId);
    if (!room) return;
    io.to(room.id).emit("chatMessage", { user: user.username, text: data.text, time: Date.now() });
  });

  socket.on("createChallenge", (data: { roomId: string; challengeId?: string; toPlayerId?: string; rules?: any; format?: string; player?: Player }) => {
    const room = data?.roomId ? rooms.get(data.roomId) : undefined;
    if (!room) return socket.emit("error", { error: "room not found" });
    const isPlayer = Boolean(findPlayerBySocket(room, socket.id));
    if (!isPlayer) return socket.emit("error", { error: "must join as player" });

    const rawId = typeof data?.challengeId === "string" ? data.challengeId.trim() : "";
    const challengeId = rawId && !room.challenges.has(rawId) ? rawId : uuidv4().slice(0, 8);
    const targetPlayer = data?.toPlayerId ? room.players.find((p) => p.id === data.toPlayerId) : undefined;

    const challenge: Challenge = {
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

  socket.on("cancelChallenge", (data: { roomId: string; challengeId: string }) => {
    const room = data?.roomId ? rooms.get(data.roomId) : undefined;
    if (!room) return;
    const challenge = data?.challengeId ? room.challenges.get(data.challengeId) : undefined;
    if (!challenge) return;
    if (challenge.owner.socketId !== socket.id) return socket.emit("error", { error: "not authorized" });
    room.challenges.delete(challenge.id);
    emitChallengeRemoved(room, challenge.id, "cancelled");
    broadcastRoomSummary(room);
  });

  socket.on("respondChallenge", (data: { roomId: string; challengeId: string; accepted: boolean; player?: Player }) => {
    const room = data?.roomId ? rooms.get(data.roomId) : undefined;
    if (!room) return socket.emit("error", { error: "room not found" });
    const challenge = data?.challengeId ? room.challenges.get(data.challengeId) : undefined;
    if (!challenge) return socket.emit("error", { error: "challenge not found" });

    let participant: ChallengeParticipant | undefined;
    if (challenge.owner.socketId === socket.id) participant = challenge.owner;
    if (!participant && challenge.target && challenge.target.socketId === socket.id) participant = challenge.target;

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

    if (!participant) return socket.emit("error", { error: "not part of challenge" });

    if (!data?.accepted) {
      room.challenges.delete(challenge.id);
      emitChallengeRemoved(room, challenge.id, "declined");
      broadcastRoomSummary(room);
      return;
    }

    if (!data?.player) return socket.emit("error", { error: "team payload required" });

    participant.accepted = true;
    participant.username = user.username;
    participant.playerPayload = JSON.parse(JSON.stringify(data.player));

    if (challenge.owner.accepted && challenge.owner.playerPayload && challenge.target && challenge.target.accepted && challenge.target.playerPayload) {
      challenge.status = "launching";
      emitChallengeUpdated(room, challenge);
      launchChallenge(room, challenge);
    } else {
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
          } else if (challenge.target && challenge.target.socketId === socket.id) {
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

function summary(room: Room) {
  return {
    id: room.id,
    name: room.name,
    players: room.players.map((p) => ({ id: p.id, username: p.username })),
    spectCount: room.spectators.length,
    battleStarted: room.battleStarted,
    challengeCount: room.challenges.size,
  };
}

function saveReplay(room: Room) {
  const id = uuidv4().slice(0, 8);
  const file = path.join(REPLAYS_DIR, `${id}.json`);
  const payload = {
    id,
    room: { id: room.id, name: room.name },
    createdAt: Date.now(),
    replay: room.replay,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return id;
}

export function startServer(port = Number(process.env.PORT) || 3000) {
  server.listen(port, () => console.log(`Server running on :${port}`));
}

if (require.main === module) {
  startServer();
}
