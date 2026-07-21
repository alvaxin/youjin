const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const clients = new Map();
const rooms = new Map();
const accounts = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.wav': 'audio/wav' };
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function read(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', d => raw += d); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } }); }); }
function user(token) { return accounts.get(token); }
function roomFor(code, token) { const room=rooms.get(code); return room && room.members.some(m => m.token === token) ? room : null; }
function send(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
function push(room, event, data) { for (const res of room.listeners.values()) send(res, event, data); }
function publicRoom(room, token) { return { code:room.code, host:room.host, mySeat:room.members.find(m=>m.token===token)?.seat, members:room.members.map(({name,seat})=>({name,seat})), status:room.status, hasState:!!room.state, isDriver:room.driver===token && room.driverUntil>Date.now() }; }
function pushRoom(room) { for (const [token,res] of room.listeners) send(res, 'room', publicRoom(room, token)); }
function stateFor(room, token) {
  const snapshot=JSON.parse(JSON.stringify(room.state));
  const seat=room.members.find(member=>member.token===token)?.seat;
  snapshot.selfSeat=seat;
  if(token!==room.host && token!==room.driver) {
    snapshot.players?.forEach((player,index)=>{
      if(index!==seat) player.hand=Array.from({length:player.hand.length},()=>({hidden:true}));
    });
  }
  return snapshot;
}
function renewDriver(room, token) {
  const now=Date.now();
  if(room.driver && room.driver!==token && room.driverUntil>now)return false;
  room.driver=token;
  room.driverUntil=now+5000;
  return true;
}
function pushState(room) { for (const [token,res] of room.listeners) send(res, 'state', stateFor(room, token)); }
function code() { let value; do { value=crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(value)); return value; }
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname==='/api/auth/guest' && req.method==='POST') { const body=await read(req); let account=user(body.token); if(!account){ const token=crypto.randomUUID(); account={token,name:`雀友${crypto.randomBytes(2).toString('hex').toUpperCase()}`}; accounts.set(token,account); } return json(res,200,account); }
  if (url.pathname==='/api/rooms' && req.method==='POST') { const body=await read(req), account=user(body.token); if(!account)return json(res,401,{error:'账号失效'}); const room={code:code(),host:account.token,members:[{token:account.token,name:account.name,seat:0}],listeners:new Map(),state:null,status:'lobby',actions:[],nextActionId:1,driver:account.token,driverUntil:Date.now()+5000}; rooms.set(room.code,room); return json(res,200,publicRoom(room,account.token)); }
  const match=url.pathname.match(/^\/api\/rooms\/([A-F0-9]{6})(?:\/(join|events|state|action|actions|driver))?$/); if(match){ const [,roomCode,operation]=match; const room=rooms.get(roomCode); if(!room)return json(res,404,{error:'房间不存在'}); if(operation==='events'){ const token=url.searchParams.get('token'); if(!roomFor(roomCode,token))return json(res,403,{error:'无权访问'}); res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}); res.flushHeaders?.(); res.write('retry: 800\n: connected\n\n'); send(res,'room',publicRoom(room,token)); if(room.state)send(res,'state',stateFor(room,token)); room.listeners.set(token,res); req.on('close',()=>room.listeners.delete(token)); return; }
    if(operation==='state' && req.method==='GET'){ const token=url.searchParams.get('token'); if(!roomFor(roomCode,token))return json(res,403,{error:'无权访问'}); return json(res,200,{room:publicRoom(room,token),state:room.state?stateFor(room,token):null}); }
    const body=await read(req); if(operation==='join'){ const account=user(body.token); if(!account)return json(res,401,{error:'账号失效'}); let member=room.members.find(m=>m.token===account.token); if(!member){ if(room.status!=='lobby')return json(res,409,{error:'牌局已开始，暂不支持中途加入'}); if(room.members.length>=4)return json(res,409,{error:'房间已满'}); member={token:account.token,name:account.name,seat:room.members.length}; room.members.push(member); pushRoom(room); } return json(res,200,publicRoom(room,account.token)); }
    if(!roomFor(roomCode,body.token))return json(res,403,{error:'无权访问'}); if(operation==='driver'){ const isDriver=renewDriver(room,body.token); return json(res,200,{room:publicRoom(room,body.token),isDriver,state:isDriver&&room.state?stateFor(room,body.token):null}); }
    if(operation==='state'){ if(!renewDriver(room,body.token))return json(res,409,{error:'当前由其他玩家同步牌局'}); room.state=body.state; if(room.status==='lobby')room.status='playing'; pushRoom(room); pushState(room); return json(res,200,{ok:true}); }
    if(operation==='actions'){ if(!renewDriver(room,body.token))return json(res,409,{error:'当前由其他玩家处理操作'}); const actions=room.actions.splice(0); return json(res,200,{actions}); }
    if(operation==='action'){ const member=room.members.find(item=>item.token===body.token); if(['start','reset'].includes(body.action)&&room.host!==body.token)return json(res,403,{error:'只有房主可执行此操作'}); if(body.action==='start'){ room.status='playing'; pushRoom(room); } const action={id:room.nextActionId++,from:body.token,seat:member.seat,action:body.action,payload:body.payload||{}}; if(room.driver!==body.token)room.actions.push(action); push(room,'action',action); return json(res,200,{ok:true,room:publicRoom(room,body.token)}); }
  }
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1); const target=path.join(root,file); if(!target.startsWith(root)||!fs.existsSync(target))return json(res,404,{error:'not found'}); const extension=path.extname(target); const headers={'Content-Type':mime[extension]||'application/octet-stream'}; if((url.pathname.startsWith('/assets/tiles/')&&extension==='.png')||(url.pathname.startsWith('/assets/audio/')&&extension==='.wav'))headers['Cache-Control']='public, max-age=31536000, immutable'; else headers['Cache-Control']='no-cache'; res.writeHead(200,headers); fs.createReadStream(target).pipe(res);
});
server.listen(process.env.PORT||4173,()=>console.log('游金麻将服务已启动: http://localhost:4173'));
