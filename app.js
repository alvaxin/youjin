const TILE_ORDER = {
  W: 0,
  T: 20,
  B: 40,
  E: 60,
  S: 61,
  X: 62,
  N: 63,
  Z: 64,
  F: 65,
  P: 66,
  H: 90
};

const SUIT_LABELS = {
  W: "万",
  T: "条",
  B: "筒"
};

const HONORS = [
  ["E", "东"],
  ["S", "南"],
  ["X", "西"],
  ["N", "北"],
  ["Z", "中"],
  ["F", "发"]
];

const FLOWERS = [
  ["H1", "春"],
  ["H2", "夏"],
  ["H3", "秋"],
  ["H4", "冬"],
  ["H5", "梅"],
  ["H6", "兰"],
  ["H7", "菊"],
  ["H8", "竹"]
];

const state = {
  mode: "no-winds",
  round: 0,
  dealer: null,
  players: [],
  wall: [],
  deadWall: [],
  discards: [],
  current: 0,
  phase: "idle",
  gold: null,
  goldIndicator: null,
  dice: null,
  lastDiscard: null,
  winner: null,
  pendingThreeGold: null,
  pendingYoujin: null,
  pendingClaim: null,
  actionDeadline: null,
  actionTimerKey: null,
  startGoldCounts: [0, 0, 0, 0],
  scores: [1000, 1000, 1000, 1000],
  lastScoreChanges: [0, 0, 0, 0],
  lastSettlement: null,
  log: [],
  selfSeat: 0
};

const el = {
  modeSelect: document.querySelector("#modeSelect"),
  createRoomBtn: document.querySelector("#createRoomBtn"),
  joinRoomBtn: document.querySelector("#joinRoomBtn"),
  roomCodeInput: document.querySelector("#roomCodeInput"),
  roomLobby: document.querySelector("#roomLobby"),
  roomCodeText: document.querySelector("#roomCodeText"),
  roomMembers: document.querySelector("#roomMembers"),
  accountText: document.querySelector("#accountText"),
  roomText: document.querySelector("#roomText"),
  newRoundBtn: document.querySelector("#newRoundBtn"),
  resetScoresBtn: document.querySelector("#resetScoresBtn"),
  chiBtn: document.querySelector("#chiBtn"),
  chiOptions: document.querySelector("#chiOptions"),
  pengBtn: document.querySelector("#pengBtn"),
  gangBtn: document.querySelector("#gangBtn"),
  huBtn: document.querySelector("#huBtn"),
  youjinBtn: document.querySelector("#youjinBtn"),
  passBtn: document.querySelector("#passBtn"),
  roundText: document.querySelector("#roundText"),
  wallCount: document.querySelector("#wallCount"),
  deadWallCount: document.querySelector("#deadWallCount"),
  diceText: document.querySelector("#diceText"),
  goldTile: document.querySelector("#goldTile"),
  whiteTile: document.querySelector("#whiteTile"),
  selfName: document.querySelector("#selfName"),
  selfInfo: document.querySelector("#selfInfo"),
  selfAvatar: document.querySelector("#selfAvatar"),
  selfMeta: document.querySelector("#selfMeta"),
  selfDiscards: document.querySelector("#selfDiscards"),
  selfMelds: document.querySelector("#selfMelds"),
  selfHand: document.querySelector("#selfHand"),
  turnText: document.querySelector("#turnText"),
  turnPointer: document.querySelector("#turnPointer"),
  actionCountdown: document.querySelector("#actionCountdown"),
  lastDiscard: document.querySelector("#lastDiscard"),
  resultText: document.querySelector("#resultText"),
  logList: document.querySelector("#logList"),
  scoreDetails: document.querySelector("#scoreDetails"),
  settlementPanel: document.querySelector("#settlementPanel"),
  settlementDetails: document.querySelector("#settlementDetails"),
  closeSettlementBtn: document.querySelector("#closeSettlementBtn")
};

const net = { account: null, room: null, events: null, syncing: false, statePoll: null, actionPoll: null, driverPoll: null, aiWatchdog: null, statePolling: false, actionPolling: false, driverPolling: false, handledActions: new Set() };
el.newRoundBtn.addEventListener("click", () => requestAction("start"));
el.resetScoresBtn.addEventListener("click", () => requestAction("reset"));
el.chiBtn.addEventListener("click", () => requestAction("claim", { type: "chi" }));
el.pengBtn.addEventListener("click", () => requestAction("claim", { type: "peng" }));
el.gangBtn.addEventListener("click", () => requestAction("claim", { type: "gang" }));
el.huBtn.addEventListener("click", () => requestAction("hu"));
el.youjinBtn.addEventListener("click", () => requestAction("youjin"));
el.passBtn.addEventListener("click", () => requestAction("pass"));
el.createRoomBtn.addEventListener("click", createRoom);
el.joinRoomBtn.addEventListener("click", joinRoom);
el.closeSettlementBtn.addEventListener("click", () => {
  dismissedSettlementRound = state.round;
  el.settlementPanel.hidden = true;
});

function createTile(id, label, family, rank = 0) {
  return { id, label, family, rank };
}

function buildTiles(mode) {
  const tiles = [];
  for (const family of ["W", "T", "B"]) {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let i = 0; i < 4; i += 1) {
        tiles.push(createTile(`${family}${rank}`, `${rank}${SUIT_LABELS[family]}`, family, rank));
      }
    }
  }

  if (mode === "with-winds") {
    for (const [id, label] of HONORS) {
      for (let i = 0; i < 4; i += 1) {
        tiles.push(createTile(id, label, id, 0));
      }
    }
  }

  for (let i = 0; i < 4; i += 1) {
    tiles.push(createTile("P", "白", "P", 0));
  }

  for (const [id, label] of FLOWERS) {
    tiles.push(createTile(id, label, "H", Number(id.slice(1))));
  }

  return tiles.map((tile, instanceId) => ({ ...tile, instanceId }));
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function readApiResponse(response) {
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(response.ok ? "服务返回了无法识别的数据，请刷新页面后重试" : `服务器连接失败（${response.status}），请稍后重试`);
  }
  if (!response.ok) throw new Error(data.error || "网络请求失败");
  return data;
}

async function api(path, body) {
  return readApiResponse(await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

async function getApi(path) {
  return readApiResponse(await fetch(path));
}

async function initAccount() {
  try {
    const saved = localStorage.getItem("youjin-account-token");
    net.account = await api("/api/auth/guest", { token: saved });
    localStorage.setItem("youjin-account-token", net.account.token);
    el.accountText.textContent = `账号：${net.account.name}`;
  } catch (error) {
    el.accountText.textContent = "本地练习模式";
  }
}

async function createRoom() {
  if (!net.account) return;
  try {
    net.room = await api("/api/rooms", { token: net.account.token });
    connectRoom();
    updateRoomText();
  } catch (error) { alert(error.message); }
}

async function joinRoom() {
  if (!net.account) return;
  const code = el.roomCodeInput.value.trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) return alert("请输入六位房间码");
  try {
    net.room = await api(`/api/rooms/${code}/join`, { token: net.account.token });
    connectRoom();
    updateRoomText();
  } catch (error) { alert(error.message); }
}

function connectRoom() {
  net.events?.close();
  clearInterval(net.statePoll);
  clearInterval(net.actionPoll);
  clearInterval(net.driverPoll);
  clearInterval(net.aiWatchdog);
  net.handledActions.clear();
  net.events = new EventSource(`/api/rooms/${net.room.code}/events?token=${encodeURIComponent(net.account.token)}`);
  net.events.addEventListener("room", (event) => { net.room = { ...net.room, ...JSON.parse(event.data) }; updateRoomText(); });
  net.events.addEventListener("members", (event) => { const update = JSON.parse(event.data); net.room = { ...net.room, members: update.members }; updateRoomText(); });
  net.events.addEventListener("state", (event) => {
    if (isRoomDriver()) return;
    applyRemoteState(JSON.parse(event.data));
  });
  net.events.addEventListener("action", (event) => {
    if (!isRoomDriver()) return;
    handleRemoteAction(JSON.parse(event.data));
  });
  startRoomFallbacks();
}

function applyRemoteState(snapshot) {
  if (!snapshot) return;
  Object.assign(state, snapshot, { selfSeat: net.room.mySeat ?? 0 });
  render();
}

function handleRemoteAction(request) {
  if (request.from === net.account.token) return;
  if (!Number.isInteger(request.seat) || !net.room.members.some((item) => item.seat === request.seat)) return;
  if (Number.isInteger(request.id)) {
    if (net.handledActions.has(request.id)) return;
    net.handledActions.add(request.id);
    if (net.handledActions.size > 200) net.handledActions.clear();
  }
  dispatchAction(request.action, request.payload, request.seat);
}

function startRoomFallbacks() {
  net.statePoll = window.setInterval(async () => {
    if (net.statePolling || !net.room || isRoomDriver()) return;
    net.statePolling = true;
    try {
      const update = await getApi(`/api/rooms/${net.room.code}/state?token=${encodeURIComponent(net.account.token)}`);
      if (update.room) {
        net.room = { ...net.room, ...update.room };
        updateRoomText();
      }
      if (update.state && !isRoomDriver()) applyRemoteState(update.state);
    } catch (error) {
      console.warn("房间状态同步失败", error);
    } finally {
      net.statePolling = false;
    }
  }, 250);

  refreshRoomDriver();
  net.driverPoll = window.setInterval(refreshRoomDriver, 1000);
  net.aiWatchdog = window.setInterval(ensureAiProgress, 800);
  net.actionPoll = window.setInterval(async () => {
    if (net.actionPolling || !net.room || !isRoomDriver()) return;
    net.actionPolling = true;
    try {
      const result = await api(`/api/rooms/${net.room.code}/actions`, { token: net.account.token });
      result.actions.forEach(handleRemoteAction);
    } catch (error) {
      console.warn("房间操作同步失败", error);
    } finally {
      net.actionPolling = false;
    }
  }, 150);
}

async function refreshRoomDriver() {
  if (net.driverPolling || !net.room || !net.account) return;
  net.driverPolling = true;
  const wasDriver = isRoomDriver();
  try {
    const update = await api(`/api/rooms/${net.room.code}/driver`, { token: net.account.token });
    if (update.room) {
      net.room = { ...net.room, ...update.room };
      updateRoomText();
    }
    if (update.state && !wasDriver && isRoomDriver()) applyRemoteState(update.state);
  } catch (error) {
    console.warn("房间执行权同步失败", error);
  } finally {
    net.driverPolling = false;
  }
}

function isHost() { return !net.room || net.room.host === net.account?.token; }
function isRoomDriver() { return !net.room || net.room.isDriver === true; }
function updateRoomText() {
  if (!net.room) {
    el.roomText.textContent = "本地练习";
    el.roomLobby.hidden = true;
    el.newRoundBtn.disabled = false;
    el.modeSelect.disabled = false;
    return;
  }
  const host = isHost();
  const statusText = net.room.status === "lobby" ? "等待加入" : "牌局中";
  el.roomText.textContent = `房间 ${net.room.code} · ${net.room.members.length}/4 · ${statusText}`;
  el.roomLobby.hidden = false;
  el.roomCodeText.textContent = `房间号 ${net.room.code} · ${host ? "房主" : "已加入"}`;
  el.roomMembers.replaceChildren(...Array.from({ length: 4 }, (_, seat) => {
    const member = net.room.members.find((item) => item.seat === seat);
    const slot = document.createElement("span");
    slot.className = `room-member${member ? "" : " vacant"}`;
    slot.textContent = member ? `${windName(seat)} ${member.name}` : `${windName(seat)} 等待玩家`;
    return slot;
  }));
  el.newRoundBtn.disabled = !host;
  el.newRoundBtn.title = host ? "开始新局" : "仅房主可开始新局";
  el.modeSelect.disabled = !host;
}
async function requestAction(action, payload = {}) {
  if (!net.room) return dispatchAction(action, payload, state.selfSeat);
  if (isHost() && (action === "start" || action === "reset")) {
    try {
      const result = await api(`/api/rooms/${net.room.code}/action`, { token: net.account.token, action, payload });
      if (result.room) {
        net.room = { ...net.room, ...result.room };
        updateRoomText();
      }
      await refreshRoomDriver();
      if (!isRoomDriver()) return alert("当前由其他设备维持牌局，请稍后再试");
    } catch (error) {
      alert(error.message);
      return;
    }
    return dispatchAction(action, payload, state.selfSeat);
  }
  if (isRoomDriver()) {
    return dispatchAction(action, payload, state.selfSeat);
  }
  try {
    await api(`/api/rooms/${net.room.code}/action`, { token: net.account.token, action, payload });
  } catch (error) {
    alert(error.message);
  }
}
function dispatchAction(action, payload = {}, seat = state.selfSeat) {
  if (action === "start") { if (isHost()) startRound(); return; }
  if (action === "reset") { if (isHost()) resetScores(); return; }
  if (seat !== state.current) return;
  if (action === "timeout") {
    const context = getTimedActionContext();
    if (context && payload.key === state.actionTimerKey && payload.key === context.key) resolveActionTimeout(context);
    return;
  }
  if (action === "claim") claimForHuman(payload.type, payload.option);
  if (action === "hu") {
    if (state.pendingClaim) claimForHuman("hu");
    else tryHumanHu();
  }
  if (action === "youjin") declareYoujin(state.current);
  if (action === "pass") passHumanClaim();
  if (action === "discard") discardTile(state.current, payload.tileIndex);
}
let syncTimer;
let aiTimer;
let youjinDrawTimer;
let actionClockTimer;
let actionDeadlineTimer;
let actionDeadlineTimerKey = null;
let actionDeadlineTimerAt = null;
let timeoutRequestKey = null;
let lastCountdownSound = null;
let countdownAudio = null;
let dismissedSettlementRound = null;

function usesActionClock() {
  return state.phase === "playing" && state.players.filter((player) => player.human).length >= 2;
}

function getTimedActionContext() {
  if (!usesActionClock()) return null;

  if (state.pendingClaim) {
    const claim = getActiveClaim();
    if (!claim || !state.players[claim.index]?.human) return null;
    return { key: `claim:${claim.index}:${state.pendingClaim.from}:${state.pendingClaim.tile.instanceId}:${state.pendingClaim.position}`, index: claim.index, type: "pass" };
  }

  if (state.pendingThreeGold != null && state.players[state.pendingThreeGold]?.human) {
    return { key: `three-gold:${state.pendingThreeGold}:${state.round}`, index: state.pendingThreeGold, type: "pass" };
  }

  if (state.pendingYoujin?.awaitingDiscard && state.players[state.pendingYoujin.index]?.human) {
    return { key: `youjin-discard:${state.pendingYoujin.index}:${state.round}`, index: state.pendingYoujin.index, type: "pass" };
  }

  if (state.pendingYoujin?.awaitingSelfHu != null && state.players[state.pendingYoujin.awaitingSelfHu]?.human) {
    return { key: `youjin-hu:${state.pendingYoujin.awaitingSelfHu}:${state.round}`, index: state.pendingYoujin.awaitingSelfHu, type: "pass" };
  }

  if (state.pendingYoujin) return null;
  const player = state.players[state.current];
  if (!player?.human || !player.drewThisTurn) return null;
  return { key: `discard:${state.round}:${state.current}:${player.drawnTileId || "claim"}:${player.mustDiscardAfterClaim}:${player.passedSelfHu}`, index: state.current, type: "discard" };
}

function syncActionClock() {
  const context = getTimedActionContext();
  const controlsClock = !net.room || isRoomDriver();
  if (!context) {
    if (controlsClock) {
      state.actionDeadline = null;
      state.actionTimerKey = null;
    }
    stopActionClock();
    return;
  }

  if (controlsClock && (state.actionTimerKey !== context.key || !Number.isFinite(state.actionDeadline))) {
    state.actionTimerKey = context.key;
    state.actionDeadline = Date.now() + 60000;
    lastCountdownSound = null;
  }

  if (controlsClock) armActionDeadline(context);
  if (!actionClockTimer) actionClockTimer = window.setInterval(updateActionClock, 250);
  updateActionClock();
}

function armActionDeadline(context) {
  if (actionDeadlineTimer && actionDeadlineTimerKey === context.key && actionDeadlineTimerAt === state.actionDeadline) return;
  clearTimeout(actionDeadlineTimer);
  actionDeadlineTimerKey = context.key;
  actionDeadlineTimerAt = state.actionDeadline;
  actionDeadlineTimer = window.setTimeout(() => {
    actionDeadlineTimer = null;
    const current = getTimedActionContext();
    if (current?.key === context.key && state.actionTimerKey === context.key) resolveActionTimeout(current);
  }, Math.max(0, state.actionDeadline - Date.now()) + 5);
}

function stopActionClock() {
  clearInterval(actionClockTimer);
  clearTimeout(actionDeadlineTimer);
  actionClockTimer = null;
  actionDeadlineTimer = null;
  actionDeadlineTimerKey = null;
  actionDeadlineTimerAt = null;
  timeoutRequestKey = null;
  lastCountdownSound = null;
  el.actionCountdown.hidden = true;
  el.actionCountdown.textContent = "";
}

function updateActionClock() {
  const context = getTimedActionContext();
  if (!context || state.actionTimerKey !== context.key || !Number.isFinite(state.actionDeadline)) {
    stopActionClock();
    return;
  }

  const seconds = Math.max(0, Math.ceil((state.actionDeadline - Date.now()) / 1000));
  el.actionCountdown.hidden = seconds > 15;
  el.actionCountdown.textContent = seconds > 15 ? "" : `${seconds} 秒`;
  if (seconds > 0 && seconds <= 15 && lastCountdownSound !== seconds) {
    lastCountdownSound = seconds;
    playCountdownTone(seconds);
  }

  if (seconds !== 0) return;
  if (!net.room || isRoomDriver()) {
    resolveActionTimeout(context);
  } else if (state.selfSeat === context.index && timeoutRequestKey !== context.key) {
    timeoutRequestKey = context.key;
    requestAction("timeout", { key: context.key });
  }
}

function resolveActionTimeout(context) {
  if (state.actionTimerKey !== context.key || state.phase !== "playing") return;
  state.actionDeadline = null;
  state.actionTimerKey = null;
  const player = state.players[context.index];
  if (!player) return;

  if (context.type === "discard") {
    let tileIndex = player.hand.findIndex((tile) => tile.instanceId === player.drawnTileId);
    if (tileIndex < 0) tileIndex = chooseDiscardIndex(player);
    if (tileIndex >= 0) {
      addLog(`${player.name} 操作超时，自动打出 ${tileName(player.hand[tileIndex])}。`);
      discardTile(context.index, tileIndex);
    }
    return;
  }

  addLog(`${player.name} 操作超时，自动选择过。`);
  passHumanClaim();
}

function playCountdownTone(seconds) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    countdownAudio ||= new AudioContext();
    countdownAudio.resume().catch(() => {});
    const oscillator = countdownAudio.createOscillator();
    const gain = countdownAudio.createGain();
    oscillator.frequency.value = seconds <= 5 ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, countdownAudio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, countdownAudio.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, countdownAudio.currentTime + 0.12);
    oscillator.connect(gain).connect(countdownAudio.destination);
    oscillator.start();
    oscillator.stop(countdownAudio.currentTime + 0.13);
  } catch (_) {
    // Browsers may block audio before a player interacts with the page.
  }
}

function scheduleSync() {
  if (!net.room || !isRoomDriver() || state.phase === "idle") return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    net.syncing = true;
    try { await api(`/api/rooms/${net.room.code}/state`, { token: net.account.token, state }); }
    catch (error) { console.warn(error); }
    finally { net.syncing = false; }
  }, 20);
}

function startRound() {
  clearTimeout(youjinDrawTimer);
  clearTimeout(aiTimer);
  aiTimer = null;
  state.mode = el.modeSelect.value;
  state.round += 1;
  state.winner = null;
  state.pendingThreeGold = null;
  state.pendingYoujin = null;
  state.pendingClaim = null;
  state.actionDeadline = null;
  state.actionTimerKey = null;
  state.phase = "playing";
  state.discards = [];
  state.lastDiscard = null;
  state.gold = null;
  state.goldIndicator = null;
  state.dice = rollDice();
  state.dealer = state.dealer ?? Math.floor(Math.random() * 4);
  state.current = state.dealer;
  state.log = [];

  const members = net.room?.members || [{ name: net.account?.name || "玩家 1", seat: 0 }];
  state.players = Array.from({ length: 4 }, (_, i) => ({
    name: members.find((member) => member.seat === i)?.name || `AI ${i + 1}`,
    human: members.some((member) => member.seat === i),
    hand: [],
    flowers: [],
    melds: [],
    discards: [],
    declaredYoujin: false,
    passedThreeGold: false,
    passedSelfHu: false,
    mustDiscardAfterClaim: false,
    drawnTileId: null,
    drewThisTurn: i === state.dealer
  }));
  state.selfSeat = net.room?.mySeat ?? 0;

  const shuffled = shuffle(buildTiles(state.mode));
  state.deadWall = shuffled.splice(-18);
  state.wall = shuffled;

  dealHands();
  replaceAllFlowers();
  openGold();
  state.startGoldCounts = state.players.map((player) => countGold(player.hand));
  const starter = state.players.findIndex((player, i) => state.startGoldCounts[i] >= 3 && canWinByLimit(i, "three-gold"));
  if (starter >= 0) {
    state.pendingThreeGold = starter;
    state.current = starter;
    addLog(`${state.players[starter].name} 起手三金倒，可选择胡或过。`);
    render();
    if (!state.players[starter].human && (!net.room || isRoomDriver())) {
      window.setTimeout(() => {
        if (state.phase === "playing" && state.pendingThreeGold === starter) finishRound(starter, "three-gold");
      }, 1000);
    }
    return;
  }

  addLog(`${state.players[state.dealer].name} 坐庄，先打出一张牌。`);
  render();
  if (!state.players[state.current].human) {
    queueAiTurn();
  }
}

function dealHands() {
  for (let n = 0; n < 16; n += 1) {
    for (let offset = 0; offset < 4; offset += 1) {
      const seat = (state.dealer + offset) % 4;
      state.players[seat].hand.push(drawFromWall());
    }
  }
  const dealerTile = drawFromWall();
  state.players[state.dealer].hand.push(dealerTile);
  state.players[state.dealer].drawnTileId = dealerTile?.instanceId ?? null;
  state.players.forEach(sortHand);
}

function replaceAllFlowers() {
  let changed = true;
  while (changed) {
    changed = false;
    for (const player of state.players) {
      const flowers = player.hand.filter(isFlower);
      if (!flowers.length) continue;
      changed = true;
      player.hand = player.hand.filter((tile) => !isFlower(tile));
      player.flowers.push(...flowers);
      for (let i = 0; i < flowers.length; i += 1) {
        const replacement = drawFromDeadWall();
        if (replacement) player.hand.push(replacement);
      }
      sortHand(player);
      if (player.drawnTileId != null && !player.hand.some((tile) => tile.instanceId === player.drawnTileId)) {
        player.drawnTileId = null;
      }
    }
  }
}

function openGold() {
  const side = state.dice.total % 4;
  const sidePlayer = (state.dealer + (side === 0 ? 3 : side - 1)) % 4;
  const opener = state.players[sidePlayer];
  const start = Math.max(0, Math.min(state.wall.length - 1, state.dice.total - 1));

  while (state.wall.length) {
    // Removing the card keeps the following card at this same opening position.
    const indicator = state.wall.splice(Math.min(start, state.wall.length - 1), 1)[0];
    if (isFlower(indicator)) {
      opener.flowers.push(indicator);
      addLog(`${opener.name} 开金翻出花牌 ${tileName(indicator)}，获得该花并继续开金。`);
      continue;
    }

    state.goldIndicator = indicator;
    state.gold = indicator;
    addLog(`${opener.name} 开金，翻出 ${tileName(indicator)}。`);
    return;
  }

  finishDraw();
}

function drawFromWall() {
  return state.wall.shift() || null;
}

function drawFromDeadWall() {
  return state.deadWall.pop() || state.wall.pop() || null;
}

function drawForPlayer(index) {
  const player = state.players[index];
  let tile = drawFromWall();
  if (!tile) {
    finishDraw();
    return null;
  }
  player.hand.push(tile);
  while (tile && isFlower(tile)) {
    player.hand = player.hand.filter((item) => item !== tile);
    player.flowers.push(tile);
    addLog(`${player.name} 补花 ${tileName(tile)}。`);
    tile = drawFromDeadWall();
    if (tile) player.hand.push(tile);
  }
  player.drewThisTurn = true;
  player.passedSelfHu = false;
  player.mustDiscardAfterClaim = false;
  player.drawnTileId = tile?.instanceId ?? null;
  sortHand(player);
  return tile;
}

function drawForHuman() {
  if (state.phase !== "playing" || !state.players[state.current]?.human) return;
  if (!state.players[state.current].drewThisTurn) {
    const tile = drawForPlayer(state.current);
    if (tile) addLog(`${state.players[state.current].name} 摸牌。`);
    autoWinCheckAfterDraw(state.current);
  }
  render();
}

function discardTile(index, tileIndex) {
  const player = state.players[index];
  if (state.phase !== "playing" || state.pendingThreeGold != null || state.current !== index || !player.drewThisTurn) return;
  const youjinDeclaration = state.pendingYoujin?.index === index && state.pendingYoujin.awaitingDiscard;
  const allowedYoujinTileIds = state.pendingYoujin?.discardTileIds || [];
  const selectedTile = player.hand[tileIndex];
  if (youjinDeclaration && (!selectedTile || !allowedYoujinTileIds.includes(selectedTile.instanceId))) return;
  const [tile] = player.hand.splice(tileIndex, 1);
  player.discards.push(tile);
  state.lastDiscard = { tile, from: index };
  state.discards.push(tile);
  player.drewThisTurn = false;
  player.drawnTileId = null;
  player.mustDiscardAfterClaim = false;
  addLog(`${player.name} 打出 ${tileName(tile)}。`);
  sortHand(player);

  if (youjinDeclaration) {
    state.pendingYoujin.awaitingDiscard = false;
    state.pendingYoujin.winType = isGold(tile) ? "double-youjin" : "youjin";
    delete state.pendingYoujin.discardTileIds;
    addLog(`${player.name} 打出${state.pendingYoujin.winType === "double-youjin" ? "金牌，进入双游" : "游金听牌"}，其他三家各剩一次摸牌机会。`);
    continueToNextTurn(index);
    return;
  }

  if (resolveClaims(index, tile)) return;
  continueToNextTurn(index);
}

function advanceTurn(from) {
  if (state.pendingYoujin && from !== state.pendingYoujin.index) {
    state.pendingYoujin.remaining -= 1;
  }

  if (state.pendingYoujin && state.pendingYoujin.remaining <= 0) {
    const winner = state.pendingYoujin.index;
    state.current = winner;
    finishRound(winner, state.pendingYoujin.winType || "youjin");
    return;
  }

  state.current = (from + 1) % 4;
}

function startCurrentTurn() {
  if (state.phase !== "playing") return;
  const player = state.players[state.current];
  if (!player) return;

  if (state.pendingYoujin && !state.pendingYoujin.awaitingDiscard && state.current !== state.pendingYoujin.index) {
    playYoujinDrawTurn(state.current);
    return;
  }

  if (player.human && !player.drewThisTurn) {
    drawForHuman();
    return;
  }

  render();
  if (!player.human) queueAiTurn();
}

function continueToNextTurn(from) {
  advanceTurn(from);
  startCurrentTurn();
}

function playYoujinDrawTurn(index) {
  const player = state.players[index];
  const tile = drawForPlayer(index);
  if (!tile || state.phase !== "playing") return;
  addLog(`${player.name} 游金阶段摸牌。`);
  if (canWinByLimit(index, "self")) {
    if (player.human) {
      state.pendingYoujin.awaitingSelfHu = index;
      render();
      return;
    }
    finishRound(index, "self");
    return;
  }
  render();
  clearTimeout(youjinDrawTimer);
  youjinDrawTimer = window.setTimeout(() => {
    if (state.phase !== "playing" || state.current !== index || !state.pendingYoujin || state.pendingYoujin.awaitingSelfHu) return;
    continueToNextTurn(index);
  }, 1200);
}

function resolveClaims(from, tile) {
  const order = [1, 2, 3].map((n) => (from + n) % 4);
  for (const index of order) {
    if (canWinByDiscard(index, tile)) {
      if (state.players[index].human) {
        state.pendingClaim = { from, tile, claims: [{ index, types: getHumanClaimTypes(index, from, tile) }], position: 0 };
        activatePendingClaim();
        render();
      } else {
        finishRound(index, "discard", tile, from);
      }
      return true;
    }
  }

  if (prepareHumanClaim(from, tile, order)) {
    render();
    return true;
  }

  return resolveAiClaims(from, tile, order);
}

function prepareHumanClaim(from, tile, order) {
  const humanClaims = [];
  for (const index of order) {
    const player = state.players[index];
    if (!player.human) continue;

    const types = getHumanClaimTypes(index, from, tile);
    if (types.length) humanClaims.push({ index, types });
  }

  humanClaims.sort((a, b) => {
    return claimPriority(a.types) - claimPriority(b.types);
  });

  if (!humanClaims.length) return false;
  state.pendingClaim = { from, tile, claims: humanClaims, position: 0 };
  activatePendingClaim();
  return true;
}

function getHumanClaimTypes(index, from, tile) {
  const player = state.players[index];
  const types = [];
  if (canWinByDiscard(index, tile)) types.push("hu");
  if (!isGold(tile) && countMatching(player.hand, tile) >= 3) types.push("gang");
  if (!isGold(tile) && countMatching(player.hand, tile) >= 2) types.push("peng");
  if (index === (from + 1) % 4 && getChiOptions(player, tile).length) types.push("chi");
  return types;
}

function activatePendingClaim() {
  const claim = getActiveClaim();
  if (!claim) return;
  delete state.pendingClaim.choosingChi;
  state.pendingClaim.index = claim.index;
  state.pendingClaim.types = claim.types;
  state.current = claim.index;
  addLog(`${state.players[claim.index].name} 可选择 ${claim.types.map(claimTypeName).join(" / ")} ${tileName(state.pendingClaim.tile)}。`);
}

function resolveAiClaims(from, tile, order = [1, 2, 3].map((n) => (from + n) % 4)) {
  for (const index of order) {
    const player = state.players[index];
    if (player.human) continue;
    if (!isGold(tile) && countMatching(player.hand, tile) >= 3) {
      claimMingGang(index, tile, from);
      render();
      queueAiTurn();
      return true;
    }
    if (!isGold(tile) && countMatching(player.hand, tile) >= 2) {
      removeMatching(player.hand, tile, 2);
      player.melds.push({ type: "peng", tiles: [tile, tile, tile], from });
      addLog(`${player.name} 碰 ${tileName(tile)}。`);
      state.current = index;
      player.drewThisTurn = true;
      player.mustDiscardAfterClaim = true;
      render();
      queueAiTurn();
      return true;
    }
  }

  const next = (from + 1) % 4;
  if (!state.players[next].human && canChi(state.players[next], tile)) {
    claimChi(next, tile, from);
    render();
    queueAiTurn();
    return true;
  }
  return false;
}

function claimForHuman(type, chiOptionIndex) {
  const claim = state.pendingClaim;
  if (claim) {
    if (state.phase !== "playing" || !claim.types.includes(type)) return;
    if (type === "hu") {
      const { index, tile, from } = claim;
      state.pendingClaim = null;
      finishRound(index, "discard", tile, from);
      return;
    }
    if (type === "gang") {
      claimMingGang(claim.index, claim.tile, claim.from);
    } else if (type === "peng") {
      claimPeng(claim.index, claim.tile, claim.from);
    } else {
      const options = getChiOptions(state.players[claim.index], claim.tile);
      if (options.length > 1 && !Number.isInteger(chiOptionIndex)) {
        claim.choosingChi = true;
        render();
        return;
      }
      const option = options[chiOptionIndex ?? 0];
      if (!option) return;
      claimChi(claim.index, claim.tile, claim.from, option);
    }
    state.pendingClaim = null;
    render();
    return;
  }

  if (type === "gang" && state.players[state.current]?.human) {
    claimSelfGang(state.current);
  }
}

function passHumanClaim() {
  const claim = state.pendingClaim;
  if (!claim) {
    const player = state.players[state.current];
    if (state.phase === "playing" && player?.human && state.pendingThreeGold === state.current) {
      player.passedThreeGold = true;
      state.pendingThreeGold = null;
      state.current = state.dealer;
      addLog(`${player.name} 放弃三金倒，本局不再触发。`);
      startCurrentTurn();
      return;
    }
    if (state.phase === "playing" && player?.human && state.pendingYoujin?.index === state.current && state.pendingYoujin.awaitingDiscard) {
      state.pendingYoujin = null;
      player.declaredYoujin = false;
      addLog(`${player.name} 放弃游金声明。`);
      render();
      return;
    }
    if (state.phase === "playing" && player?.human && state.pendingYoujin?.awaitingSelfHu === state.current) {
      state.pendingYoujin.awaitingSelfHu = null;
      player.passedSelfHu = true;
      addLog(`${player.name} 放弃本次自摸。`);
      continueToNextTurn(state.current);
      return;
    }
    if (state.phase === "playing" && player?.human && player.drewThisTurn && !player.passedSelfHu && canWinByLimit(state.current, "self")) {
      player.passedSelfHu = true;
      addLog(`${player.name} 放弃本次自摸。`);
      render();
      return;
    }
    render();
    return;
  }

  claim.position += 1;
  if (claim.position < claim.claims.length) {
    activatePendingClaim();
    render();
    return;
  }

  state.pendingClaim = null;
  const order = [1, 2, 3].map((n) => (claim.from + n) % 4);
  if (resolveAiClaims(claim.from, claim.tile, order)) return;
  continueToNextTurn(claim.from);
}

function getActiveClaim() {
  return state.pendingClaim?.claims[state.pendingClaim.position] || null;
}

function claimPeng(index, tile, from) {
  if (isGold(tile)) return;
  const player = state.players[index];
  const used = removeMatching(player.hand, tile, 2);
  player.melds.push({ type: "peng", tiles: [...used, tile], from });
  addLog(`${player.name} 碰 ${tileName(tile)}。`);
  state.current = index;
  player.drewThisTurn = true;
  player.drawnTileId = null;
  player.mustDiscardAfterClaim = true;
  sortHand(player);
}

function claimMingGang(index, tile, from) {
  if (isGold(tile)) return;
  const player = state.players[index];
  const used = removeMatching(player.hand, tile, 3);
  player.melds.push({ type: "ming-gang", tiles: [...used, tile], from });
  addLog(`${player.name} 明杠 ${tileName(tile)}。`);
  state.current = index;
  player.drewThisTurn = true;
  player.drawnTileId = null;
  drawAfterGang(index);
  sortHand(player);
}

function claimSelfGang(index) {
  const player = state.players[index];
  if (state.pendingThreeGold != null || state.pendingYoujin) return;
  const option = getSelfGangOptions(player)[0];
  if (!option) return;

  if (option.type === "an-gang") {
    const used = removeMatchingById(player.hand, option.id, 4);
    player.melds.push({ type: "an-gang", tiles: used, from: index });
    addLog(`${player.name} 暗杠 ${tileName(used[0])}。`);
  } else {
    const tileIndex = player.hand.findIndex((tile) => sameTileKey(tile) === option.id);
    const [tile] = player.hand.splice(tileIndex, 1);
    option.meld.type = "ming-gang";
    option.meld.tiles.push(tile);
    addLog(`${player.name} 补杠 ${tileName(tile)}，按明杠处理。`);
  }

  drawAfterGang(index);
  player.drewThisTurn = true;
  sortHand(player);
  render();
  if (!player.human) queueAiTurn();
}

function drawAfterGang(index) {
  const player = state.players[index];
  let tile = drawFromDeadWall();
  if (!tile) {
    finishDraw();
    return;
  }
  player.hand.push(tile);
  while (tile && isFlower(tile)) {
    player.hand = player.hand.filter((item) => item !== tile);
    player.flowers.push(tile);
    addLog(`${player.name} 杠后补花 ${tileName(tile)}。`);
    tile = drawFromDeadWall();
    if (tile) player.hand.push(tile);
  }
  player.drawnTileId = tile?.instanceId ?? null;
  player.passedSelfHu = false;
  player.mustDiscardAfterClaim = false;
  sortHand(player);
}

function claimChi(index, tile, from, option = getChiOptions(state.players[index], tile)[0]) {
  const player = state.players[index];
  if (!option) return;
  const used = option.map(({ family, rank }) => removeNormalized(player.hand, family, rank));
  player.melds.push({ type: "chi", tiles: [...used, tile], from });
  addLog(`${player.name} 吃 ${tileName(tile)}。`);
  state.current = index;
  player.drewThisTurn = true;
  player.drawnTileId = null;
  player.mustDiscardAfterClaim = true;
  sortHand(player);
}

function queueAiTurn() {
  if (net.room && !isRoomDriver()) return;
  if (aiTimer != null) return;
  aiTimer = window.setTimeout(() => {
    aiTimer = null;
    runAiTurn();
  }, 2000);
}

function ensureAiProgress() {
  if (net.room && !isRoomDriver()) return;
  if (state.phase !== "playing" || state.pendingClaim || state.pendingThreeGold != null) return;
  if (state.pendingYoujin?.awaitingDiscard || state.pendingYoujin?.awaitingSelfHu != null) return;
  const player = state.players[state.current];
  if (player && !player.human) queueAiTurn();
}

function runAiTurn() {
  if (state.phase !== "playing") return;
  const player = state.players[state.current];
  if (player.human) {
    render();
    return;
  }

  if (!player.drewThisTurn) {
    const tile = drawForPlayer(state.current);
    if (tile) addLog(`${player.name} 摸牌。`);
  }

  if (autoWinCheckAfterDraw(state.current)) return;
  const youjinOptions = getYoujinDiscardOptions(state.current);
  if (!state.pendingYoujin && youjinOptions.length && countGold(player.hand) < 3 && Math.random() > 0.45) {
    declareYoujin(state.current);
    const tileIndex = player.hand.findIndex((tile) => tile.instanceId === youjinOptions[0].instanceId);
    discardTile(state.current, tileIndex);
    return;
  }
  if (getSelfGangOptions(player).length && Math.random() > 0.25) {
    claimSelfGang(state.current);
    return;
  }
  const index = chooseDiscardIndex(player);
  discardTile(state.current, index);
}

function autoWinCheckAfterDraw(index) {
  const player = state.players[index];
  if (player.human) return false;
  if (canWinByLimit(index, "self")) {
    finishRound(index, "self");
    return true;
  }
  if (player.declaredYoujin && canWinByLimit(index, "youjin")) {
    finishRound(index, "youjin");
    return true;
  }
  return false;
}

function chooseDiscardIndex(player) {
  const goldIndex = player.hand.findIndex(isGold);
  if (goldIndex >= 0 && isYoujinReadyByHand(removeAt(player.hand, goldIndex), player.melds)) {
    return goldIndex;
  }
  const nonGold = player.hand.findIndex((tile) => !isGold(tile));
  return nonGold >= 0 ? nonGold : 0;
}

function tryHumanHu() {
  if (state.phase !== "playing") return;
  const index = state.current;
  if (state.players[index]?.human && state.pendingThreeGold === index && !state.players[index].passedThreeGold && canWinByLimit(index, "three-gold")) {
    finishRound(index, "three-gold");
    return;
  }
  const canHuDuringYoujin = state.pendingYoujin?.awaitingSelfHu === index;
  if (state.players[index]?.human && (!state.pendingYoujin || canHuDuringYoujin) && !state.players[index].mustDiscardAfterClaim && !state.players[index].passedSelfHu && canWinByLimit(index, "self")) {
    finishRound(index, "self");
  }
}

function declareYoujin(index) {
  const player = state.players[index];
  const options = getYoujinDiscardOptions(index);
  if (state.phase !== "playing" || state.pendingThreeGold != null || state.pendingYoujin || !player.drewThisTurn || !options.length) return;
  player.declaredYoujin = true;
  state.pendingYoujin = { index, remaining: 3, awaitingDiscard: true, discardTileIds: options.map((tile) => tile.instanceId) };
  addLog(`${player.name} 声明游金，请打出高亮的对应牌。`);
  render();
}

function getYoujinDiscardOptions(index) {
  const player = state.players[index];
  const goldCount = countGold(player?.hand || []);
  if (!player || goldCount < 1) return [];
  return player.hand.filter((tile) => {
    if (isGold(tile) && goldCount < 2) return false;
    if (!isGold(tile) && goldCount >= 3) return false;
    return isYoujinReadyByHand(
      player.hand.filter((item) => item.instanceId !== tile.instanceId),
      player.melds
    );
  });
}

function canWinByDiscard(index, tile) {
  if (countGold(state.players[index].hand) > 0) return false;
  const hand = [...state.players[index].hand, tile];
  return canCompleteHand(hand, state.players[index].melds);
}

function canWinByLimit(index, type) {
  const goldCount = countGold(state.players[index].hand);
  if (type === "three-gold") return state.startGoldCounts[index] >= 3;
  if (type === "self") return goldCount < 2 && canCompleteHand(state.players[index].hand, state.players[index].melds);
  if (type === "youjin") return goldCount < 3 && isYoujinReady(index);
  if (type === "double-youjin") return isDoubleYoujin(index);
  return false;
}

function isYoujinReady(index) {
  const player = state.players[index];
  if (countGold(player.hand) < 1) return false;
  return isYoujinReadyByHand(player.hand, player.melds);
}

function isYoujinReadyByHand(hand, melds) {
  const goldIndexes = hand.map((tile, i) => (isGold(tile) ? i : -1)).filter((i) => i >= 0);
  for (const goldIndex of goldIndexes) {
    const withoutOneGold = removeAt(hand, goldIndex);
    if (canFormOnlyGroups(withoutOneGold, melds)) return true;
  }
  return false;
}

function isDoubleYoujin(index) {
  const player = state.players[index];
  const goldIndex = player.hand.findIndex(isGold);
  if (goldIndex < 0) return false;
  return isYoujinReadyByHand(removeAt(player.hand, goldIndex), player.melds);
}

function canFormOnlyGroups(hand, melds) {
  const groupsNeeded = Math.max(0, 5 - melds.length);
  return (hand.length === groupsNeeded * 3) && canMakeGroups(countTiles(hand), countWild(hand), groupsNeeded);
}

function canCompleteHand(hand, melds) {
  const groupsNeeded = Math.max(0, 5 - melds.length);
  if (hand.length !== groupsNeeded * 3 + 2) return false;
  const counts = countTiles(hand);
  const wild = countWild(hand);
  const keys = [...counts.keys()];

  for (const key of keys) {
    const value = counts.get(key);
    if (value >= 2) {
      counts.set(key, value - 2);
      if (canMakeGroups(counts, wild, groupsNeeded)) return true;
      counts.set(key, value);
    }
    if (value >= 1 && wild >= 1) {
      counts.set(key, value - 1);
      if (canMakeGroups(counts, wild - 1, groupsNeeded)) return true;
      counts.set(key, value);
    }
  }
  return wild >= 2 && canMakeGroups(counts, wild - 2, groupsNeeded);
}

function canMakeGroups(counts, wild, groupsNeeded) {
  const key = firstCountKey(counts);
  if (!key) return wild >= groupsNeeded * 3;
  if (groupsNeeded <= 0) return false;

  const current = counts.get(key);
  const tripletNeed = Math.max(0, 3 - current);
  if (tripletNeed <= wild) {
    const next = cloneCounts(counts);
    next.delete(key);
    if (canMakeGroups(next, wild - tripletNeed, groupsNeeded - 1)) return true;
  }

  const tile = parseKey(key);
  if (["W", "T", "B"].includes(tile.family) && tile.rank <= 7) {
    const next = cloneCounts(counts);
    let need = 0;
    for (let rank = tile.rank; rank <= tile.rank + 2; rank += 1) {
      const seqKey = `${tile.family}${rank}`;
      const count = next.get(seqKey) || 0;
      if (count > 0) next.set(seqKey, count - 1);
      else need += 1;
      if (next.get(seqKey) === 0) next.delete(seqKey);
    }
    if (need <= wild && canMakeGroups(next, wild - need, groupsNeeded - 1)) return true;
  }
  return false;
}

function countTiles(hand) {
  const counts = new Map();
  for (const tile of hand) {
    if (isGold(tile)) continue;
    const normalized = normalizeTile(tile);
    const key = `${normalized.family}${normalized.rank || ""}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function normalizeTile(tile) {
  if (tile.id === "P" && state.gold && state.gold.id !== "P") {
    return state.gold;
  }
  return tile;
}

function countWild(hand) {
  return hand.filter(isGold).length;
}

function countGold(hand) {
  return hand.filter(isGold).length;
}

function isGold(tile) {
  return state.gold && tile.id === state.gold.id;
}

function isFlower(tile) {
  return tile?.family === "H";
}

function canChi(player, tile) {
  return getChiOptions(player, tile).length > 0;
}

function getChiOptions(player, tile) {
  const normalized = normalizeTile(tile);
  if (!["W", "T", "B"].includes(normalized.family)) return [];
  return [
    [normalized.rank - 2, normalized.rank - 1],
    [normalized.rank - 1, normalized.rank + 1],
    [normalized.rank + 1, normalized.rank + 2]
  ]
    .filter((ranks) => ranks.every((rank) => rank >= 1 && rank <= 9))
    .filter((ranks) => ranks.every((rank) => hasNormalized(player.hand, normalized.family, rank)))
    .map((ranks) => ranks.map((rank) => ({ family: normalized.family, rank })));
}

function chiOptionLabel(option, tile) {
  const normalized = normalizeTile(tile);
  const ranks = [...option.map(({ rank }) => rank), normalized.rank].sort((left, right) => left - right);
  const suit = { W: "万", T: "条", B: "筒" }[normalized.family];
  return ranks.map((rank) => `${rank}${suit}`).join(" ");
}

function hasNormalized(hand, family, rank) {
  return hand.some((tile) => {
    const normalized = normalizeTile(tile);
    return normalized.family === family && normalized.rank === rank && !isGold(tile);
  });
}

function removeNormalized(hand, family, rank) {
  const index = hand.findIndex((tile) => {
    const normalized = normalizeTile(tile);
    return normalized.family === family && normalized.rank === rank && !isGold(tile);
  });
  return hand.splice(index, 1)[0];
}

function countMatching(hand, tile) {
  const normalized = normalizeTile(tile);
  return hand.filter((item) => {
    const itemNormalized = normalizeTile(item);
    return !isGold(item) && itemNormalized.id === normalized.id;
  }).length;
}

function getSelfGangOptions(player) {
  if (!player.drewThisTurn || state.pendingClaim || player.mustDiscardAfterClaim) return [];
  const options = [];
  const drawnTile = player.hand.find((tile) => tile.instanceId === player.drawnTileId);
  const counts = new Map();
  for (const tile of player.hand) {
    if (isGold(tile)) continue;
    const key = sameTileKey(tile);
    if (!counts.has(key)) counts.set(key, []);
    counts.get(key).push(tile);
  }

  for (const [id, tiles] of counts.entries()) {
    if (tiles.length >= 4) options.push({ type: "an-gang", id, isDrawnTile: drawnTile && sameTileKey(drawnTile) === id });
  }

  for (const meld of player.melds) {
    if (meld.type !== "peng") continue;
    const id = sameTileKey(meld.tiles[0]);
    if (player.hand.some((tile) => sameTileKey(tile) === id && !isGold(tile))) {
      options.push({ type: "bu-gang", id, meld, isDrawnTile: drawnTile && sameTileKey(drawnTile) === id });
    }
  }

  return options.sort((a, b) => {
    if (a.type === "bu-gang" && a.isDrawnTile !== (b.type === "bu-gang" && b.isDrawnTile)) return -1;
    if (b.type === "bu-gang" && b.isDrawnTile !== (a.type === "bu-gang" && a.isDrawnTile)) return 1;
    return a.type.localeCompare(b.type);
  });
}

function sameTileKey(tile) {
  const normalized = normalizeTile(tile);
  return `${normalized.family}${normalized.rank || ""}`;
}

function removeMatching(hand, tile, amount) {
  const removed = [];
  const normalized = normalizeTile(tile);
  for (let i = hand.length - 1; i >= 0 && removed.length < amount; i -= 1) {
    const itemNormalized = normalizeTile(hand[i]);
    if (!isGold(hand[i]) && itemNormalized.id === normalized.id) {
      removed.push(hand.splice(i, 1)[0]);
    }
  }
  return removed;
}

function removeMatchingById(hand, id, amount) {
  const removed = [];
  for (let i = hand.length - 1; i >= 0 && removed.length < amount; i -= 1) {
    if (!isGold(hand[i]) && sameTileKey(hand[i]) === id) {
      removed.push(hand.splice(i, 1)[0]);
    }
  }
  return removed;
}

function finishRound(index, type, tile = null, from = null) {
  clearTimeout(youjinDrawTimer);
  clearTimeout(aiTimer);
  aiTimer = null;
  state.actionDeadline = null;
  state.actionTimerKey = null;
  state.phase = "ended";
  state.winner = index;
  state.dealer = index;
  const score = settleScores(index, type);
  const typeText = {
    discard: `胡 ${state.players[from]?.name || ""} 打出的 ${tileName(tile)}`,
    self: "自摸胡牌",
    youjin: "游金",
    "double-youjin": "双游",
    "three-gold": "三金倒"
  }[type];
  addLog(`${state.players[index].name} ${typeText}，番 ${score.fan}，水 ${score.waters[index]}。`);
  state.lastSettlement = { winner: index, type, typeText, ...score };
  el.settlementPanel.hidden = false;
  render();
}

function finishDraw() {
  clearTimeout(youjinDrawTimer);
  clearTimeout(aiTimer);
  aiTimer = null;
  state.actionDeadline = null;
  state.actionTimerKey = null;
  state.phase = "ended";
  state.winner = null;
  const before = [...state.scores];
  const waters = state.players.map((player) => calcWater(player));
  const changes = [0, 0, 0, 0];
  state.lastScoreChanges = changes;
  state.lastSettlement = {
    winner: null,
    type: "draw",
    typeText: "流局",
    fan: 0,
    waters,
    total: 0,
    before,
    after: [...state.scores],
    changes
  };
  addLog("牌墙摸完，流局。");
  el.settlementPanel.hidden = false;
  render();
}

function settleScores(winner, type) {
  const before = [...state.scores];
  const waters = state.players.map((player) => calcWater(player));
  const fan = ({ discard: 2, self: 4, youjin: 10, "three-gold": 10, "double-youjin": 20 }[type]) || 2;
  const total = fan + waters[winner];
  state.scores[winner] += total * 3;
  for (let i = 0; i < 4; i += 1) {
    if (i !== winner) state.scores[i] -= total;
  }
  const otherPlayers = [0, 1, 2, 3].filter((index) => index !== winner);
  for (let i = 0; i < otherPlayers.length; i += 1) {
    for (let j = i + 1; j < otherPlayers.length; j += 1) {
      const first = otherPlayers[i];
      const second = otherPlayers[j];
      const diff = waters[first] - waters[second];
      state.scores[first] += diff;
      state.scores[second] -= diff;
    }
  }
  const changes = state.scores.map((score, index) => score - before[index]);
  state.lastScoreChanges = changes;
  return { fan, waters, total, before, after: [...state.scores], changes };
}

function calcWater(player) {
  let water = calcFlowerWater(player.flowers);
  for (const meld of player.melds) {
    if (meld.type === "ming-gang") water += 1;
    if (meld.type === "bu-gang") water += 1;
    if (meld.type === "an-gang") water += 2;
  }
  water += countGold(player.hand);
  return water;
}

function calcFlowerWater(flowers) {
  const ids = new Set(flowers.map((tile) => tile.id));
  const seasons = ["H1", "H2", "H3", "H4"];
  const plants = ["H5", "H6", "H7", "H8"];
  const hasAllSeasons = seasons.every((id) => ids.has(id));
  const hasAllPlants = plants.every((id) => ids.has(id));
  if (hasAllSeasons && hasAllPlants) return 80;
  let water = 0;
  water += hasAllSeasons ? 10 : seasons.filter((id) => ids.has(id)).length;
  water += hasAllPlants ? 10 : plants.filter((id) => ids.has(id)).length;
  return water;
}

function render() {
  syncActionClock();
  if (state.phase === "playing") {
    dismissedSettlementRound = null;
    el.settlementPanel.hidden = true;
  } else if (state.phase === "ended" && state.lastSettlement && dismissedSettlementRound !== state.round) {
    el.settlementPanel.hidden = false;
  }
  el.roundText.textContent = state.round ? `第 ${state.round} 局，${state.players[state.dealer]?.name || "-"} 坐庄` : "准备开局";
  el.wallCount.textContent = state.wall.length;
  el.diceText.textContent = state.dice ? `${state.dice.a}+${state.dice.b}=${state.dice.total}` : "-";
  el.goldTile.replaceChildren();
  if (state.gold) {
    const indicator = tileNode(state.gold, true);
    indicator.disabled = true;
    indicator.title = `翻开金牌：${tileName(state.gold)}`;
    el.goldTile.appendChild(indicator);
  } else {
    el.goldTile.textContent = "金牌 -";
  }
  el.whiteTile.textContent = state.gold && state.gold.id !== "P" ? tileName(state.gold) : "白板为金";
  el.turnText.textContent = state.pendingClaim
    ? `${state.players[state.pendingClaim.index].name} 响应 ${tileName(state.pendingClaim.tile)}`
    : state.players[state.current]?.name || "-";
  const indicatedSeat = state.pendingClaim?.index ?? state.current;
  const turnDirection = ["down", "right", "up", "left"][(indicatedSeat - state.selfSeat + 4) % 4];
  el.turnPointer.hidden = state.phase !== "playing" || !state.players[indicatedSeat];
  el.turnPointer.className = `turn-pointer dir-${turnDirection}`;
  el.turnPointer.setAttribute("aria-label", `${state.players[indicatedSeat]?.name || "当前玩家"} 的回合方向`);
  el.resultText.textContent = state.phase === "ended"
    ? (state.winner == null ? "流局" : `${state.players[state.winner].name} 胜`)
    : "未结束";

  renderTable();

  const myTurn = state.current === state.selfSeat;
  const myPlayer = state.players[state.selfSeat];
  const canThreeGoldHu = state.phase === "playing" && state.pendingThreeGold === state.selfSeat && !myPlayer?.passedThreeGold
    && canWinByLimit(state.selfSeat, "three-gold");
  const canHuDuringYoujin = state.pendingYoujin?.awaitingSelfHu === state.selfSeat;
  const canSelfHu = state.phase === "playing" && myTurn && myPlayer?.drewThisTurn && !state.pendingThreeGold && (!state.pendingYoujin || canHuDuringYoujin) && !myPlayer.mustDiscardAfterClaim && !myPlayer.passedSelfHu
    && canWinByLimit(state.current, "self");
  const choosingYoujinDiscard = state.phase === "playing" && myTurn && myPlayer
    && state.pendingYoujin?.index === state.selfSeat && state.pendingYoujin.awaitingDiscard;
  const canDeclareYoujin = state.phase === "playing" && myTurn && myPlayer?.drewThisTurn
    && !state.pendingThreeGold && !state.pendingYoujin && getYoujinDiscardOptions(state.current).length > 0;
  el.chiBtn.disabled = !(state.pendingClaim?.index === state.selfSeat && state.pendingClaim?.types.includes("chi"));
  el.pengBtn.disabled = !(state.pendingClaim?.index === state.selfSeat && state.pendingClaim?.types.includes("peng"));
  el.gangBtn.disabled = state.pendingClaim
    ? !(state.pendingClaim?.index === state.selfSeat && state.pendingClaim.types.includes("gang"))
    : !(state.phase === "playing" && myTurn && myPlayer && !state.pendingThreeGold && !state.pendingYoujin && !choosingYoujinDiscard && getSelfGangOptions(myPlayer).length);
  el.huBtn.disabled = state.pendingClaim
    ? !(state.pendingClaim?.index === state.selfSeat && state.pendingClaim.types.includes("hu"))
    : !(canSelfHu || canThreeGoldHu);
  el.youjinBtn.disabled = !canDeclareYoujin;
  el.passBtn.disabled = !(state.phase === "playing" && (state.pendingClaim?.index === state.selfSeat || canThreeGoldHu || choosingYoujinDiscard || canSelfHu));
  renderChiOptions();

  el.logList.replaceChildren(...state.log.slice(-40).reverse().map((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    return li;
  }));

  renderScoreDetails();
  renderSettlement();
  scheduleSync();
}

function renderChiOptions() {
  const claim = state.pendingClaim;
  const player = state.players[state.selfSeat];
  const canChoose = claim?.index === state.selfSeat && claim.choosingChi && player;
  const options = canChoose ? getChiOptions(player, claim.tile) : [];
  el.chiOptions.hidden = options.length < 2;
  if (options.length < 2) {
    el.chiOptions.replaceChildren();
    return;
  }

  const label = document.createElement("span");
  label.className = "chi-options-label";
  label.textContent = "选择吃牌组合";
  const buttons = options.map((option, index) => {
    const button = document.createElement("button");
    button.className = "chi-option";
    button.textContent = chiOptionLabel(option, claim.tile);
    button.addEventListener("click", () => requestAction("claim", { type: "chi", option: index }));
    return button;
  });
  el.chiOptions.replaceChildren(label, ...buttons);
}

function renderTable() {
  const mine = state.players[state.selfSeat];
  el.selfName.textContent = mine ? `${windName(state.selfSeat)} ${mine.name}` : "我";
  el.selfAvatar.textContent = windName(state.selfSeat);
  el.selfMeta.textContent = mine ? `${state.scores[state.selfSeat]} 分 · ${mine.hand.length} 张` : "1000 分 · 0 张";
  el.selfInfo.classList.toggle("active", state.current === state.selfSeat && state.phase === "playing");
  renderTiles(el.selfDiscards, mine?.discards.slice(-18) || [], true);
  renderTiles(el.selfMelds, mine ? [...mine.melds.flatMap((meld) => meld.tiles), ...mine.flowers] : [], true);
  el.selfHand.replaceChildren();
  const handEntries = (mine?.hand || []).map((tile, index) => ({ tile, index }));
  const lockedYoujinTileIds = state.pendingYoujin?.index === state.selfSeat && state.pendingYoujin.awaitingDiscard
    ? state.pendingYoujin.discardTileIds
    : null;
  const drawnTile = mine?.drewThisTurn && mine.drawnTileId != null
    ? handEntries.find(({ tile }) => tile.instanceId === mine.drawnTileId)
    : null;
  const orderedEntries = drawnTile
    ? [...handEntries.filter(({ tile }) => tile.instanceId !== drawnTile.tile.instanceId), drawnTile]
    : handEntries;
  orderedEntries.forEach(({ tile, index }) => {
    const node = tileNode(tile);
    if (drawnTile?.tile.instanceId === tile.instanceId) node.classList.add("drawn-tile");
    if (lockedYoujinTileIds) {
      node.classList.add(lockedYoujinTileIds.includes(tile.instanceId) ? "youjin-discard-target" : "youjin-discard-muted");
    }
    if (state.phase === "playing" && state.current === state.selfSeat && mine.drewThisTurn && !state.pendingThreeGold && (!state.pendingYoujin || lockedYoujinTileIds)
      && (!lockedYoujinTileIds || lockedYoujinTileIds.includes(tile.instanceId))) {
      node.classList.add("clickable");
      node.addEventListener("click", () => requestAction("discard", { tileIndex: index }));
    } else node.disabled = true;
    el.selfHand.appendChild(node);
  });
  const positionMap = { 1: ".right-seat", 2: ".top-seat", 3: ".left-seat" };
  for (let relative = 1; relative <= 3; relative += 1) {
    const index = (state.selfSeat + relative) % 4;
    const player = state.players[index];
    const node = document.querySelector(positionMap[relative]);
    if (!player) { node.replaceChildren(); continue; }
    const card = document.createElement("div");
    card.className = `opponent-card${state.current === index && state.phase === "playing" ? " active" : ""}`;
    card.innerHTML = `<span class="avatar">${windName(index)}</span><span><strong>${player.name}</strong><small>${state.scores[index]} 分 · ${player.hand.length} 张</small></span>`;
    const melds = document.createElement("div"); melds.className = "mini-melds"; renderTiles(melds, [...player.melds.flatMap((meld) => meld.tiles), ...player.flowers], true); card.appendChild(melds);
    const discards = document.createElement("div");
    discards.className = "seat-discards opponent-discards";
    renderTiles(discards, player.discards.slice(-18), true);
    node.replaceChildren(card, discards);
  }
  for (const wall of document.querySelectorAll(".tile-wall")) {
    wall.replaceChildren(...Array.from({ length: Math.max(8, Math.min(24, Math.ceil(state.wall.length / 5))) }, () => Object.assign(document.createElement("span"), { className: "wall-piece" })));
  }
}
function renderTiles(container, tiles, small = false) { container.replaceChildren(...tiles.map((tile) => tileNode(tile, small))); }
function tileNode(tile, small = false) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = `tile art${small ? " small" : ""}${isGold(tile) ? " gold" : ""}${isFlower(tile) ? " flower" : ""}`;
  node.dataset.family = tile.family;
  node.dataset.rank = tile.rank || "";
  node.dataset.label = tile.label;
  node.style.backgroundImage = `url("assets/tiles/${tileAssetName(tile)}.png")`;
  return node;
}

function tileAssetName(tile) {
  return tile.family === "H" ? tile.id : tile.id;
}

function sortHand(player) {
  player.hand.sort((a, b) => tileSortValue(a) - tileSortValue(b));
}

function tileSortValue(tile) {
  if (isGold(tile)) return -1;
  const normalized = normalizeTile(tile);
  return (TILE_ORDER[normalized.family] ?? TILE_ORDER[normalized.id] ?? 80) + (normalized.rank || 0);
}

function tileName(tile) {
  return tile?.label || "-";
}

function rollDice() {
  const a = 1 + Math.floor(Math.random() * 6);
  const b = 1 + Math.floor(Math.random() * 6);
  return { a, b, total: a + b };
}

function addLog(text) {
  state.log.push(text);
}

function claimTypeName(type) {
  return ({ hu: "胡", gang: "杠", peng: "碰", chi: "吃" }[type]) || type;
}

function claimPriority(types) {
  if (types.includes("hu")) return 0;
  if (types.includes("gang")) return 1;
  if (types.includes("peng")) return 2;
  return 3;
}

function resetScores() {
  state.scores = [1000, 1000, 1000, 1000];
  state.lastScoreChanges = [0, 0, 0, 0];
  state.lastSettlement = null;
  el.settlementPanel.hidden = true;
  addLog("积分已清零为每人 1000。");
  render();
}

function renderScoreDetails() {
  el.scoreDetails.replaceChildren(...Array.from({ length: 4 }, (_, index) => {
    const player = state.players[index];
    const row = document.createElement("div");
    row.className = "score-row";

    const name = document.createElement("strong");
    name.textContent = player ? `${windName(index)} ${player.name}` : `玩家 ${index + 1}`;

    const score = document.createElement("span");
    score.textContent = `总分 ${state.scores[index]}`;

    const change = document.createElement("span");
    const delta = state.lastScoreChanges[index] || 0;
    change.className = delta > 0 ? "positive" : delta < 0 ? "negative" : "";
    change.textContent = `本局 ${formatDelta(delta)}`;

    const water = document.createElement("span");
    water.textContent = player ? `水 ${calcWater(player)}` : "水 0";

    row.append(name, score, change, water);
    return row;
  }));
}

function renderSettlement() {
  const data = state.lastSettlement;
  if (!data) {
    el.settlementDetails.replaceChildren();
    return;
  }

  const summary = document.createElement("p");
  summary.className = "settlement-summary";
  summary.textContent = data.type === "draw"
    ? "牌墙摸完，本局流局。全体玩家积分变化为 0。"
    : `${state.players[data.winner].name} ${data.typeText}，番 ${data.fan}，赢家水 ${data.waters[data.winner]}，基础结算 ${data.total}。`;

  const table = document.createElement("div");
  table.className = "settlement-grid";
  for (let i = 0; i < 4; i += 1) {
    const row = document.createElement("div");
    row.className = "settlement-row";
    row.innerHTML = `
      <strong>${state.players[i].name}</strong>
      <span>水 ${data.waters[i]}</span>
      <span>${data.before[i]} → ${data.after[i]}</span>
      <span class="${data.changes[i] > 0 ? "positive" : data.changes[i] < 0 ? "negative" : ""}">${formatDelta(data.changes[i])}</span>
    `;
    table.appendChild(row);
  }

  el.settlementDetails.replaceChildren(summary, table);
}

function formatDelta(value) {
  return value > 0 ? `+${value}` : `${value}`;
}

function cloneCounts(counts) {
  return new Map([...counts.entries()].filter(([, value]) => value > 0));
}

function firstCountKey(counts) {
  return [...counts.entries()].filter(([, value]) => value > 0).sort((a, b) => keySort(a[0]) - keySort(b[0]))[0]?.[0] || null;
}

function keySort(key) {
  const tile = parseKey(key);
  return (TILE_ORDER[tile.family] ?? 80) + (tile.rank || 0);
}

function parseKey(key) {
  const family = key[0];
  const rank = Number(key.slice(1)) || 0;
  return { family, rank };
}

function removeAt(items, index) {
  return items.filter((_, i) => i !== index);
}

function windName(index) {
  const names = ["东", "南", "西", "北"];
  const offset = (index - state.dealer + 4) % 4;
  return names[offset];
}

render();
initAccount();
