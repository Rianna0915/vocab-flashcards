// ====== 狀態與工具 ======
let cards=[];
let phase='forward';
let order='random';
let queue=[];
const seen={forward:new Set(), reverse:new Set()};
let dontSet=new Set();
let current=null;
let phaseBaseSize=0;
let poolIndices=[];
let history=[];
let future=[];
let inputBaseName='未命名';
const dlCounts={};

const els={
  fileInput:document.getElementById('fileInput'),
  fileName:document.getElementById('fileName'),
  err:document.getElementById('err'),
  loadBtn:document.getElementById('loadBtn'),
  saveDontKnowsBtn:document.getElementById('saveDontKnowsBtn'),
  word:document.getElementById('word'),pos:document.getElementById('pos'),
  three:document.getElementById('three'),meanings:document.getElementById('meanings'),
  front:document.getElementById('front'),back:document.getElementById('back'),frontHint:document.getElementById('frontHint'),
  speakBtn:document.getElementById('speakBtn'),showBtn:document.getElementById('showBtn'),
  dontBtn:document.getElementById('dontBtn'),nextBtn:document.getElementById('nextBtn'),backBtn:document.getElementById('backBtn'),
  roundEnd:document.getElementById('roundEnd'),dontList:document.getElementById('dontList'),nextRoundBtn:document.getElementById('nextRoundBtn'),
  autoTts:document.getElementById('autotts'),
  progress:document.getElementById('progress'),leftCount:document.getElementById('leftCount'),dkCount:document.getElementById('dkCount'),
  phaseForwardBtn:document.getElementById('phaseForwardBtn'),phaseReverseBtn:document.getElementById('phaseReverseBtn')
};

function speak(t){try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='en-US';u.rate=0.95;u.pitch=1.0;speechSynthesis.speak(u);}catch(e){}}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// DOM-safe meanings list
function renderMeaningsList(target, meanings){
  const ul = document.createElement('ul');
  for(const [p,m] of Object.entries(meanings||{})){
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = p + '.';
    li.appendChild(strong);
    li.append(' ' + String(m));
    ul.appendChild(li);
  }
  target.appendChild(ul);
}
function normalize(d){
  return d.map((x,i)=>({
    word:String(x.word||x.w||'').trim(),
    pos:Array.isArray(x.pos)?x.pos:(x.pos?[x.pos]:[]),
    pron:x.pron||'',
    meanings:x.meanings||x.m||{},
    threeForms:Array.isArray(x.threeForms)?x.threeForms:(Array.isArray(x.forms)?x.forms:null),
    _idx:i
  })).filter(x=>x.word);
}
function buildPhaseQueue(idxs){return order==='random'?shuffle([...idxs]):[...idxs];}
function basenameNoExt(name){ if(!name) return '未命名'; const i=name.lastIndexOf('.'); return i>0?name.slice(0,i):name; }
function uniqueName(basename, ext){ const key=basename+ext; if(!dlCounts[key]){ dlCounts[key]=1; return basename+ext; } dlCounts[key]++; return `${basename}(${dlCounts[key]})${ext}`; }
function downloadFile(preferName, content, mime){
  const dot = preferName.lastIndexOf('.');
  const base = dot>0 ? preferName.slice(0,dot) : preferName;
  const ext  = dot>0 ? preferName.slice(dot) : '';
  const finalName = uniqueName(base, ext);
  const blob=new Blob([content],{type:mime});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=finalName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
}
function timeStamp(){const d=new Date();const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${d.getHours().toString().padStart(2,'0')}${d.getMinutes().toString().padStart(2,'0')}${d.getSeconds().toString().padStart(2,'0')}`;}

// ====== Render ======
function renderForward(i){
  const c=cards[i];
  els.word.textContent=c.word;
  els.pos.textContent=c.pos.length?`詞性：${c.pos.join(', ')}`:'';
  els.frontHint.style.display='none';
  els.three.innerHTML='';
  if (c.threeForms) {
    const strong = document.createElement('strong'); strong.textContent='動詞三態：';
    els.three.appendChild(strong);
    els.three.append(' ' + c.threeForms.join(' → '));
  }
  els.meanings.innerHTML='';
  renderMeaningsList(els.meanings, c.meanings);
  els.back.style.display='none';
  els.front.style.display='block';
  if(els.autoTts.checked)speak(c.word);
}
function renderReverse(i){
  const c=cards[i];
  els.word.textContent='請說出英文單字';
  els.pos.textContent=c.pos.length?`提示（詞性）：${c.pos.join(', ')}`:'';
  els.frontHint.style.display='block';
  els.frontHint.innerHTML='';
  const h3 = document.createElement('h3'); h3.textContent='中文提示'; els.frontHint.appendChild(h3);
  renderMeaningsList(els.frontHint, c.meanings);
  els.back.style.display='none';
  els.front.style.display='block';
}
function renderCard(i){ if(phase==='forward') renderForward(i); else renderReverse(i); }
function showBack(){
  const c=cards[current];
  els.back.style.display='block';
  if(phase==='reverse'){
    els.three.innerHTML='';
    if (c.threeForms) {
      const strong = document.createElement('strong'); strong.textContent='動詞三態：';
      els.three.appendChild(strong);
      els.three.append(' ' + c.threeForms.join(' → '));
    }
    els.meanings.innerHTML='';
    const div = document.createElement('div');
    const strong2 = document.createElement('strong'); strong2.textContent = c.word;
    div.append('英文：'); div.appendChild(strong2);
    els.meanings.appendChild(div);
    if(els.autoTts.checked)speak(c.word);
  }
}
function updateStats(){
  const s = phase==='forward' ? seen.forward : seen.reverse;
  els.progress.textContent = `${s.size} / ${phaseBaseSize}`;
  const remainingUnique = Math.max(0, (Array.isArray(poolIndices) ? poolIndices.length : 0) - s.size);
  els.leftCount.textContent = remainingUnique;
  els.dkCount.textContent = dontSet.size;
}

// ====== 流程控制 ======
function pickNext(){
  if(future.length>0){
    if(current!=null) history.push(current);
    current = future.pop();
    renderCard(current); updateStats(); return;
  }
  if(queue.length===0){ endRound(); return; }
  if(current!=null) history.push(current);
  current=queue.shift();
  const s = phase==='forward'? seen.forward : seen.reverse;
  if(!s.has(current)) s.add(current);
  renderCard(current); updateStats();
}
function markDontKnow(){ if(current==null) return; dontSet.add(current); pickNext(); }
function next(){ pickNext(); }
function goBack(){ if(history.length===0) return; if(current!=null) future.push(current); current = history.pop(); renderCard(current); updateStats(); }
function endRound(){
  els.roundEnd.style.display='block';
  els.dontList.innerHTML='';
  Array.from(dontSet).forEach(i=>{ const li=document.createElement('li'); li.textContent=cards[i].word; els.dontList.appendChild(li); });
  els.saveDontKnowsBtn.disabled=dontSet.size===0;
}
function startNextRound(){
  poolIndices=[...dontSet]; phase='forward';
  seen.forward.clear(); seen.reverse.clear(); dontSet.clear(); history=[]; future=[];
  queue=buildPhaseQueue(poolIndices);
  phaseBaseSize=queue.length; current=null; els.roundEnd.style.display='none';
  els.phaseForwardBtn.classList.add('active'); els.phaseReverseBtn.classList.remove('active');
  pickNext();
}

// ====== 載入 / 匯出 ======
async function saveDontKnows(){
  const idxs = Array.from(dontSet); if(!idxs.length) return;
  const list = idxs.map(i=>cards[i]);
  const base = (inputBaseName||'未命名').replace(/_output.*$/i,'');
  const stamp = timeStamp();
  const jsonName = `${base}_output_${stamp}.json`;
  const json = JSON.stringify(list, null, 2);
  downloadFile(jsonName, json, 'application/json;charset=utf-8');
}
async function loadData(){
  els.err.textContent = '';
  let data=null; let sourceName=null;
  if(els.fileInput.files[0]){
    const f=els.fileInput.files[0]; sourceName=f.name;
    try{
      let txt=await f.text();
      // strip BOM if present
      if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
      data=normalize(JSON.parse(txt));
    }catch(e){
      els.err.textContent = '讀檔或 JSON 格式錯誤：' + (e?.message || e);
      return;
    }
  } else {
    els.err.textContent = '請先選擇 JSON 檔';
    return;
  }
  if(!data || !data.length){ els.err.textContent = '檔案為空或沒有有效單字資料。'; return; }
  cards=data;
  inputBaseName = (basenameNoExt(sourceName)||'未命名').replace(/_output$/i,'');
  poolIndices=cards.map((_,i)=>i);
  phase='forward';
  seen.forward.clear(); seen.reverse.clear(); dontSet.clear(); history=[]; future=[];
  queue=buildPhaseQueue(poolIndices); phaseBaseSize=queue.length; current=null; els.roundEnd.style.display='none';
  els.phaseForwardBtn.classList.add('active'); els.phaseReverseBtn.classList.remove('active');
  pickNext();
}

// ====== 綁定事件 ======
els.fileInput.addEventListener('change', async ()=>{
  if(els.fileInput.files[0]) {
    els.fileName.textContent = '已選擇：' + els.fileInput.files[0].name;
    await loadData(); // 自動載入
  } else {
    els.fileName.textContent='';
  }
});
els.loadBtn.onclick=loadData;
els.showBtn.onclick=showBack;
els.speakBtn.onclick=()=>{if(current!=null)speak(cards[current].word);};
els.dontBtn.onclick=markDontKnow;
els.nextBtn.onclick=next;
els.backBtn.onclick=goBack;
els.nextRoundBtn.onclick=startNextRound;
els.saveDontKnowsBtn.onclick=saveDontKnows;
els.phaseForwardBtn.onclick=()=>{
  if(phase!=='forward'){
    phase='forward'; queue=buildPhaseQueue(poolIndices); phaseBaseSize=queue.length; current=null; history=[]; future=[];
    els.phaseForwardBtn.classList.add('active'); els.phaseReverseBtn.classList.remove('active'); pickNext();
  }
};
els.phaseReverseBtn.onclick=()=>{
  if(phase!=='reverse'){
    phase='reverse'; queue=buildPhaseQueue(poolIndices); phaseBaseSize=queue.length; current=null; history=[]; future=[];
    els.phaseReverseBtn.classList.add('active'); els.phaseForwardBtn.classList.remove('active'); pickNext();
  }
};

// 快捷鍵（N/n = 不會；不插回）
window.onkeydown = (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tag)) return;

  if (e.code === 'Space') { e.preventDefault(); showBack(); return; }

  if (e.key === 'Enter') {
    e.preventDefault();
    if (els.back.style.display === 'block') next();
    else showBack();
    return;
  }

  if (e.key === 'n' || e.key === 'N') { markDontKnow(); return; }

  if (e.key === 'ArrowRight') { next(); return; }
  if (e.key === 'ArrowLeft')  { goBack(); return; }
};