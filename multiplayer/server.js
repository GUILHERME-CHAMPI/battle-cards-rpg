'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {WebSocketServer,WebSocket}=require('ws');
const PORT=Number(process.env.PORT)||3000;
const html=fs.readFileSync(path.join(__dirname,'public','index.html'));
const server=http.createServer((req,res)=>{
 if(req.url==='/'||req.url==='/index.html'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(html);
 }else if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,queue:queue.length,rooms:rooms.size,privateWaiting:privateRooms.size}));}
 else{res.writeHead(404);res.end('Not found')}
});
const wss=new WebSocketServer({server,maxPayload:4096});
const queue=[];const rooms=new Map();const privateRooms=new Map();const colors=['Vermelho','Azul','Verde','Amarelo'];
const MAX_ROUNDS=100;
const CARD_RULES={'0':'Golpe leve: 1 de dano','1':'Golpe leve: 1 de dano','2':'Golpe leve: 1 de dano','3':'Golpe médio: 2 de dano','4':'Golpe médio: 2 de dano','5':'Golpe médio: 2 de dano','6':'Golpe forte: 3 de dano','7':'Golpe forte: 3 de dano','8':'Golpe forte: 3 de dano','9':'Golpe forte: 3 de dano','⚔️ Ataque':'2 de dano','🔥 Fogo':'3 de dano','❄️ Gelo':'1 de dano e pula a vez','🩸 Dreno':'2 de dano e recupera 1 de vida','🛡️ Escudo':'+2 de escudo','💚 Cura':'+2 de vida','Bloqueio':'Pula a vez do adversário','+2':'Adversário compra 2 e perde a vez','Inverter':'Em duelo, joga novamente','Coringa':'Escolhe a próxima cor e ganha 1 de escudo'};
function send(ws,msg){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg))}
function random(n){return crypto.randomInt(n)}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function deck(){const d=[];for(const color of colors){for(let n=0;n<=9;n++){d.push({color,value:String(n)});if(n)d.push({color,value:String(n)})}for(const effect of ['Bloqueio','+2','Inverter','⚔️ Ataque','🛡️ Escudo','💚 Cura','🔥 Fogo','❄️ Gelo','🩸 Dreno'])for(let i=0;i<2;i++)d.push({color,value:effect})}for(let i=0;i<4;i++)d.push({color:'Coringa',value:'Coringa'});return shuffle(d)}
function removeQueue(ws){let i=queue.indexOf(ws);if(i>=0)queue.splice(i,1)}
function leaveWaiting(ws){removeQueue(ws);if(ws.waitingCode){privateRooms.delete(ws.waitingCode);ws.waitingCode=null}}
function roomCode(){let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase()}while(privateRooms.has(code));return code}
function setName(ws,name){ws.name=String(name||'Jogador').trim().replace(/[<>]/g,'').slice(0,20)||'Jogador'}
function state(room,viewer){const me=room.players.indexOf(viewer);return {type:'state',room:room.id,me,players:room.players.map((w,i)=>({name:w.name,count:room.hands[i].length,connected:w.readyState===WebSocket.OPEN,hp:room.hp[i],shield:room.shield[i]})),hand:room.hands[me],turn:room.turn,top:room.top,color:room.color,pile:room.deck.length,message:room.message,finished:room.finished,winner:room.winner,round:room.round,canDraw:!room.drawn,cardRules:CARD_RULES}}
function broadcast(room){for(const w of room.players)send(w,state(room,w))}
function draw(room,index,count=1){for(let k=0;k<count;k++){
 if(!room.deck.length){const top=room.discard.pop();room.deck=shuffle(room.discard.splice(0));room.discard=[top];if(!room.deck.length)break}
 room.hands[index].push(room.deck.pop())
}}
function next(room,steps=1){room.turn=(room.turn+steps)%room.players.length;room.drawn=false;room.round++}
function start(a,b,privateCode=null){const room={id:privateCode||crypto.randomBytes(3).toString('hex').toUpperCase(),players:[a,b],deck:deck(),hands:[[],[]],discard:[],top:null,color:null,turn:random(2),drawn:false,hp:[10,10],shield:[0,0],finished:false,winner:null,round:0,message:'Partida iniciada! Cada carta tem um poder. Vitória com 0 de vida ou 0 cartas.'};for(let i=0;i<2;i++)draw(room,i,7);let top=room.deck.pop();while(top.color==='Coringa'){room.deck.unshift(top);shuffle(room.deck);top=room.deck.pop()}room.top=top;room.color=top.color;room.discard.push(top);rooms.set(room.id,room);a.room=b.room=room;send(a,{type:'matched'});send(b,{type:'matched'});broadcast(room)}
function match(){while(queue.length>=2){const a=queue.shift(),b=queue.shift();if(a.readyState!==WebSocket.OPEN){if(b.readyState===WebSocket.OPEN)queue.unshift(b);continue}if(b.readyState!==WebSocket.OPEN){queue.unshift(a);continue}start(a,b)}}
function damage(room,index,amount){const absorbed=Math.min(room.shield[index],amount);room.shield[index]-=absorbed;room.hp[index]=Math.max(0,room.hp[index]-(amount-absorbed))}
function score(room,i){return room.hp[i]*5+room.shield[i]*2-room.hands[i].length*2}
function checkLimit(room){if(room.round<MAX_ROUNDS)return false;const a=score(room,0),b=score(room,1);const winner=a===b?(room.hands[0].length<=room.hands[1].length?0:1):(a>b?0:1);finish(room,winner,'Limite de 100 turnos: vitória por pontos.');return true}
function finish(room,winner,reason=''){ room.finished=true;room.winner=winner;room.message=(reason?reason+' ':'')+'🏆 '+room.players[winner].name+' venceu a batalha RPG!';broadcast(room);rooms.delete(room.id);for(const p of room.players)p.room=null}
function handle(ws,msg){if(!msg||typeof msg!=='object')return;
 if(msg.type==='create_private'){
  if(ws.room||queue.includes(ws)||ws.waitingCode)return;
  setName(ws,msg.name);const code=roomCode();ws.waitingCode=code;privateRooms.set(code,ws);
  send(ws,{type:'private_created',code});return;
 }
 if(msg.type==='join_private'){
  if(ws.room||queue.includes(ws)||ws.waitingCode)return;
  const code=String(msg.code||'').trim().toUpperCase();
  if(!/^[A-F0-9]{6}$/.test(code)){send(ws,{type:'error',message:'Código inválido. Use as 6 letras/números da sala.'});return}
  const host=privateRooms.get(code);
  if(!host||host.readyState!==WebSocket.OPEN||host.room){send(ws,{type:'error',message:'Sala não encontrada ou já iniciada.'});return}
  setName(ws,msg.name);privateRooms.delete(code);host.waitingCode=null;start(host,ws,code);return;
 }
 if(msg.type==='join'){if(ws.room||queue.includes(ws)||ws.waitingCode)return;setName(ws,msg.name);queue.push(ws);send(ws,{type:'queued',position:queue.length});match();return}
 if(msg.type==='cancel'){leaveWaiting(ws);send(ws,{type:'cancelled'});return}
 const room=ws.room;if(!room||room.finished)return;const i=room.players.indexOf(ws);if(i!==room.turn){send(ws,{type:'error',message:'Espere sua vez.'});return}
 if(msg.type==='draw'){if(room.drawn){send(ws,{type:'error',message:'Você já comprou uma carta neste turno.'});return}const before=room.hands[i].length;draw(room,i);if(room.hands[i].length===before){next(room);room.message='Baralho esgotado: turno passado automaticamente.';if(!checkLimit(room))broadcast(room);return}room.drawn=true;room.message=ws.name+' comprou uma carta.';broadcast(room);return}
 if(msg.type==='pass'){if(!room.drawn){send(ws,{type:'error',message:'Compre uma carta antes de passar.'});return}next(room);room.message=ws.name+' passou a vez.';if(!checkLimit(room))broadcast(room);return}
 if(msg.type==='play'){
  const index=Number(msg.index);if(!Number.isInteger(index)||index<0||index>=room.hands[i].length)return;
  const card=room.hands[i][index];if(card.color!=='Coringa'&&card.color!==room.color&&card.value!==room.top.value){send(ws,{type:'error',message:'Carta inválida: combine a cor ou o valor.'});return}
  let chosen=card.color;if(card.color==='Coringa'){chosen=String(msg.color||'');if(!colors.includes(chosen)){send(ws,{type:'error',message:'Escolha uma cor válida.'});return}}
  room.hands[i].splice(index,1);room.top=card;room.color=chosen;room.discard.push(card);room.message=ws.name+' jogou '+card.value+' ('+chosen+').';
  const other=(i+1)%2;
  if(/^[0-9]$/.test(card.value)){const n=Number(card.value);const power=n<=2?1:n<=5?2:3;damage(room,other,power);room.message+=' ⚔️ Golpe numérico: '+power+' de dano!'}
  if(card.value==='Coringa'){room.shield[i]=Math.min(6,room.shield[i]+1);room.message+=' 🌈 Cor escolhida e +1 de escudo!'}
  if(card.value==='⚔️ Ataque'){damage(room,other,2);room.message+=' ⚔️ 2 de dano!'}
  if(card.value==='🔥 Fogo'){damage(room,other,3);room.message+=' 🔥 Bola de fogo: 3 de dano!'}
  if(card.value==='❄️ Gelo'){damage(room,other,1);room.message+=' ❄️ 1 de dano e adversário congelado!'}
  if(card.value==='🩸 Dreno'){damage(room,other,2);room.hp[i]=Math.min(10,room.hp[i]+1);room.message+=' 🩸 Drenou 2 de vida e curou 1!'}
  if(card.value==='🛡️ Escudo'){room.shield[i]=Math.min(6,room.shield[i]+2);room.message+=' 🛡️ +2 de escudo!'}
  if(card.value==='💚 Cura'){room.hp[i]=Math.min(10,room.hp[i]+2);room.message+=' 💚 +2 de vida!'}
  if(room.hp[other]===0){finish(room,i);return}
  if(!room.hands[i].length){finish(room,i);return}
  if(card.value==='+2'){draw(room,other,2);room.message+=' O adversário comprou 2 cartas e perdeu a vez.';next(room,2)}
  else if(['Bloqueio','Inverter','❄️ Gelo'].includes(card.value)){room.message+=' O adversário perdeu a vez.';next(room,2)}
  else next(room);
  if(!checkLimit(room))broadcast(room)
 }
}
wss.on('connection',(ws,req)=>{
 const origin=req.headers.origin;const host=req.headers.host;
 if(origin){try{if(new URL(origin).host!==host){ws.close(1008,'Origem não permitida');return}}catch(e){ws.close(1008);return}}
 ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);
 ws.on('message',raw=>{try{handle(ws,JSON.parse(raw.toString()))}catch(e){send(ws,{type:'error',message:'Mensagem inválida.'})}});
 ws.on('close',()=>{leaveWaiting(ws);const room=ws.room;if(room&&!room.finished){room.finished=true;const other=room.players.find(p=>p!==ws);if(other){send(other,{type:'opponent_left',message:'O adversário desconectou. Você venceu por abandono.'});other.room=null}rooms.delete(room.id)}ws.room=null})
});
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue}ws.isAlive=false;ws.ping()}},30000);heartbeat.unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`UNOPOWER online em http://localhost:${PORT}`));