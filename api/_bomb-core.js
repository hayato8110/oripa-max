// ボムブラスト 抽選ロジック(サーバー専用)
// ファイル名の先頭が _ なので、Vercelでは公開APIにならない(関数の数に入らない。api/cluster.js から import されるだけ)
import { webcrypto } from 'node:crypto';

const R=7,C=7,TRIES=5,MAXR=4,MAXM=4,MAXX=3;
const GEMS=[['gem',.5,12],['gem',1,10],['gem',2,6],['gem',5,3],['gem',10,1.5],['gem',25,.5],['gem',50,.2],['gem',150,.05]];
const ITEMW=[['fire',2.2],['bombup',1.4],['pierce',1.8],['x2',1.1],['bolt',1.2],['roulette',.9],['diamond',.9],['magnet',.7],['replay',1],['gold',.9],['dragon',.8]];
const CONTENT=[...GEMS,['bomb',0,9],...ITEMW.map(a=>[a[0],0,a[1]]),['mystery',0,1.4]];
const rnd=()=>{const a=new Uint32Array(2);webcrypto.getRandomValues(a);return (a[0]*2**21+(a[1]>>>11))/2**53};
function pickW(list,w,skip){let s=0;for(const it of list)if(it[0]!==skip)s+=w(it);let q=rnd()*s;for(const it of list){if(it[0]===skip)continue;q-=w(it);if(q<=0)return it}return list[0]}
const pickContent=skip=>{const it=pickW(CONTENT,a=>a[2],skip);return{t:'block',k:it[0],v:it[1]}};
const pickGemV=()=>pickW(GEMS,a=>a[2])[1];
const pickItem=()=>pickW(ITEMW,a=>a[1])[0];
function genCell(r,c){
  if(r%2===1&&c%2===1)return{t:'pillar'};
  const x=rnd();if(x<.2)return{t:'floor'};if(x<.48)return{t:'block',k:'none',v:0};
  return pickContent()}
export function genBlast(){
  const grid=[];for(let r=0;r<R;r++){grid.push([]);for(let c=0;c<C;c++)grid[r].push(genCell(r,c))}
  const init=grid.map(row=>row.map(x=>({...x})));
  const st={range:2,mult:1,pierce:false,gold:false,extra:0};
  let units=0;const drops=[];let cur={r:0,c:0,pz:false};
  function apply(k,rr,cc,chain){
    if(k==='fire')st.range=Math.min(MAXR,st.range+1);
    else if(k==='bombup')st.extra=Math.min(MAXX,st.extra+1);
    else if(k==='pierce')st.pierce=true;
    else if(k==='x2')st.mult=Math.min(MAXM,st.mult+1);
    else if(k==='gold')st.gold=true;
    else if(k==='bomb')chain.push([rr,cc,'']);
    else if(k==='bolt')chain.push([rr,cc,'line']);
    else if(k==='roulette'||k==='diamond'||k==='magnet'||k==='replay'||k==='dragon')chain.push([rr,cc,k])}
  function brk(rr,cc,x,broke,chain,gold){x.t='floor';let k=x.k,b=x.v;
    if(gold&&k==='none'){k='gem';b=pickGemV()}
    if(k==='gem'){const v=b*st.mult;units+=v;broke.push({r:rr,c:cc,k,v,b});return}
    let as='';if(k==='mystery')as=pickItem();
    apply(as||k,rr,cc,chain);broke.push({r:rr,c:cc,k,v:0,b:0,as})}
  function explode(r,c,ev,chain,mode,o){
    o=o||{};const cells=[{r,c}],broke=[],range=st.range,fx=[];
    if(mode==='roulette'){for(let i=0;i<R;i++)for(let j=0;j<C;j++)if(grid[i][j].t==='block'){grid[i][j]=rnd()<.35?{t:'block',k:'none',v:0}:pickContent('roulette')}}
    else if(mode==='diamond'){for(let i=0;i<R;i++)for(let j=0;j<C;j++){const x=grid[i][j];if(x.t==='block'&&x.k==='gem'&&x.v<=2){x.v=5;fx.push({r:i,c:j})}}}
    else if(mode==='magnet'){for(let i=0;i<R;i++)for(let j=0;j<C;j++){const x=grid[i][j];if(x.t==='block'&&x.k==='gem'){cells.push({r:i,c:j});brk(i,j,x,broke,chain,false)}}}
    else if(mode==='dragon'){for(let i=0;i<R;i++)for(let j=0;j<C;j++){if(!(i===0||j===0||i===R-1||j===C-1))continue;const x=grid[i][j];if(x.t==='pillar')continue;cells.push({r:i,c:j});if(x.t==='block')brk(i,j,x,broke,chain,false)}}
    else if(mode==='line'){
      for(const dc of[1,-1])for(let d=1;d<C;d++){const cc=c+dc*d;if(cc<0||cc>=C)break;const x=grid[r][cc];if(x.t==='pillar')continue;cells.push({r,c:cc});if(x.t==='block')brk(r,cc,x,broke,chain,false)}
    }else for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1]])for(let d=1;d<=range;d++){
      const rr=r+dr*d,cc=c+dc*d;if(rr<0||rr>=R||cc<0||cc>=C)break;const x=grid[rr][cc];if(x.t==='pillar')break;
      cells.push({r:rr,c:cc});
      if(x.t==='block'){brk(rr,cc,x,broke,chain,o.gold);if(!o.pierce)break}}
    ev.push({r,c,cells,broke,fx,u:units,mode:mode||'',range,pierce:!!o.pierce,gold:!!o.gold,st:{...st}})}
  for(let d=0;d<TRIES+st.extra&&d<TRIES+MAXX;d++){
    const floors=[];for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(grid[r][c].t==='floor')floors.push([r,c]);
    const pool=floors.length?floors:[[0,0]];const[pr,pc]=pool[Math.floor(rnd()*pool.length)];
    const pz=st.pierce,gz=st.gold;st.pierce=false;st.gold=false;cur={r:pr,c:pc,pz};
    const ev=[],chain=[];explode(pr,pc,ev,chain,'',{pierce:pz,gold:gz});
    while(chain.length){const[a,b,m]=chain.shift();
      if(m==='replay')explode(cur.r,cur.c,ev,chain,'replay',{pierce:cur.pz});else explode(a,b,ev,chain,m)}
    drops.push({r:pr,c:pc,ev,u:units,pz,gz})}
  return{init,drops,units}}


// ===== 配当(獲得コイン) =====
export const MIN_WIN = 100;      // 最低保証(コイン)
export const BOMB_DEFAULT = { D: 18.47, maxWin: 20 };   // D=配当の係数(大きいほど還元率が下がる) / maxWin=最大獲得(購入額の何倍まで)
// 管理画面の設定を安全な範囲に丸める
export function bombSettings(s = {}) {
  const D = Number(s.betRate ?? s.D), mw = Number(s.maxWin);
  return {
    D: Number.isFinite(D) ? Math.min(200, Math.max(3, D)) : BOMB_DEFAULT.D,
    maxWin: Number.isFinite(mw) ? Math.min(500, Math.max(5, mw)) : BOMB_DEFAULT.maxWin,
  };
}
export const bombCoin = (units, price, D, maxWin) =>
  Math.max(Math.min(MIN_WIN, maxWin * price), Math.min(Math.round(price * units / D), maxWin * price));

// 試算用: 抽選n回分の「宝石ユニット数」を作る(配当の係数Dに関係なく同じ分布)
export function sampleUnits(n) { const a = []; for (let i = 0; i < n; i++) a.push(genBlast().units); return a; }
export function evalBomb(units, price, D, maxWin) {
  let sum = 0, max = 0, hit = 0, ge = 0;
  for (const u of units) { const c = bombCoin(u, price, D, maxWin); sum += c; if (c > max) max = c; if (c > MIN_WIN) hit++; if (c >= price) ge++; }
  const n = units.length;
  return { rtp: sum / (n * price), avg: sum / n, max, hit: hit / n, ge: ge / n };
}
// 目標の還元率(0〜1)になるDを求める(二分探索)
export function fitBomb(units, price, maxWin, target) {
  let lo = 3, hi = 200;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; evalBomb(units, price, m, maxWin).rtp > target ? (lo = m) : (hi = m); }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}
