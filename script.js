// ---------- Utils ----------
const clamp = (v,a,b)=>Math.max(a, Math.min(b,v));
const lerp  = (a,b,t)=>a+(b-a)*t;
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const qs    = (s,r=document)=>r.querySelector(s);

// ---------- Globals ----------
const wrap   = qs('.wrap');
const loader = qs('#loader');
const header = qs('#siteHeader');
const footer = qs('#siteFooter');
const caText = qs('#caText');
const xLink  = qs('#xLink');
const tgLink = qs('#tgLink');

let eyes=[], pupils=[], grid=[];
let gridCols=0, gridRows=0;
let pairs=[];
const eyeMetrics = new WeakMap();

// ---------- Input tracking ----------
let mouseNX=.5, mouseNY=.5, devNX=.5, devNY=.5, useDevice=false;

function handleMouse(e){
  const vw=innerWidth, vh=innerHeight;
  mouseNX = clamp(e.clientX / vw, 0, 1);
  mouseNY = clamp(e.clientY / vh, 0, 1);
}
addEventListener('mousemove', handleMouse);
addEventListener('touchmove', e=>{
  const t=e.touches?.[0]; if(!t) return;
  handleMouse({ clientX: t.clientX, clientY: t.clientY });
},{passive:true});

function onDeviceOrientation(ev){
  const g = clamp(ev?.gamma ?? 0, -45, 45);
  const b = clamp(ev?.beta  ?? 0, -45, 45);
  devNX = lerp(devNX, (g+45)/90, 0.15);
  devNY = lerp(devNY, (b+45)/90, 0.15);
  useDevice = true;
}
try{ addEventListener('deviceorientation', onDeviceOrientation, true); }catch{}
addEventListener('click', requestMotionPermissionOnce, {once:true});
addEventListener('touchstart', requestMotionPermissionOnce, {once:true, passive:true});
async function requestMotionPermissionOnce(){
  try{
    if(typeof DeviceOrientationEvent!=='undefined'
      && typeof DeviceOrientationEvent.requestPermission==='function'){
      const p=await DeviceOrientationEvent.requestPermission();
      if(p==='granted') addEventListener('deviceorientation', onDeviceOrientation, true);
    }else{
      addEventListener('deviceorientation', onDeviceOrientation, true);
    }
  }catch{}
}

// ---------- Header dynamic (query params) ----------
try{
  const url = new URL(location.href);
  const ca = url.searchParams.get('ca');
  const x  = url.searchParams.get('x');
  const tg = url.searchParams.get('tg');
  if (ca) caText.textContent = ca;
  if (x)  xLink.href = x;
  if (tg) tgLink.href = tg;
}catch{}

// ---------- Mask config ----------
const PAIR_WIDTH = 2;
const MASK_GAP_LETTER = 1;
const MASK_GAP_SPACE  = 1;

const EYE_PX_MIN = 14;
const EYE_PX_MIN_MOBILE = 8;
const EYE_PX_MAX = 64;

// ---------- Letters ----------
const LINES_DESKTOP=[' ALL EYES ','ON US'];
const LINES_MOBILE =['ALL','EYES','ON','US'];
const FONT={
  'A':[[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
  'L':[[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,1,1]],
  'E':[[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,1,1]],
  'Y':[[1,0,1],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
  'S':[[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  'O':[[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  'N':[[1,0,1],[1,2,1],[1,1,1],[1,3,1],[1,0,1]],
  'U':[[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  ' ':[[0],[0],[0],[0],[0]],
};
const isMobile = ()=>matchMedia('(max-width:700px)').matches;
const isCompact = ()=>matchMedia('(max-width:600px)').matches;

function buildLineMask(text){
  const rows=5; const line=Array.from({length:rows},()=>[]);
  for(let i=0;i<text.length;i++){
    const ch=text[i], g=(FONT[ch]||FONT[' ']);
    for(let r=0;r<rows;r++) line[r].push(...g[r]);
    const gap = (ch===' ') ? MASK_GAP_SPACE : MASK_GAP_LETTER;
    if(i!==text.length-1){
      for(let k=0; k<gap; k++) for(let r=0;r<rows;r++) line[r].push(0);
    }
  }
  return { rows:5, cols: line[0].length, data: line };
}

function buildPhraseMask(){
  const lines = isMobile()? LINES_MOBILE : LINES_DESKTOP;
  const masks = lines.map(buildLineMask);
  const rows  = masks.length*5 + (masks.length-1)*1;
  const cols  = Math.max(...masks.map(m=>m.cols));
  const mask  = Array.from({length:rows},()=>Array(cols).fill(0));
  let y=0;
  for(let li=0; li<masks.length; li++){
    const m=masks[li]; const xOff=Math.floor((cols-m.cols)/2);
    for(let r=0;r<5;r++) for(let c=0;c<m.cols;c++) mask[y+r][xOff+c]=m.data[r][c];
    y+=5; if(li!==masks.length-1) y+=1;
  }
  return { rows, cols, data: mask };
}

function autoSizeEyes({ viewportWidth, usableHeight }){
  const { cols: mc, rows: mr } = buildPhraseMask();
  const requiredTextCols = mc * 2;
  const requiredTextRows = mr;
  const compact = isCompact();
  const minPxBase = compact ? EYE_PX_MIN_MOBILE : EYE_PX_MIN;
  const minClamp = compact ? 2 : 3;
  const sidePairOptions = compact ? [0] : [2, 1, 0];
  const rootStyle = document.documentElement.style;

  let bestCandidate = null;

  for(const sidePairs of sidePairOptions){
    let pxMax = Math.min(
      EYE_PX_MAX,
      Math.floor(viewportWidth / Math.max(1, requiredTextCols + sidePairs * 2))
    );
    if(!Number.isFinite(pxMax) || pxMax <= 0) pxMax = minPxBase;
    pxMax = Math.max(pxMax, minPxBase);

    for(let px = pxMax; px >= minClamp; px--){
      const sidePadding = sidePairs * 2 * px;
      const usableW = Math.max(0, viewportWidth - sidePadding);
      let cols = Math.floor(usableW / px);
      if (cols % 2 === 1) cols -= 1;
      if(cols < 2) cols = 2;
      const rows = usableHeight > 0 ? Math.floor(usableHeight / px) : requiredTextRows;

      const candidate = { px, cols, rows, sidePairs };

      if(cols >= requiredTextCols){
        if(rows >= requiredTextRows){
          rootStyle.setProperty('--eye-size', `${px}px`);
          rootStyle.setProperty('--sidepair-scale', String(sidePairs));
          return { px, cols };
        }

        if(!bestCandidate
          || rows > bestCandidate.rows
          || (rows === bestCandidate.rows && px > bestCandidate.px)){
          bestCandidate = candidate;
        }
      }else if(!bestCandidate){
        bestCandidate = candidate;
      }
    }
  }

  if(!bestCandidate){
    bestCandidate = {
      px: minPxBase,
      cols: requiredTextCols,
      rows: usableHeight > 0 ? Math.floor(usableHeight / Math.max(minClamp, 1)) : requiredTextRows,
      sidePairs: sidePairOptions[sidePairOptions.length-1] ?? 0,
    };
  }

  const finalCols = Math.max(2, bestCandidate.cols - (bestCandidate.cols % 2));
  const finalPx = Math.max(minClamp, Math.min(bestCandidate.px, EYE_PX_MAX));
  rootStyle.setProperty('--eye-size', `${finalPx}px`);
  rootStyle.setProperty('--sidepair-scale', String(bestCandidate.sidePairs));
  return { px: finalPx, cols: finalCols };
}

function clearScene(){ wrap.innerHTML=''; eyes=[]; pupils=[]; grid=[]; pairs=[]; eyeMetrics.clear?.(); }
function createEye(){
  const eye=document.createElement('div'); eye.className='eye';
  const pupil=document.createElement('div'); pupil.className='pupil';
  const lid=document.createElement('div');   lid.className='lid';
  eye.append(pupil, lid);
  eyes.push(eye); pupils.push(pupil);
  return eye;
}
function measureEyePX(){
  const probe=createEye(); probe.style.visibility='hidden'; wrap.appendChild(probe);
  const w=Math.max(1, Math.round(probe.getBoundingClientRect().width));
  wrap.removeChild(probe);
  return w;
}

async function buildGridIncremental(){
  clearScene();

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const headerH = header?.offsetHeight ?? 0;
  const footerH = footer?.offsetHeight ?? 0;
  const usableH = Math.max(0, vh - headerH - footerH);

  const fit = autoSizeEyes({ viewportWidth: vw, usableHeight: usableH });
  const eyePX = fit.px;

  gridCols = Math.max(2, fit.cols);
  if (gridCols % 2 === 1) gridCols -= 1;
  wrap.style.setProperty('--cols', gridCols);

  gridRows = Math.max(2, Math.floor(usableH / eyePX));

  const total = gridCols*gridRows;
  const batch = Math.max(50, Math.floor(total/30));
  let made=0; grid = Array.from({length:gridRows},()=>Array(gridCols));

  while(made<total){
    const frag=document.createDocumentFragment();
    const limit=Math.min(total, made+batch);
    for(let idx=made; idx<limit; idx++){
      const r=Math.floor(idx/gridCols), c=idx%gridCols;
      const eye=createEye(); grid[r][c]=eye; frag.appendChild(eye);
    }
    wrap.appendChild(frag);
    made=limit;
    await new Promise(r=>requestAnimationFrame(r));
  }
}

function applyMaskPairs(){
  const {rows:mr, cols:mc, data}=buildPhraseMask();

  const textEyeCols = mc * 2;
  const freeEyeCols = gridCols - textEyeCols;

  const leftFreePairs = Math.max(0, Math.floor(freeEyeCols / 2));
  const x0 = leftFreePairs * 2;
  const y0 = Math.max(0, Math.floor((gridRows - mr) / 2));

  for(let r=0;r<gridRows;r++)
    for(let c=0;c<gridCols;c++)
      grid[r][c]?.classList.remove('yellow');

  for(let r=0;r<mr;r++){
    for(let c=0;c<mc;c++){
      const v=data[r][c]; if(v===0) continue;
      const rr=y0+r; if(rr<0 || rr>=gridRows) continue;

      const left  = x0 + c*2;
      const right = left + 1;

      if (left >=0 && left < gridCols  && (v===1 || v===2))  grid[rr][left ]?.classList.add('yellow');
      if (right>=0 && right< gridCols  && (v===1 || v===3))  grid[rr][right]?.classList.add('yellow');
    }
  }

  pairs=[];
  for(let r=0;r<gridRows;r++){
    for(let c=0;c<gridCols;c+=2){
      const a=grid[r][c], b=(c+1<gridCols)?grid[r][c+1]:null;
      if(a && b) pairs.push([a,b]); else if(a) pairs.push([a]);
    }
  }
}

function precomputeMetrics(){
  eyeMetrics.clear?.();
  for(let i=0;i<eyes.length;i++){
    const eye=eyes[i], p=pupils[i]; if(!eye||!p) continue;
    const rEye=eye.getBoundingClientRect(), rP=p.getBoundingClientRect();
    const rangeX = Math.max(0, (rEye.width  - rP.width )/2);
    const rangeY = Math.max(0, (rEye.height - rP.height)/2);
    eyeMetrics.set(eye, { rangeX, rangeY });
  }
}

function ensureMetrics(eye, pupil){
  let metrics = eyeMetrics.get(eye);
  if(metrics) return metrics;
  const rEye=eye.getBoundingClientRect(), rP=pupil.getBoundingClientRect();
  const rangeX = Math.max(0, (rEye.width  - rP.width )/2);
  const rangeY = Math.max(0, (rEye.height - rP.height)/2);
  metrics = { rangeX, rangeY };
  eyeMetrics.set(eye, metrics);
  return metrics;
}

function positionWhitePupilsTowardCenter(){
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  for(let i=0;i<eyes.length;i++){
    const eye = eyes[i], pupil = pupils[i];
    if(!eye || !pupil) continue;
    if(eye.classList.contains('yellow')) continue;

    const metrics = ensureMetrics(eye, pupil);

    const rect = eye.getBoundingClientRect();
    const eyeCenterX = rect.left + rect.width/2;
    const eyeCenterY = rect.top + rect.height/2;
    const dx = centerX - eyeCenterX;
    const dy = centerY - eyeCenterY;
    const nx = clamp(dx / (window.innerWidth/2 || 1), -1, 1);
    const ny = clamp(dy / (window.innerHeight/2 || 1), -1, 1);

    const targetX = nx * metrics.rangeX;
    const targetY = ny * metrics.rangeY;
    pupil.style.setProperty('--tx', `${targetX}px`);
    pupil.style.setProperty('--ty', `${targetY}px`);
  }
}

function placePupils(){
  const nx = useDevice ? devNX : mouseNX;
  const ny = useDevice ? devNY : mouseNY;
  for(let i=0;i<eyes.length;i++){
    const eye=eyes[i]; if(!eye.classList.contains('yellow')) continue;
    const p=pupils[i]; if(!p) continue;
    const m = ensureMetrics(eye, p);
    const depth = 0.96 + ((i%5)*0.02);
    const offsetX = clamp(((nx - 0.5) * 2) * m.rangeX * depth, -m.rangeX, m.rangeX);
    const offsetY = clamp(((ny - 0.5) * 2) * m.rangeY * depth, -m.rangeY, m.rangeY);
    p.style.setProperty('--tx', `${offsetX}px`);
    p.style.setProperty('--ty', `${offsetY}px`);
  }
}

function blinkPair(pair){
  for(const eye of pair){
    const lid = eye.querySelector('.lid');
    if(!lid) continue;
    lid.style.transition = 'height 90ms ease-in';
    lid.style.height = '100%';
  }
  const closeDur = 90 + Math.random()*40;
  setTimeout(()=>{
    for(const eye of pair){
      const lid = eye.querySelector('.lid');
      if(!lid) continue;
      lid.style.transition = 'height 120ms ease-out';
      lid.style.height = '0%';
    }
  }, closeDur);
}

function schedulePairBlinks(){
  pairs.forEach(pair=>{
    const start=500+Math.random()*2500;
    function loop(){
      const visible = pair.every(e=>e && e.classList.contains('revealed'));
      if(visible) blinkPair(pair);
      setTimeout(loop, 1500+Math.random()*4500);
    }
    setTimeout(loop, start);
  });
}

async function revealPairsProgressively(){
  for(let i=pairs.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pairs[i],pairs[j]]=[pairs[j],pairs[i]]; }
  let delay=70, accel=0.78, minDelay=4;
  for(const pair of pairs){
    for(const eye of pair){ eye.classList.add('revealed'); }
    blinkPair(pair);
    await sleep(delay);
    delay = Math.max(minDelay, delay*accel);
  }
}

async function boot(){
  const SAFETY = setTimeout(()=> loader.classList.add('hide'), 3000);
  try{
    await buildGridIncremental();
    applyMaskPairs();
    precomputeMetrics();
    positionWhitePupilsTowardCenter();

    await sleep(50);
    loader.classList.add('hide');

    await revealPairsProgressively();
    schedulePairBlinks();
  }catch(err){
    console.error('Boot error:', err);
  }finally{
    clearTimeout(SAFETY);
    loader.classList.add('hide');
  }
}

function tick(){ placePupils(); requestAnimationFrame(tick); }

addEventListener('orientationchange', ()=>location.reload());
addEventListener('resize',           ()=>location.reload());

window.addEventListener('load', ()=>{ boot(); tick(); });
