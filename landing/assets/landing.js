document.documentElement.classList.add('js');
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
let paused=motionQuery.matches;
const motionButton=document.querySelector('.motion-toggle');
function setMotion(value){paused=value;document.documentElement.classList.toggle('motion-paused',value);motionButton.setAttribute('aria-pressed',String(value));document.getAnimations().forEach(animation => value ? animation.pause() : animation.play());motionButton.innerHTML=value?'<span aria-hidden="true">▷</span> 動きを再開':'<span aria-hidden="true">Ⅱ</span> 動きを止める';}
setMotion(paused);motionButton.addEventListener('click',()=>setMotion(!paused));motionQuery.addEventListener('change',e=>setMotion(e.matches));
const stars=document.querySelector('.starfield');
for(let i=0;i<32;i++){const star=document.createElement('i');star.className='star';const size=i%5===0?3:1.5;star.style.cssText=`left:${(i*61.7)%100}%;top:${(i*27.3)%88}%;width:${size}px;height:${size}px;--duration:${3+i%5}s;--delay:-${i%7}s`;stars.append(star);}
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
const header=document.querySelector('.site-header'),progress=document.querySelector('.reading-progress');let ticking=false;
function updateScroll(){header.classList.toggle('scrolled',scrollY>130);const max=document.documentElement.scrollHeight-innerHeight;progress.style.width=`${max>0?scrollY/max*100:0}%`;ticking=false;}
addEventListener('scroll',()=>{if(!ticking){requestAnimationFrame(updateScroll);ticking=true;}},{passive:true});updateScroll();
const menuButton=document.querySelector('.menu-toggle'),nav=document.querySelector('#navigation');
function closeMenu(){menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','メニューを開く');nav.classList.remove('open');}
menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')!=='true';menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');nav.classList.toggle('open',open);});nav.addEventListener('click',e=>{if(e.target.closest('a'))closeMenu();});addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();}});
const features={record:{number:'01',eyebrow:'DREAM JOURNAL',title:'消えてしまう前に、\n夢をひとつ。',description:'不思議な景色も、忘れたくない気持ちも。覚えているひとことから残せます。文字でも、声でも、ノートの写真でも。',tags:['テキスト・音声入力','写真の添付','あとから検索'],alt:'夢のメモ、音声入力、写真の取り込みを備えたユメタンの夢記録画面'},reflection:{number:'02',eyebrow:'DIARY & REFLECTION',title:'昨日の気持ちと、\n今朝の夢を。',description:'夢の振り返り画面で、前日の日記も一緒に。夢と日常を並べて、いま感じていることを見つめます。AIの振り返りは有料プランで利用できます。',tags:['前日の日記と比較','記録を振り返る','AIは有料プラン'],alt:'夢と前日の日記を並べて振り返るユメタンの画面'},sleep:{number:'03',eyebrow:'SLEEP & FEELINGS',title:'夢のない朝も、\nあなたの記録に。',description:'睡眠時間と、目覚めたときの気分を残す。直近7日間の記録から、最近の睡眠レベルを表示します。自己記録にもとづくアプリ独自の目安です。',tags:['睡眠時間','目覚めの気分','7日間の振り返り'],alt:'睡眠時間や目覚めの気分を記録するユメタンの睡眠画面'}};
const featureButtons=[...document.querySelectorAll('[data-feature]')];
function selectFeature(button){const key=button.dataset.feature,data=features[key];featureButtons.forEach(b=>{b.setAttribute('aria-selected',String(b===button));b.tabIndex=b===button?0:-1;});const panel=document.querySelector('#feature-panel');panel.setAttribute('aria-labelledby',button.id);panel.querySelector('.feature-number').textContent=data.number;document.querySelector('#feature-eyebrow').textContent=data.eyebrow;const title=document.querySelector('#feature-title');title.replaceChildren(...data.title.split('\n').flatMap((line,i)=>i?[document.createElement('br'),document.createTextNode(line)]:[document.createTextNode(line)]));document.querySelector('#feature-description').textContent=data.description;document.querySelector('#feature-tags').replaceChildren(...data.tags.map(t=>{const span=document.createElement('span');span.textContent=t;return span;}));const screen=document.querySelector('#feature-screen');screen.src=`/assets/screens/${key}.webp`;screen.alt=data.alt;if(!paused)panel.animate([{opacity:.3,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:350});}
featureButtons.forEach((button,index)=>{button.addEventListener('click',()=>selectFeature(button));button.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(index+1)%3;if(e.key==='ArrowLeft')next=(index+2)%3;if(e.key==='Home')next=0;if(e.key==='End')next=2;if(next!==undefined){e.preventDefault();featureButtons[next].focus();selectFeature(featureButtons[next]);}});});
const form=document.querySelector('#dream-form'),textarea=document.querySelector('#dream-text'),result=document.querySelector('.dream-result'),status=document.querySelector('#demo-status');
function updateCount(){document.querySelector('#character-count').textContent=String(textarea.value.length);textarea.setCustomValidity('');status.textContent='';}
textarea.addEventListener('input',updateCount);
document.querySelectorAll('[data-sample]').forEach(button=>button.addEventListener('click',()=>{form.hidden=false;result.hidden=true;textarea.value=button.dataset.sample;updateCount();textarea.focus({preventScroll:true});}));
form.addEventListener('submit',e=>{e.preventDefault();const value=textarea.value.trim();if(!value){textarea.setCustomValidity('夢のかけらを、ひとこと入力してください。');textarea.reportValidity();return;}document.querySelector('#saved-dream').textContent=value;const mood=form.querySelector('input[name=mood]:checked')?.value;const savedMood=document.querySelector('#saved-mood');savedMood.textContent=mood?'目覚めの気分：'+mood:'';savedMood.hidden=!mood;form.hidden=true;result.hidden=false;const reset=document.querySelector('#reset-demo');reset.focus({preventScroll:true});});
document.querySelector('#reset-demo').addEventListener('click',()=>{form.hidden=false;result.hidden=true;textarea.value='';form.reset();updateCount();textarea.focus({preventScroll:true});});
const typeNames=['追跡系','喪失系','拘束系','崩壊系','未来暗示系','直感警告系','象徴解釈系','デジャヴ系','明晰夢系','部分自覚系','観察者系','挑戦系','場所固定系','人物固定系','展開固定系','感情固定系'];
import {CHARACTERS as ANIMALS} from './characters/catalog.mjs';
import {CHARACTERS as HUMANS} from './dreamwalkers/catalog.mjs';
import {APP_STORE_URL} from './release-config.mjs';
let collection='human',group='all',selected=4;
const choices=[...document.querySelectorAll('.companion-choice')];
const collectionButtons=[...document.querySelectorAll('[data-collection]')];
const groupButtons=[...document.querySelectorAll('[data-group]')];
const getCompanions=()=>Object.values(collection==='human'?HUMANS:ANIMALS);
const getPath=()=>collection==='human'?'dreamwalkers':'characters';
const visibleIndices=()=>getCompanions().map((_,i)=>i).filter(i=>group==='all'||Math.floor(i/4)===Number(group));
function animateChange(element){if(!paused)element.animate([{opacity:.2,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'ease-out'});}
function showCompanion(index){
 selected=index;const c=getCompanions()[selected];const art=document.querySelector('#companion-image');
 art.src=`/assets/${getPath()}/${c.id}.webp`;art.alt=`${c.names[0]}：${c.titles[0]}`;
 document.querySelector('#companion-type').textContent=`${String(selected+1).padStart(2,'0')} / ${typeNames[selected]}`;
 document.querySelector('#companion-subtitle').textContent=c.titles[0];document.querySelector('#companion-name').textContent=c.names[0];
 document.querySelector('#companion-quote').textContent=`「${c.quotes[0]}」`;document.querySelector('#companion-story').textContent=c.stories[0];
 document.querySelector('#companion-position').textContent=`${String(selected+1).padStart(2,'0')} / 16`;
 document.querySelector('.companion-art-label').textContent=collection==='human'?'DREAMWALKERS / 夜を渡る16人':'MOONKEEPERS / 月あかりの仲間たち';
 choices.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));animateChange(document.querySelector('.companion-detail'));animateChange(art);
}
function refreshCollection(){
 const companions=getCompanions();choices.forEach((b,i)=>{const c=companions[i];b.setAttribute('aria-label',`${c.names[0]}：${c.titles[0]}`);const img=b.querySelector('img');img.src=`/assets/${getPath()}/${c.id}.webp`;});
 collectionButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.collection===collection)));showCompanion(selected);
}
choices.forEach((b,i)=>b.addEventListener('click',()=>showCompanion(i)));
collectionButtons.forEach(b=>b.addEventListener('click',()=>{collection=b.dataset.collection;refreshCollection();}));
groupButtons.forEach(b=>b.addEventListener('click',()=>{group=b.dataset.group;groupButtons.forEach(c=>c.setAttribute('aria-pressed',String(c===b)));const indices=visibleIndices();choices.forEach((c,i)=>c.hidden=!indices.includes(i));document.querySelector('.companion-picker').classList.toggle('filtered',group!=='all');if(!indices.includes(selected))showCompanion(indices[0]);}));
function moveCompanion(delta){const indices=visibleIndices();showCompanion(indices[(indices.indexOf(selected)+delta+indices.length)%indices.length]);}
document.querySelector('#previous-companion').addEventListener('click',()=>moveCompanion(-1));document.querySelector('#next-companion').addEventListener('click',()=>moveCompanion(1));refreshCollection();
// Static HTML links work without JavaScript; keep enhanced links on the same official URL.
document.querySelectorAll('[data-store-link]').forEach(link=>{link.href=APP_STORE_URL;});
// Keep installation within reach once the hero's main install button has scrolled away.
const dock=document.querySelector('.mobile-dock');
const heroInstall=document.querySelector('.hero-actions .install-button');
const finalInstall=document.querySelector('#download .install-button');
function updateInstallDock(){
 const heroRect=heroInstall.getBoundingClientRect(),finalRect=finalInstall.getBoundingClientRect();
 const finalVisible=finalRect.top<innerHeight&&finalRect.bottom>0;
 const visible=heroRect.bottom<0&&!finalVisible;
 dock.classList.toggle('is-visible',visible);dock.inert=!visible;
}
const dockObserver=new IntersectionObserver(updateInstallDock,{threshold:[0,1]});dockObserver.observe(heroInstall);dockObserver.observe(finalInstall);
addEventListener('resize',updateInstallDock,{passive:true});updateInstallDock();
// A small pointer response, with no motion on touch devices or when paused.
const hero=document.querySelector('.hero'),visual=document.querySelector('.hero-visual');
hero.addEventListener('pointermove',e=>{if(paused||!matchMedia('(pointer:fine)').matches)return;const rect=hero.getBoundingClientRect();visual.style.setProperty('--mx',`${(e.clientX/rect.width-.5)*10}px`);visual.style.setProperty('--my',`${((e.clientY-rect.top)/rect.height-.5)*8}px`);},{passive:true});
hero.addEventListener('pointerleave',()=>{visual.style.setProperty('--mx','0px');visual.style.setProperty('--my','0px');});
// Keep the collapsed menu keyboard-friendly when dismissed.
menuButton.addEventListener('keydown',e=>{if(e.key==='Escape')menuButton.focus();});
nav.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();menuButton.focus();}});
