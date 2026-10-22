'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plug:'<path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0Zm6 9v4"/>',
  routes:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a3 3 0 0 1 0 6H8a4 4 0 0 0 0 8h9"/>',
  shuffle:'<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c1.2 0 2.5-.8 3.5-2m5-8C15.5 6.7 16.7 6 18 6h3m-4-4 4 4-4 4"/>',
  devices:'<rect x="2" y="4" width="14" height="11" rx="2"/><path d="M6 20h6m-3-5v5"/><rect x="16" y="10" width="6" height="11" rx="1.5"/>',
  activity:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--paper)"/><circle cx="15" cy="17" r="3" fill="var(--paper)"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  'arrow-up-right':'<path d="M6 18 18 6M6 6h12v12"/>',
  'arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'arrow-down':'<path d="M12 4v16m-6-6 6 6 6-6"/>',
  'arrow-up':'<path d="M12 20V4m-6 6 6-6 6 6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1 .6-1.7 1.2-1.7 2.7m0 3.5h.01"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  router:'<rect x="3" y="11" width="18" height="8" rx="2"/><path d="M6 11V4m12 7V4M6 15h.01M10 15h.01M14 15h4"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  server:'<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M13 6.5h4M13 17.5h4"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  edit:'<path d="m16 3 5 5-12 12-6 1 1-6Zm-2 2 5 5"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  phone:'<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M10 5h4m-2 14h.01"/>',
  laptop:'<rect x="4" y="4" width="16" height="12" rx="2"/><path d="m4 16-2 4h20l-2-4"/>',
  tv:'<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 22h8m-4-4v4"/>',
  speaker:'<rect x="6" y="2" width="12" height="20" rx="3"/><circle cx="12" cy="15" r="3"/><circle cx="12" cy="6" r="1"/>',
  game:'<path d="M7 7h10c2 0 3 1 3.5 3l1.5 7c.6 3-2 4-4 1l-2-2H8l-2 2c-2 3-4.6 2-4-1l1.5-7C4 8 5 7 7 7Z"/><path d="M6 11v4m-2-2h4m8-2h.01M18 14h.01"/>',
  wifi:'<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0m-4 4h.01"/>',
  cable:'<path d="M8 3v4m8-4v4M6 7h12v5l-3 3v6H9v-6l-3-3Z"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7m0-10h.01"/>',
  bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
  play:'<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3Z"/>',
  message:'<path d="m21 3-6 18-4-7-8-4Z"/><path d="m11 14 10-11"/>',
  bank:'<path d="m3 8 9-5 9 5M3 9h18M5 11v7m5-7v7m4-7v7m5-7v7M3 21h18"/>',
  ai:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 5V3H3v13h2"/>',
};
function icon(name, extra = '') { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${icons[name] || icons.globe}</svg>`; }
function hydrateIcons() { $$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon)); }
const tag = (text, type='') => `<span class="tag ${type}">${type ? '<span class="status-dot"></span>' : ''}${text}</span>`;
const button = (text, action, type='', ico='') => `<button class="button ${type}" data-action="${action}">${ico ? icon(ico) : ''}${text}</button>`;
const names = {overview:'Обзор',connections:'Подключения',rules:'Правила',automatic:'Автовыбор',devices:'Устройства',diagnostics:'Диагностика',system:'Система'};
let storedTheme = 'studio';
try { storedTheme = localStorage.getItem('linia-theme') || 'studio'; } catch {}
const state = {
  page:'overview', theme:storedTheme, scenario:'normal', connectionTab:'tunnels', deviceFilter:'all',
  connections:[
    {id:'primary',name:'Финляндия',location:'Хельсинки',protocol:'VLESS · REALITY',latency:38,role:'Основной',icon:'server'},
    {id:'reserve',name:'Нидерланды',location:'Амстердам',protocol:'Hysteria2',latency:62,role:'Резервный',icon:'server'},
    {id:'work',name:'Рабочий',location:'Корпоративная сеть',protocol:'WireGuard',latency:24,role:'Для работы',icon:'lock'},
  ],
  rules:[
    {name:'Рабочий ноутбук',description:'Все адреса с MacBook Pro',device:'MacBook Pro',route:'work',failure:'block'},
    {name:'YouTube',description:'Видео и связанные домены',device:'Все устройства',route:'auto',failure:'block'},
    {name:'Telegram',description:'Сообщения и звонки',device:'Все устройства',route:'auto',failure:'block'},
    {name:'AI-сервисы',description:'ChatGPT, Claude и связанные домены',device:'Все устройства',route:'auto',failure:'block'},
    {name:'Банки и Госуслуги',description:'Сервисы с прямым доступом',device:'Все устройства',route:'direct',failure:'direct'},
    {name:'Остальной интернет',description:'Правило по умолчанию',device:'Все устройства',route:'direct',failure:'direct'},
  ],
  priority:['primary','reserve'], mode:'priority', fullFailure:'block', interval:30, failCount:3, restore:true, restoreWait:120,
  applied:{priority:['primary','reserve'],mode:'priority',fullFailure:'block',interval:30,failCount:3,restore:true,restoreWait:120},
  checksDone:true, checking:false, dirty:false, pending:false, countdown:30, checkTime:'Только что', testFailed:false,
  dpiEnabled:true, events:[], ruleQuery:'', diagScope:'all',
};
const deviceData = [
  {name:'iPhone Александра',icon:'phone',address:'192.168.8.102',link:'Wi-Fi 5 ГГц',route:'auto'},
  {name:'MacBook Pro',icon:'laptop',address:'192.168.8.110',link:'Wi-Fi 5 ГГц',route:'work'},
  {name:'Телевизор в гостиной',icon:'tv',address:'192.168.8.115',link:'Ethernet',route:'auto'},
  {name:'PlayStation 5',icon:'game',address:'192.168.8.120',link:'Ethernet',route:'direct'},
  {name:'Яндекс Станция',icon:'speaker',address:'192.168.8.121',link:'Wi-Fi 2,4 ГГц',route:'direct'},
  {name:'iPad',icon:'phone',address:'192.168.8.125',link:'Wi-Fi 5 ГГц',route:'auto'},
];
let toastTimer, rollbackTimer, restoreFocus;
const routeNames = {auto:'Автовыбор',direct:'Напрямую',work:'Рабочий VPN',dpi:'Обход DPI'};
const now = () => new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
function toast(text) { $('#toast').textContent=text; $('#toast').classList.add('visible'); clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3600); }
function logEvent(text,type='info') {state.events.unshift({time:now(),text,type});}
function setTheme(theme) {
  if(!['studio','night','signal'].includes(theme)) theme='studio';
  state.theme=theme;document.documentElement.dataset.theme=theme;
  $$('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.themeChoice===theme));
  try {localStorage.setItem('linia-theme',theme);}catch{}
}
function routeStatus() {
  if(state.scenario==='offline')return {title:'Нет связи с провайдером',name:'Недоступен',detail:'Проверяем интернет',badge:'Нет интернета',type:'danger',message:'Автовыбор приостановлен: сначала нужен интернет-канал.',icon:'close',available:false};
  if(state.scenario==='all-down')return {title:'Нужен другой маршрут',name:state.applied.fullFailure==='block'?'Трафик остановлен':'Прямой выход',detail:'Оба сервера недоступны',badge:'Резервы исчерпаны',type:'warning',message:state.applied.fullFailure==='block'?'Трафик с правилом «Автовыбор» остановлен. Прямые правила продолжают работать.':'Для правил «Автовыбор» включён разрешённый прямой выход. VPN-защиты нет.',icon:'info',available:false};
  if(state.scenario==='fallback')return {title:'Резерв держит связь.',name:'Нидерланды',detail:'Hysteria2 · 62 мс',badge:'Работает резерв',type:'warning',message:'Финляндия не прошла 3 проверки. Подключён резервный сервер.',icon:'shuffle',available:true};
  if(state.scenario==='recovering')return {title:'Основной снова доступен.',name:'Нидерланды',detail:'Резерв · 62 мс',badge:'Проверяем стабильность',type:'warning',message:'Финляндия отвечает. Возврат после 2 минут стабильной работы.',icon:'clock',available:true};
  const chosen=state.connections.find(c=>c.id===state.applied.priority[0]) || state.connections[0];
  return {title:'Всё идёт по плану.',name:chosen.name,detail:`${chosen.protocol} · ${chosen.latency} мс`,badge:'Всё работает',type:'good',message:`${state.applied.mode==='fastest'?'Выбран быстрый доступный маршрут':'Основной маршрут доступен'}. Резерв проверен и готов.`,icon:'check',available:true};
}
function heading(title,description,actions='') {return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;}
function scenarioControl() {return `<label class="scenario-select"><span>Сценарий макета</span><select id="scenario" aria-label="Сценарий макета">
${[['normal','Всё работает'],['fallback','Основной недоступен'],['recovering','Основной восстановился'],['all-down','Все серверы недоступны'],['offline','Нет интернета']].map(([id,t])=>`<option value="${id}" ${state.scenario===id?'selected':''}>${t}</option>`).join('')}</select></label>`;}
function overview() {
  const s=routeStatus();
  const services=[['YouTube','play','Видео и трансляции','auto'],['Telegram','message','Сообщения и звонки','auto'],['AI-сервисы','ai','ChatGPT, Claude','auto'],['Банки и Госуслуги','bank','Прямое подключение','direct']];
  return `${heading('Ваша сеть — на виду.','Подключения, устройства и маршруты. Всё в одном месте.',button(state.checking?'Проверяем…':'Проверить связь','quick-check','',state.checking?'clock':'activity'))}
  ${pendingBanner()}
  <section class="network-plate" aria-label="Текущий маршрут">
    <div class="network-head"><div><h2>${s.title}</h2><p>${state.scenario==='offline'?'Локальная панель остаётся доступной.':'6 устройств в сети. Каждому — свой путь.'}</p></div>${tag(s.badge,s.type)}</div>
    <div class="network-flow">
      <div class="flow-node"><div class="flow-symbol">${icon('devices')}</div><strong>Ваши устройства</strong><span class="node-detail">Телефон, ноутбук, ТВ</span></div>
      <div class="flow-connector live"></div>
      <div class="flow-node router"><div class="flow-symbol">${icon('router')}</div><strong>Flint 2</strong><span class="node-detail">Правила + DNS</span></div>
      <div class="flow-connector ${s.available?'live':'blocked'}"></div>
      <div class="flow-node route"><div class="flow-symbol">${icon(s.available?'shield':'info')}</div><strong>${s.name}</strong><span class="node-detail">${s.detail}</span><div class="reserve-line">${icon('shuffle')}${state.scenario==='normal'?'Нидерланды · резерв':state.scenario==='recovering'?'Финляндия · проверка':state.scenario==='fallback'?'Финляндия · недоступна':'Ожидаем восстановления'}</div></div>
      <div class="flow-connector ${s.available?'live':'blocked'}"></div>
      <div class="flow-node"><div class="flow-symbol">${icon('globe')}</div><strong>Нужные сервисы</strong><span class="node-detail">По вашим правилам</span></div>
    </div>
    <div class="route-line-bottom"><div class="route-explanation">${icon(s.icon)}<span>${s.message}</span></div>${scenarioControl()}</div>
  </section>
  <div class="overview-columns">
    <section><div class="section-title"><h2>У каждого сервиса свой путь</h2><a class="text-button" href="#rules">Все правила ${icon('arrow-right')}</a></div>
      <div class="service-list">${services.map(([name,ic,detail,route])=>{
        const stopped=state.scenario==='offline'||(route==='auto'&&state.scenario==='all-down'&&state.applied.fullFailure==='block');
        const actual=state.rules.find(r=>r.name===name)?.route||route;
        return `<div class="service-row" role="button" tabindex="0" data-action="service-rule" data-name="${name}" aria-label="Настроить правило ${name}"><span class="service-logo">${icon(ic)}</span><div><strong>${name}</strong><small>${detail}</small></div><span class="service-route">${stopped?'Ожидает связи':routeNames[actual]}<small>${stopped?'Трафик остановлен':actual==='direct'?'Без туннеля':s.name}</small></span>${icon('chevron')}</div>`;
      }).join('')}</div><p class="note">Правила сервисов работают по спискам доменов и сетей. Списки можно уточнять.</p>
    </section>
    <section><div class="section-title"><h2>Что происходит</h2><a class="text-button" href="#diagnostics">Журнал ${icon('arrow-right')}</a></div>
      <div class="timeline">${timelineRows()}</div>
    </section>
  </div>
  <div class="traffic-strip" aria-label="Демонстрационные показатели сети">
    <div class="traffic-item"><div class="mini-graph" aria-hidden="true">${[14,23,19,32,24,27,20,14,22,29,17,25].map(h=>`<i style="height:${h}px"></i>`).join('')}</div><div><strong>${state.scenario==='offline'?'0':'24,8'} <small>Мбит/с</small></strong><small>Текущий трафик · пример</small></div></div>
    <div class="traffic-item">${icon('activity')}<div><strong>${s.available?(state.scenario==='normal'?'38':'62'):'—'} <small>мс</small></strong><small>Задержка маршрута</small></div></div>
    <div class="traffic-item">${icon('devices')}<div><strong>6 устройств</strong><small>4 Wi-Fi · 2 Ethernet</small></div></div>
    <div class="traffic-item">${icon('shield')}<div><strong>DNS согласован</strong><small>Следует правилам маршрутов</small></div></div>
  </div>`;
}
function timelineRows(){
  const items=state.events.slice(0,2);
  if(!items.length)items.push({time:'14:32',text:'Основной маршрут прошёл проверку',detail:'Финляндия · доступ к тестовым ресурсам есть.',type:'good'});
  items.push({time:'14:30',text:'Резерв готов к переключению',detail:'Нидерланды · последняя проверка успешна.',type:'good'},{time:'14:18',text:'Телевизор подключился к сети',detail:'Правила применены автоматически.',type:'neutral'});
  return items.slice(0,3).map(e=>`<div class="timeline-row"><time>${e.time}</time><span class="timeline-marker ${e.type==='warning'?'warning':e.type==='neutral'?'neutral':''}"></span><div><strong>${escapeHtml(e.text)}</strong><p>${e.detail||'Демонстрационное событие в макете.'}</p></div></div>`).join('');
}
function connections(){
  return `${heading('Ваши подключения','Добавьте серверы. Проверьте связь. Назначьте основной и резервный.',button('Добавить','add-connection','primary','plus'))}
    <div class="subtabs" role="tablist" aria-label="Тип подключения"><button role="tab" data-connection-tab="tunnels" aria-selected="${state.connectionTab==='tunnels'}" class="${state.connectionTab==='tunnels'?'active':''}">Туннели <span class="muted">${state.connections.length}</span></button><button role="tab" data-connection-tab="dpi" aria-selected="${state.connectionTab==='dpi'}" class="${state.connectionTab==='dpi'?'active':''}">Оптимизация доставки</button></div>
    ${state.connectionTab==='tunnels'?`<section class="sheet" aria-label="Туннели">${state.connections.map(c=>{
      const fail=state.scenario==='offline'||state.scenario==='all-down'||c.id==='primary'&&state.scenario==='fallback';
      return `<div class="connection-row"><div class="connection-icon">${icon(c.icon)}</div><div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.protocol)} · ${escapeHtml(c.location)}</p></div><div class="connection-measure"><strong>${fail?'—':c.latency+' мс'}</strong><small>${fail?'Нет ответа':'Последняя проверка'}</small></div><div class="connection-status">${tag(fail?'Недоступен':c.role,c.role==='Основной'&&!fail?'good':fail?'danger':'')}</div><div class="connection-actions"><button class="icon-button" data-action="test-connection" data-id="${c.id}" aria-label="Проверить ${escapeHtml(c.name)}">${icon('activity')}</button><button class="icon-button" data-action="edit-connection" data-id="${c.id}" aria-label="Настроить ${escapeHtml(c.name)}">${icon('edit')}</button></div></div>`;
    }).join('')}</section>
    <div class="callout">${icon('shuffle')}<div><strong>Хороший резерв отличается от основного.</strong><p>Другой сервер, провайдер или протокол помогают пережить разные виды отказа. Порядок и условия переключения задаются в <a class="external-link" href="#automatic">автовыборе</a>.</p></div></div>
    <p class="note">В макете показаны примеры подключений. Ссылки и ключи никуда не отправляются.</p>`:`
    <section class="sheet"><div class="sheet-header"><div><h2>Оптимизация доставки</h2><p>Прямое соединение с дополнительной обработкой пакетов.</p></div><label class="switch"><input type="checkbox" id="dpi-enabled" ${state.dpiEnabled?'checked':''} aria-label="Включить оптимизацию доставки в макете"><span class="switch-track"></span></label></div>
      <div class="sheet-body"><div class="form-row"><div><span class="field-label">Движок</span><p>Отдельный компонент с собственными проверками.</p></div>${tag('zapret2')}</div><div class="form-row"><div><label for="dpi-profile">Стратегия</label><p>Нужна проверка на конкретном провайдере.</p></div><select id="dpi-profile"><option>Проверенный профиль</option><option>Свой профиль</option></select></div><div class="form-row"><div><span class="field-label">Применение</span><p>Только для правил с выбранным способом «Оптимизация доставки».</p></div>${tag(state.dpiEnabled?'Готов к проверке':'Выключен',state.dpiEnabled?'good':'')}</div>
      <div class="save-bar"><p>Профиль показан как пример. Эффективность не измерялась.</p>${button('Проверить профиль','test-dpi','','activity')}</div></div></section>
      <div class="callout neutral">${icon('info')}<div><strong>Оптимизация доставки не меняет страну выхода и не создаёт VPN-туннель.</strong><p>Если нужный адрес полностью недоступен по IP, понадобится другой маршрут. Такой резерв можно назначить в правилах.</p></div></div>`}`;
}
function rules(){
  const filtered=state.rules.map((r,i)=>({...r,index:i})).filter(r=>(r.name+' '+r.description).toLowerCase().includes(state.ruleQuery.toLowerCase()));
  return `${heading('Куда идёт трафик','Правила читаются сверху вниз. Применяется первое совпадение.',button('Добавить правило','add-rule','primary','plus'))}
    <section class="sheet"><div class="sheet-header rule-toolbar"><h2>${state.rules.length} правил</h2><label class="search-box">${icon('search')}<input id="rule-search" aria-label="Найти правило" placeholder="Найти сервис или устройство" value="${escapeHtml(state.ruleQuery)}"></label></div>
    <div id="rule-list">${filtered.length?filtered.map(r=>`<div class="rule-row"><span class="order-number">${String(r.index+1).padStart(2,'0')}</span><div><h3>${escapeHtml(r.name)}</h3><p>${escapeHtml(r.description)}</p></div><span class="rule-device">${escapeHtml(r.device)}</span><div class="rule-route">${icon(r.route==='direct'?'globe':r.route==='work'?'lock':r.route==='dpi'?'bolt':'shuffle')}<span>${routeNames[r.route]}<small class="muted" style="display:block;font-size:9px">${r.failure==='block'?'При отказе: остановить':'Прямой выход разрешён'}</small></span></div><button class="icon-button" data-action="edit-rule" data-index="${r.index}" aria-label="Изменить правило ${escapeHtml(r.name)}">${icon('edit')}</button></div>`).join(''):`<div class="empty-state">${icon('search')}<h2>Такого правила пока нет</h2><p>Попробуйте другое название или добавьте собственное правило.</p>${button('Сбросить поиск','clear-search')}</div>`}</div></section>
    <div class="callout neutral">${icon('info')}<div><strong>Можно проверить правило до применения.</strong><p>Введите домен и выберите устройство — интерфейс объяснит, какой маршрут будет выбран. В этом макете проверка работает на примерах.</p><button class="text-button" style="margin-top:8px" data-action="simulate-rule">Проверить маршрут ${icon('arrow-right')}</button></div></div>`;
}
function automatic(){
  return `${heading('Автовыбор, которому можно доверять','Задайте логику один раз. Причина каждого переключения будет видна.')}
  ${pendingBanner()}
  <div class="two-col">
    <section class="sheet"><div class="sheet-header"><div><h2>Как выбирать маршрут</h2><p>Для сервисов и устройств с правилом «Автовыбор».</p></div>${icon('shuffle')}</div>
    <div class="sheet-body"><label class="radio-tile"><input type="radio" name="route-mode" value="priority" ${state.mode==='priority'?'checked':''}><div><strong>Основной + резерв</strong><p>Использовать основной, пока он работает. Рекомендуется для дома.</p></div></label>
    <label class="radio-tile"><input type="radio" name="route-mode" value="fastest" ${state.mode==='fastest'?'checked':''}><div><strong>Лучший из доступных</strong><p>Выбирать маршрут с меньшей задержкой, без частых переключений.</p></div></label>
    <div style="margin-top:25px"><div class="section-title"><h2>Порядок подключений</h2><span class="muted">Без петель</span></div>
    ${state.priority.map((id,i)=>{const c=state.connections.find(c=>c.id===id);return `<div class="priority-node"><span class="priority-number">${i+1}</span><div class="connection-icon">${icon('server')}</div><div class="priority-copy"><strong>${escapeHtml(c.name)}</strong><small>${i===0?'Основной':'Резервный'} · ${escapeHtml(c.protocol)}</small></div><div class="priority-actions"><button class="icon-button" data-action="move-priority" data-index="${i}" data-direction="-1" ${i===0?'disabled':''} aria-label="Поднять ${escapeHtml(c.name)}">${icon('arrow-up')}</button><button class="icon-button" data-action="move-priority" data-index="${i}" data-direction="1" ${i===state.priority.length-1?'disabled':''} aria-label="Опустить ${escapeHtml(c.name)}">${icon('arrow-down')}</button></div></div>`;}).join('')}
    <p class="strategy-explainer">Это <strong>альтернативные пути</strong>. Трафик проходит через один выбранный сервер, а не через всю цепочку.</p></div></div></section>
    <section class="sheet"><div class="sheet-header"><div><h2>Когда переключаться</h2><p>Проверяем доступ, а не только ответ сервера.</p></div>${icon('activity')}</div><div class="sheet-body" style="padding-top:3px">
      <div class="form-row"><div><label for="check-interval">Проверять каждые</label><p>Запросы идут через проверяемый маршрут.</p></div><span class="unit-input"><input id="check-interval" type="number" min="10" max="300" step="5" value="${state.interval}">сек.</span></div>
      <div class="form-row"><div><label for="fail-count">Считать отказом</label><p>Одиночный сбой не вызывает переключение.</p></div><select id="fail-count">${[2,3,4,5].map(n=>`<option value="${n}" ${state.failCount===n?'selected':''}>${n} неудачи подряд</option>`).join('')}</select></div>
      <div class="form-row"><div><span class="field-label">Возвращаться на основной</span><p>После устойчивого восстановления.</p></div><label class="switch"><input type="checkbox" id="restore-main" ${state.restore?'checked':''} aria-label="Возвращаться на основной"><span class="switch-track"></span></label></div>
      <div class="form-row"><div><label for="restore-wait">Убедиться в стабильности</label><p>В это время продолжает работать резерв.</p></div><select id="restore-wait" ${!state.restore?'disabled':''}>${[[60,'1 минута'],[120,'2 минуты'],[300,'5 минут']].map(([n,t])=>`<option value="${n}" ${state.restoreWait===n?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="form-row"><div><span class="field-label">Что проверяем</span><p>DNS + HTTPS через туннель. Для звонков — отдельная UDP-проверка.</p></div><button class="text-button" data-action="probe-details">Подробнее</button></div>
    </div></section>
  </div>
  <section class="sheet"><div class="sheet-header"><div><h2>Если не работает ни один маршрут</h2><p>Выбор касается только трафика с правилом «Автовыбор».</p></div>${icon('shield')}</div><div class="sheet-body two-col" style="margin:0">
    <label class="radio-tile" style="margin:0"><input type="radio" name="full-failure" value="block" ${state.fullFailure==='block'?'checked':''}><div><strong>Остановить этот трафик</strong><p>Не выходить напрямую без вашего разрешения. Остальные правила продолжат работать.</p></div></label>
    <label class="radio-tile" style="margin:0"><input type="radio" name="full-failure" value="direct" ${state.fullFailure==='direct'?'checked':''}><div><strong>Разрешить прямой выход</strong><p>Туннеля не будет. Некоторые сервисы могут остаться недоступны.</p></div></label>
  </div></section>
  <div class="save-bar"><p id="save-status">${state.dirty?'Есть неприменённые изменения.':'Все настройки применены в макете.'} Смена сервера может прервать текущие соединения.</p>${button('Применить настройки','apply-automatic','primary','check')}</div>`;
}
function devices(){
  const list=deviceData.filter(d=>state.deviceFilter==='all'||state.deviceFilter===d.route);
  return `${heading('Устройства дома','Один роутер. Разные правила для работы, отдыха и всего остального.')}
  <div class="subtabs" role="tablist" aria-label="Фильтр устройств">${[['all','Все устройства'],['auto','Автовыбор'],['work','Рабочий VPN'],['direct','Напрямую']].map(([id,t])=>`<button role="tab" aria-selected="${state.deviceFilter===id}" data-device-filter="${id}" class="${state.deviceFilter===id?'active':''}">${t}</button>`).join('')}</div>
  <div class="device-grid">${list.map(d=>`<article class="device-card"><div class="device-card-head">${icon(d.icon)}${tag('В сети','good')}</div><h3>${escapeHtml(d.name)}</h3><p>${d.address}</p><div class="device-card-foot"><span>${d.link}</span><button class="text-button" data-action="device-rule" data-name="${escapeHtml(d.name)}">${routeNames[d.route]} ${icon('chevron')}</button></div></article>`).join('')}</div>
  <div class="callout neutral" style="margin-top:24px">${icon('devices')}<div><strong>Новые устройства получают общие правила.</strong><p>Для отдельного устройства можно выбрать другой маршрут. Локальные устройства — принтеры, NAS и сама панель — остаются доступны.</p></div></div>`;
}
function diagnostics(){
  const offline=state.scenario==='offline', failed=offline||state.scenario==='all-down'||state.testFailed, running=state.checking;
  return `${heading('Понятно, что происходит','Проверка по шагам — от провайдера до нужного сервиса.',button('Скачать отчёт','export-report','','download'))}
  <section class="sheet"><div class="sheet-header"><div><h2>Проверка подключения</h2><p>Последняя: ${state.checkTime} · демонстрационные результаты</p></div>${button(running?'Проверяем…':'Запустить','run-diagnostics','primary small',running?'clock':'activity')}</div>
  <div class="sheet-body"><div class="diag-steps">${[['Интернет',offline?'Нет ответа':'Канал доступен'],['DNS',offline?'Ожидает интернет':'Адреса получены'],['Туннель',failed?'Нет доступа':'Соединение есть'],['Сервисы',failed?'Нужна проверка':'HTTPS + UDP']].map(([t,d],i)=>`<div class="diag-step ${running?'pending':(offline||failed&&i>1)?'failed':''}"><span class="diag-circle">${icon(running?'clock':(offline||failed&&i>1)?'close':'check')}</span><strong>${t}</strong><small>${running?'Проверяем…':d}</small></div>`).join('')}</div></div>
  <div class="diagnostic-result ${failed?'error':''}"><div><h3>${running?'Проверяем выбранный сценарий…':offline?'Сначала восстановите интернет-канал':failed?'Проверка нашла недоступный маршрут':'Проверки пройдены'}</h3><p>${running?'Это имитация проверки, сетевые запросы не выполняются.':offline?'Автовыбор не поможет, пока нет связи с провайдером.':failed?'Посмотрите подключения и выберите доступный резерв.':'Тестовые ресурсы доступны через выбранный маршрут.'}</p></div>${failed?'<a class="text-button" href="#connections">К подключениям '+icon('arrow-right')+'</a>':tag('Пример результата','good')}</div></section>
  <section class="sheet"><div class="sheet-header"><div><h2>Журнал решений</h2><p>Что изменилось и почему.</p></div>${scenarioControl()}</div><div class="sheet-body" style="padding-top:6px;padding-bottom:6px">
  ${[...state.events,{time:'14:32',text:'Финляндия: DNS и HTTPS-проверки успешны. Основной маршрут сохранён.',type:'good'},{time:'14:30',text:'Нидерланды: резерв проверен. Задержка в примере — 62 мс.',type:'good'},{time:'14:18',text:'Телевизор в гостиной: применены общие правила сервисов.',type:'info'},{time:'14:05',text:'Конфигурация проверена. Конфликтов правил в этом примере не найдено.',type:'info'}].slice(0,8).map(e=>`<div class="event-row"><time>${e.time}</time>${tag(e.type==='warning'?'Маршрут':e.type==='good'?'Проверка':'Система',e.type==='warning'?'warning':'')}<p>${escapeHtml(e.text)}</p></div>`).join('')}
  </div></section>`;
}
function system(){
  return `${heading('Роутер и компоненты','Понятная совместимость. Контролируемые изменения.')}
  <section class="sheet"><div class="hardware-overview"><div class="hardware-name">${icon('router')}<div><h2>Flint 2</h2><p>GL.iNet GL-MT6000 · MediaTek Filogic 830</p></div></div>${tag('Целевая платформа','good')}</div><div class="specs"><div><strong>4 × 2,0 ГГц</strong><small>Процессор Cortex-A53</small></div><div><strong>1 ГБ DDR4</strong><small>Оперативная память</small></div><div><strong>8 ГБ eMMC</strong><small>Физический накопитель</small></div></div></section>
  <div class="two-col"><section class="sheet"><div class="sheet-header"><div><h2>OpenWrt 25.12.6</h2><p>Официальный стабильный релиз · 18 октября 2026</p></div>${icon('check')}</div><div class="sheet-body">
    <div class="compat-row"><span>Образ для Flint 2</span><span>${tag('Опубликован','good')}</span></div><div class="compat-row"><span>Платформа</span><span>mediatek / filogic</span></div><div class="compat-row"><span>Менеджер пакетов</span><span>APK</span></div><div class="compat-row"><span>Установленная прошивка</span><span>Не определялась<small>Макет не подключён к роутеру</small></span></div>
    <p class="note">Штатная GL.iNet и официальный OpenWrt — разные варианты прошивки. Перед установкой нужны определение версии и проверка совместимости.</p><a class="external-link" href="https://github.com/openwrt/openwrt/releases/tag/v25.12.6" target="_blank" rel="noopener">Официальные изменения ${icon('arrow-up-right','style="display:inline;width:11px;height:11px"')}</a></div></section>
    <section class="sheet"><div class="sheet-header"><div><h2>Сетевые компоненты</h2><p>Проектная схема, установка не выполнялась.</p></div>${icon('plug')}</div><div class="sheet-body" style="padding-top:6px">
    ${[['WireGuard / OpenVPN','Пакеты OpenWrt','good'],['Xray / sing-box','Нужна интеграция',''],['AmneziaWG','Проверка ABI ядра','warning'],['zapret2','Отдельный движок оптимизации','']].map(([t,s,c])=>`<div class="compat-row"><span>${t}</span><span>${tag(s,c)}</span></div>`).join('')}
    <p class="note">Поддержка протокола не гарантирует совместимость с любым VPN-провайдером. Возможности зависят от версии и сборки компонента.</p></div></section></div>
  <section class="sheet"><div class="sheet-header"><div><h2>Изменения под контролем</h2><p>Сначала проверка, затем применение с возможностью отката.</p></div>${icon('shield')}</div><div class="sheet-body"><div class="form-row"><div><span class="field-label">Резервная копия настроек</span><p>Выгрузить демонстрационные правила и параметры автовыбора.</p></div>${button('Экспортировать','export-config','small','download')}</div><div class="form-row"><div><span class="field-label">Вернуть исходный макет</span><p>Очистить только изменения внутри этой демонстрации.</p></div>${button('Сбросить макет','reset-demo','small','refresh')}</div></div></section>`;
}
function pendingBanner(){
  if(!state.pending)return '';
  return `<div class="pending-banner" role="status"><span><strong>Проверьте, что всё работает.</strong> Без подтверждения изменения отменятся через <span id="rollback-count">${state.countdown}</span> сек.</span><div style="display:flex;gap:8px">${button('Откатить','rollback','small')}${button('Всё работает','confirm-apply','primary small')}</div></div>`;
}
const renderers={overview,connections,rules,automatic,devices,diagnostics,system};
function render(preserveScroll=false){
  const pos=window.scrollY;
  $('#main').innerHTML=`<div class="page-enter">${renderers[state.page]()}</div>`;
  $('#breadcrumb-current').textContent=names[state.page];
  $$('[data-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.nav===state.page);if(a.dataset.nav===state.page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('.nav-count').textContent=state.connections.length;
  document.title=`${names[state.page]} · Линия`;
  if(preserveScroll)window.scrollTo(0,pos);
}
function navigate(){
  const page=location.hash.slice(1);
  state.page=names[page]?page:'overview';
  closeMenu();render();window.scrollTo(0,0);
}
function closeMenu(){$('#sidebar').classList.remove('open');$('#nav-backdrop').hidden=true;$('#menu-toggle').setAttribute('aria-expanded','false');}
function openDialog(title,body){
  restoreFocus=document.activeElement;
  $('#dialog').innerHTML=`<div class="dialog-header"><h2 id="dialog-title">${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="Закрыть">${icon('close')}</button></div><div class="dialog-body">${body}</div>`;
  if(!$('#dialog').open)$('#dialog').showModal();
}
function closeDialog(){$('#dialog').close();if(restoreFocus?.isConnected)restoreFocus.focus();}
function addConnection(){
  openDialog('Добавить подключение',`<p>Вставьте ссылку или попробуйте демонстрационный пример. Все действия происходят только в макете.</p>
  <form id="connection-form"><div class="field"><label for="connection-name">Название</label><input id="connection-name" required maxlength="40" placeholder="Например, Финляндия"></div><div class="field"><label for="connection-url">Ссылка подключения</label><textarea id="connection-url" placeholder="vless://… или hysteria2://…" spellcheck="false" required></textarea><small>Ссылка не отправляется в сеть и не сохраняется в хранилище браузера.</small></div>
  <button class="text-button" type="button" data-action="fill-example">Заполнить пример ${icon('arrow-right')}</button><p class="field-error" id="connection-error" role="alert" hidden></p><div class="dialog-footer"><button type="button" class="button" data-action="close-dialog">Отмена</button><button class="button primary" type="submit">Добавить в макет</button></div></form>`);
}
function editRule(index=-1,seed={}){
  const rule=state.rules[index]||{name:'',description:'Своё правило',device:'Все устройства',route:'auto',failure:'block',...seed};
  openDialog(index>=0?'Изменить правило':'Новое правило',`<p>Выберите, куда направлять этот трафик и что делать, если маршрут недоступен.</p>
  <form id="rule-form" data-index="${index}"><div class="field"><label for="rule-name">Название правила</label><input id="rule-name" value="${escapeHtml(rule.name)}" maxlength="60" required placeholder="Например, видеосервисы"></div>
  <div class="field"><label for="rule-device">Для какого устройства</label><select id="rule-device">${['Все устройства',...deviceData.map(d=>d.name)].map(n=>`<option ${n===rule.device?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select></div>
  <div class="field"><label for="rule-route">Способ подключения</label><select id="rule-route">${Object.entries(routeNames).map(([k,v])=>`<option value="${k}" ${rule.route===k?'selected':''}>${v}</option>`).join('')}</select></div>
  <div class="field"><label for="rule-failure">Если маршрут недоступен</label><select id="rule-failure"><option value="block" ${rule.failure==='block'?'selected':''}>Остановить этот трафик</option><option value="direct" ${rule.failure==='direct'?'selected':''}>Разрешить прямой выход</option></select></div>
  <div class="change-preview" id="rule-preview">${rulePreview(rule.route,rule.failure)}</div>
  <div class="dialog-footer"><button type="button" class="button" data-action="close-dialog">Отмена</button><button type="submit" class="button primary">Сохранить правило</button></div></form>`);
}
function rulePreview(route,failure){
  return `<strong>${routeNames[route]}</strong><p>${route==='direct'?'Трафик идёт через провайдера без VPN-туннеля.':route==='dpi'?'Пакеты идут напрямую с обработкой DPI. VPN-туннель не создаётся.':route==='work'?'Трафик направляется в рабочий туннель.':'Система выбирает один из доступных серверов.'}</p>${route!=='direct'?`<p class="muted">${failure==='block'?'При отказе трафик остановится.':'При отказе разрешён выход напрямую без туннеля.'}</p>`:''}`;
}
function applyAutomatic(){
  if(state.interval<10||state.interval>300||!Number.isFinite(state.interval)){toast('Интервал проверки должен быть от 10 до 300 секунд.');$('#check-interval')?.focus();return;}
  openDialog('Применить настройки?',`<p>Проверка в макете не нашла конфликтов. После применения будет 30 секунд, чтобы подтвердить работу или отменить изменения.</p>
  <div class="change-preview"><p>Способ выбора: <strong>${state.mode==='priority'?'Основной + резерв':'Лучший из доступных'}</strong></p><p>Первый сервер: <strong>${state.connections.find(c=>c.id===state.priority[0]).name}</strong></p><p>Проверка каждые <strong>${state.interval} секунд</strong></p><p>Полный отказ: <strong>${state.fullFailure==='block'?'остановить трафик':'разрешить прямой выход'}</strong></p></div>
  <p>Смена сервера может прервать текущие соединения. Изменения затронут только демонстрацию.</p><div class="dialog-footer">${button('Отмена','close-dialog')}${button('Применить в макете','commit-automatic','primary')}</div>`);
}
function commitAutomatic(){
  clearInterval(rollbackTimer);
  state.previousApplied=structuredClone(state.applied);
  state.applied={priority:[...state.priority],mode:state.mode,fullFailure:state.fullFailure,interval:state.interval,failCount:state.failCount,restore:state.restore,restoreWait:state.restoreWait};
  state.pending=true;state.countdown=30;state.dirty=false;closeDialog();render(true);
  rollbackTimer=setInterval(()=>{
    state.countdown--;
    const count=$('#rollback-count');if(count)count.textContent=state.countdown;
    if(state.countdown<=0)rollback();
  },1000);
}
function rollback(){
  clearInterval(rollbackTimer);
  if(!state.pending)return;
  Object.assign(state,structuredClone(state.previousApplied));
  state.applied=structuredClone(state.previousApplied);state.pending=false;state.dirty=false;render(true);
  logEvent('Изменения отменены. Возвращена предыдущая рабочая конфигурация.','warning');toast('Предыдущие настройки восстановлены в макете.');
}
function setScenario(scenario){
  state.scenario=scenario;
  const texts={normal:'Основной маршрут восстановлен. Трафик вернулся на выбранный сервер.',fallback:'Три проверки основного не прошли. Выбран резервный маршрут.',recovering:'Основной снова отвечает. Ожидаем устойчивого восстановления.', 'all-down':'Все серверы недоступны. Применено правило полного отказа.',offline:'Нет связи с провайдером. Проверки серверов приостановлены.'};
  logEvent(texts[scenario],scenario==='normal'?'good':'warning');state.testFailed=false;render(true);
}
function dirty(){state.dirty=true;const el=$('#save-status');if(el)el.textContent='Есть неприменённые изменения. Смена сервера может прервать текущие соединения.';}
function runCheck(kind='all'){
  if(state.checking)return;
  state.checking=true;render(true);
  setTimeout(()=>{
    state.checking=false;state.checkTime=now();logEvent('Демонстрационная проверка завершена: '+(state.scenario==='offline'?'нет интернет-канала.':state.scenario==='all-down'?'серверы недоступны.':'активный маршрут доступен.'),state.scenario==='normal'?'good':'warning');
    render(true);toast('Демонстрационная проверка завершена. Реальная сеть не проверялась.');
  },1100);
}
function downloadJson(name,data){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}
const actions={
  'quick-check':()=>runCheck(),'run-diagnostics':()=>runCheck(),'close-dialog':closeDialog,'add-connection':addConnection,
  'fill-example':()=>{$('#connection-name').value='Швеция';$('#connection-url').value='vless://demo@stockholm.example:443?security=reality#Demo';},
  'test-connection':el=>{const c=state.connections.find(c=>c.id===el.dataset.id);toast(`${c.name}: демонстрационная проверка, ${state.scenario==='offline'||state.scenario==='all-down'?'нет ответа':c.latency+' мс'}.`);},
  'edit-connection':el=>{const c=state.connections.find(c=>c.id===el.dataset.id);openDialog('Параметры подключения',`<p>Пример сохранённого подключения. Секретные поля скрыты.</p><div class="change-preview"><p><strong>${escapeHtml(c.name)}</strong></p><p>${escapeHtml(c.protocol)} · ${escapeHtml(c.location)}</p><p>Роль: ${escapeHtml(c.role)}</p><p>Адрес: <span class="muted">${c.id}.example</span></p></div><div class="dialog-footer">${button('Закрыть','close-dialog')}<a class="button primary" href="#automatic" data-action="close-on-nav">Настроить автовыбор</a></div>`);},
  'close-on-nav':closeDialog,'test-dpi':()=>toast('Пример: профиль прошёл HTTPS-проверку. На реальном провайдере тест не выполнялся.'),
  'add-rule':()=>editRule(),'edit-rule':el=>editRule(Number(el.dataset.index)),
  'service-rule':el=>{const i=state.rules.findIndex(r=>r.name===el.dataset.name);editRule(i);},
  'device-rule':el=>{const d=deviceData.find(d=>d.name===el.dataset.name);const i=state.rules.findIndex(r=>r.device===d.name);editRule(i,{name:d.name,description:'Все адреса устройства',device:d.name,route:d.route});},
  'clear-search':()=>{state.ruleQuery='';render(true);},
  'move-priority':el=>{const i=Number(el.dataset.index),j=i+Number(el.dataset.direction);if(j<0||j>=state.priority.length)return;[state.priority[i],state.priority[j]]=[state.priority[j],state.priority[i]];dirty();render(true);},
  'apply-automatic':applyAutomatic,'commit-automatic':commitAutomatic,'rollback':rollback,
  'confirm-apply':()=>{clearInterval(rollbackTimer);state.pending=false;state.previousApplied=null;logEvent('Новые параметры автовыбора подтверждены в макете.','good');render(true);toast('Настройки сохранены в текущем макете.');},
  'probe-details':()=>openDialog('Что значит «маршрут работает»',`<p>Каждый уровень проверяется отдельно. Успешный ping ещё не гарантирует работу сервиса.</p><div class="change-preview"><p><strong>1. Интернет</strong> — есть связь с провайдером.</p><p><strong>2. DNS</strong> — получен адрес через нужный маршрут.</p><p><strong>3. HTTPS</strong> — тестовые ресурсы отвечают через туннель.</p><p><strong>4. UDP</strong> — отдельная проверка для звонков и других UDP-сценариев.</p></div><p>В реальном продукте нужны несколько контрольных ресурсов и защита от ложных срабатываний. В макете проверки имитируются.</p><div class="dialog-footer">${button('Понятно','close-dialog','primary')}</div>`),
  'simulate-rule':()=>openDialog('Проверить маршрут',`<p>Демонстрация объяснения правил. Попробуйте youtube.com, telegram.org, chatgpt.com или gosuslugi.ru.</p><form id="simulate-form"><div class="field"><label for="simulate-domain">Домен</label><input id="simulate-domain" value="youtube.com" required></div><div class="field"><label for="simulate-device">Устройство</label><select id="simulate-device">${deviceData.map(d=>`<option>${d.name}</option>`).join('')}</select></div><div id="simulate-result" aria-live="polite"></div><div class="dialog-footer"><button class="button primary" type="submit">Показать маршрут</button></div></form>`),
  'export-config':()=>downloadJson('linia-demo-config.json',{demo:true,notice:'Демонстрационные настройки. Не конфигурация OpenWrt.',rules:state.rules,automatic:state.applied}),
  'export-report':()=>downloadJson('linia-demo-diagnostics.json',{demo:true,notice:'Реальная сеть не проверялась. Все данные синтетические.',scenario:state.scenario,target:'GL-MT6000',events:state.events,automatic:state.applied}),
  'reset-demo':()=>openDialog('Сбросить макет?',`<p>Изменённые подключения и правила вернутся к исходным демонстрационным данным. Настоящий роутер это не затронет.</p><div class="dialog-footer">${button('Отмена','close-dialog')}${button('Сбросить','confirm-reset','primary')}</div>`),
  'confirm-reset':()=>{clearInterval(rollbackTimer);location.reload();},
};
document.addEventListener('click',e=>{
  const theme=e.target.closest('[data-theme-choice]');if(theme){setTheme(theme.dataset.themeChoice);return;}
  const act=e.target.closest('[data-action]');if(act&&actions[act.dataset.action]){actions[act.dataset.action](act);return;}
  const tab=e.target.closest('[data-connection-tab]');if(tab){state.connectionTab=tab.dataset.connectionTab;render(true);return;}
  const filter=e.target.closest('[data-device-filter]');if(filter){state.deviceFilter=filter.dataset.deviceFilter;render(true);}
});
document.addEventListener('keydown',e=>{
  if(e.target.matches('[role="button"]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();}
});
document.addEventListener('input',e=>{
  if(e.target.id==='check-interval'){state.interval=Number(e.target.value);dirty();}
  if(e.target.id==='rule-search'){
    const pos=e.target.selectionStart;state.ruleQuery=e.target.value;render(true);const input=$('#rule-search');input.focus();input.setSelectionRange(pos,pos);
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='scenario')setScenario(t.value);
  if(t.id==='dpi-enabled'){state.dpiEnabled=t.checked;render(true);toast(t.checked?'Обход DPI включён в макете.':'Обход DPI выключен в макете.');}
  if(t.name==='route-mode'){state.mode=t.value;dirty();}
  if(t.name==='full-failure'){state.fullFailure=t.value;dirty();}
  if(t.id==='fail-count'){state.failCount=Number(t.value);dirty();}
  if(t.id==='restore-main'){state.restore=t.checked;$('#restore-wait').disabled=!t.checked;dirty();}
  if(t.id==='restore-wait'){state.restoreWait=Number(t.value);dirty();}
  if(t.id==='rule-route'||t.id==='rule-failure')$('#rule-preview').innerHTML=rulePreview($('#rule-route').value,$('#rule-failure').value);
});
document.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='connection-form'){
    const name=$('#connection-name').value.trim(),raw=$('#connection-url').value.trim();
    if(!name||!/^(vless|vmess|trojan|ss|hysteria2|hy2|tuic|wireguard):\/\/\S+$/i.test(raw)){
      $('#connection-error').hidden=false;$('#connection-error').textContent='Проверьте название и формат ссылки. Для демонстрации можно заполнить пример.';$('#connection-url').setAttribute('aria-invalid','true');return;
    }
    const protocol=raw.split(':')[0].toUpperCase();
    state.connections.push({id:'demo-'+Date.now(),name,protocol,location:'Демонстрационный сервер',latency:45,role:'Добавлен',icon:'server'});
    $('#connection-url').value='';closeDialog();render(true);toast('Подключение добавлено в макет. Ссылка не сохранена.');
  }
  if(e.target.id==='rule-form'){
    const i=Number(e.target.dataset.index),name=$('#rule-name').value.trim();
    if(!name){$('#rule-name').focus();return;}
    const route=$('#rule-route').value,device=$('#rule-device').value;
    const rule={name,description:i>=0?state.rules[i].description:'Своё правило · демонстрация',device,route,failure:route==='direct'?'direct':$('#rule-failure').value};
    if(i>=0)state.rules[i]=rule;else state.rules.splice(Math.max(0,state.rules.length-1),0,rule);
    const d=deviceData.find(d=>d.name===device);if(d)d.route=route;
    closeDialog();render(true);logEvent(`Правило «${name}»: ${routeNames[route]}.`);toast('Правило сохранено в макете.');
  }
  if(e.target.id==='simulate-form'){
    const domain=$('#simulate-domain').value.trim().toLowerCase().replace(/^https?:\/\//,'').split('/')[0],device=$('#simulate-device').value;
    const matches=(host)=>domain===host||domain.endsWith('.'+host);
    let rule=state.rules.find(r=>r.device===device);
    if(!rule){const name=matches('youtube.com')?'YouTube':matches('telegram.org')||matches('t.me')?'Telegram':matches('chatgpt.com')||matches('claude.ai')?'AI-сервисы':matches('gosuslugi.ru')?'Банки и Госуслуги':'Остальной интернет';rule=state.rules.find(r=>r.name===name)||state.rules[state.rules.length-1];}
    $('#simulate-result').innerHTML=`<div class="change-preview"><strong>${escapeHtml(domain)}</strong><p>Совпало правило: ${escapeHtml(rule.name)}</p><p>Маршрут: <strong>${routeNames[rule.route]}</strong></p><p class="note">Результат на демонстрационном наборе доменов.</p></div>`;
  }
});
$('#menu-toggle').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('open');$('#nav-backdrop').hidden=!open;$('#menu-toggle').setAttribute('aria-expanded',String(open));});
$('#nav-backdrop').addEventListener('click',closeMenu);
$('#help-button').addEventListener('click',()=>openDialog('Это «Линия»',`<p>Интерактивный концепт локального сетевого менеджера для Flint 2. Рабочее название и три варианта оформления — для обсуждения.</p><div class="change-preview"><p><strong>Студия</strong> — светлый, спокойный домашний интерфейс.</p><p><strong>Ночь</strong> — тёмный сетевой пульт.</p><p><strong>Сигнал</strong> — контрастная навигация и крупные ориентиры.</p></div><p>Попробуйте сценарии отказа на обзоре, добавьте подключение, измените правило и примените настройки автовыбора. Данные синтетические, настоящая сеть не изменяется.</p><div class="dialog-footer"><a class="button" href="setup/index.html">Первый запуск</a>${button('Понятно','close-dialog','primary')}</div>`));
$('#profile-button').addEventListener('click',()=>openDialog('Мой дом',`<p>Панель доступна локально. В концепте нет обязательного облачного аккаунта.</p><div class="change-preview"><p>Устройство: <strong>Flint 2</strong></p><p>Рабочий язык: <strong>Русский</strong></p><p>Режим: <strong>Демонстрация интерфейса</strong></p></div><div class="dialog-footer">${button('Закрыть','close-dialog','primary')}</div>`));
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
window.addEventListener('hashchange',navigate);
hydrateIcons();setTheme(state.theme);navigate();
