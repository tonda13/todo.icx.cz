/* VERSION */
var APP_VERSION = '1.7.1';

/* STREAK */
var streakData = JSON.parse(localStorage.getItem('no1-streak') || '{"count":0,"lastDate":null}');
(function checkStreakValidity() {
  if (!streakData.count || !streakData.lastDate) return;
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  if (streakData.lastDate !== TODAY && streakData.lastDate !== yesterday) {
    streakData = { count: 0, lastDate: null };
    localStorage.setItem('no1-streak', JSON.stringify(streakData));
  }
})();
function updateStreak() {
  if (streakData.lastDate === TODAY) return;
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  streakData.count = (streakData.lastDate === yesterday) ? streakData.count + 1 : 1;
  streakData.lastDate = TODAY;
  localStorage.setItem('no1-streak', JSON.stringify(streakData));
}
function streakBadge() {
  if (streakData.count < 2) return '';
  return '<span class="streak-badge">' + streakData.count + '\u00d7</span>';
}

/* DATA */
var tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
var daily = JSON.parse(localStorage.getItem('daily') || 'null');
var filter = 'all', notifEnabled = false, deferredPrompt = null, isDragging = false;
var guideTop3 = [], guideNo1 = null, editingId = null;
var TODAY = new Date().toISOString().slice(0,10);

function isDailyFresh() { return daily && daily.date === TODAY; }
function save() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
  localStorage.setItem('tasks-modified', Date.now().toString());
  scheduleDriveSync();
}
function saveDaily() { localStorage.setItem('daily', JSON.stringify(daily)); }
function todayStr()  { return new Date().toLocaleDateString('cs-CZ', { weekday:'long', day:'numeric', month:'long' }); }

/* THEME */
var theme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
function applyTheme(t) {
  theme = t;
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('theme-icon').textContent = t === 'dark' ? '\u2600' : '\u263e';
  document.getElementById('theme-meta').setAttribute('content', t === 'dark' ? '#0f0f0f' : '#f5f3ef');
  localStorage.setItem('theme', t);
}
applyTheme(theme);

document.getElementById('menu-version').textContent = 'v' + APP_VERSION;
function openMenu() { document.getElementById('menu-modal').classList.add('open'); }
function closeMenu() { document.getElementById('menu-modal').classList.remove('open'); }
function reloadApp() {
  if (!navigator.onLine) {
    var btn = document.getElementById('reload-btn');
    var lbl = btn.querySelector('.menu-item-label');
    lbl.textContent = 'Bez připojení';
    setTimeout(function(){ lbl.textContent = 'Obnovit'; }, 2000);
    return;
  }
  closeMenu();
  (async function() {
    if ('serviceWorker' in navigator) {
      var regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(function(r){ return r.unregister(); }));
    }
    if ('caches' in window) {
      var keys = await caches.keys();
      await Promise.all(keys.map(function(k){ return caches.delete(k); }));
    }
    location.reload();
  })();
}
document.getElementById('menu-modal').addEventListener('click', function(e) { if (e.target === this) closeMenu(); });

/* PULL TO REFRESH */
(function() {
  var tl   = document.getElementById('task-list');
  var wrap = document.getElementById('ptr-wrap');
  var sp   = document.getElementById('ptr-spinner');
  var lb   = document.getElementById('ptr-label');
  var sy = 0, sx = 0, active = false, triggered = false, busy = false;
  var THRESH = 65;

  function hide() {
    wrap.classList.remove('visible');
    sp.classList.remove('spin');
    lb.textContent = 'Tah\u00e1ni dol\u016f pro aktualizaci';
  }
  function done(msg) {
    sp.classList.remove('spin');
    lb.textContent = msg;
    setTimeout(function() { hide(); busy = false; }, 1800);
  }

  var app = document.getElementById('app');

  app.addEventListener('touchstart', function(e) {
    if (busy || tl.scrollTop !== 0 || isDragging) return;
    sy = e.touches[0].clientY;
    sx = e.touches[0].clientX;
    active = false; triggered = false;
  }, { passive: true });

  app.addEventListener('touchmove', function(e) {
    if (busy) return;
    var dy = e.touches[0].clientY - sy;
    var dx = Math.abs(e.touches[0].clientX - sx);
    if (dx > dy) return;
    if (dy > 8 && tl.scrollTop === 0) {
      active = true;
      wrap.classList.add('visible');
      if (dy >= THRESH && !triggered) {
        triggered = true; sp.classList.add('spin');
        lb.textContent = 'Pus\u0165 pro aktualizaci';
      } else if (dy < THRESH && triggered) {
        triggered = false; sp.classList.remove('spin');
        lb.textContent = 'T\u00e1hni dol\u016f pro aktualizaci';
      }
    }
  }, { passive: true });

  app.addEventListener('touchend', function() {
    if (!active) return;
    active = false;
    if (!triggered) { hide(); return; }
    busy = true;
    lb.textContent = 'Aktualizuji\u2026';
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('CHECK_UPDATE');
    } else {
      done('\u2713 V\u0161e aktu\u00e1ln\u00ed');
    }
  }, { passive: true });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(e) {
      if (e.data === 'UPDATE_READY')    { done('\u21bb Na\u010d\u00edt\u00e1m novou verzi\u2026'); setTimeout(function() { location.reload(); }, 1000); }
      else if (e.data === 'UP_TO_DATE') done('\u2713 V\u0161e aktu\u00e1ln\u00ed');
      else if (e.data === 'OFFLINE')    done('\u26a0 Offline \u2013 bez p\u0159ipojen\u00ed');
    });
  }
})();

/* CONFETTI */
var canvas = document.getElementById('burst-canvas');
var ctx = canvas.getContext('2d');
var particles = [], animFrame = null;
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function makeParticle(x, y, level) {
  var C = level === 'no1'  ? ['#f5c542','#ffd700','#ffaa00','#fff3b0','#3dba78']
        : level === 'top3' ? ['#c8a96e','#3dba78','#a0d8b0','#e8d5b0']
                           : ['#3dba78','#a8e6c1','#c8a96e'];
  var a = Math.random() * Math.PI * 2;
  var sp = level === 'no1' ? 3.5 + Math.random()*5 : level === 'top3' ? 2.5 + Math.random()*3.5 : 1.5 + Math.random()*2.5;
  return { x:x, y:y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-(level==='no1'?3:1.5),
    r: level === 'no1' ? 3+Math.random()*4 : 2+Math.random()*3,
    color: C[Math.floor(Math.random()*C.length)], alpha: 1,
    decay: level==='no1' ? 0.016+Math.random()*0.01 : level==='top3' ? 0.022+Math.random()*0.012 : 0.03+Math.random()*0.015,
    shape: Math.random()>0.5 ? 'circle' : 'rect', rot: Math.random()*Math.PI*2, rotV: (Math.random()-0.5)*0.2, gravity: 0.12 };
}
function fireBurst(x, y, level) {
  var n = level==='no1' ? 80 : level==='top3' ? 40 : 18;
  for (var i=0; i<n; i++) particles.push(makeParticle(x, y, level));
  if (!animFrame) loopP();
  if (level === 'no1') {
    var f = document.getElementById('flash'); f.classList.add('show');
    setTimeout(function(){f.classList.remove('show');}, 300);
  }
}
function loopP() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter(function(p){return p.alpha > 0.01;});
  particles.forEach(function(p) {
    p.x+=p.vx; p.y+=p.vy; p.vy+=p.gravity; p.vx*=0.98; p.alpha-=p.decay; p.rot+=p.rotV;
    ctx.save(); ctx.globalAlpha=p.alpha; ctx.fillStyle=p.color;
    ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    if (p.shape==='rect') ctx.fillRect(-p.r, -p.r*0.5, p.r*2, p.r);
    else { ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  });
  animFrame = particles.length > 0 ? requestAnimationFrame(loopP) : null;
}
function addRipples(el, level) {
  var classes = level==='no1' ? ['ripple-no1-a','ripple-no1-b'] : level==='top3' ? ['ripple-top3-a','ripple-top3-b'] : ['ripple-normal'];
  classes.forEach(function(c) {
    var r = document.createElement('div'); r.className = 'ripple ' + c; el.appendChild(r);
    r.addEventListener('animationend', function(){ r.remove(); });
  });
}
function animateCompletion(el, id) {
  var dIds = isDailyFresh() && daily && daily.top3 ? daily.top3 : [];
  var level = (daily && daily.no1===id) ? 'no1' : dIds.indexOf(id)>=0 ? 'top3' : 'normal';
  el.classList.add('popping');
  el.addEventListener('animationend', function(){ el.classList.remove('popping'); }, {once:true});
  addRipples(el, level);
  var r = el.getBoundingClientRect();
  fireBurst(r.left+r.width/2, r.top+r.height/2, level);
}

/* HELPERS */
function formatDate(iso) {
  if (!iso) return null;
  var d = new Date(iso+'T00:00:00'), t = new Date(); t.setHours(0,0,0,0);
  var days = Math.round((d-t)/86400000);
  if (days===0)  return { label:'dnes', cls:'today' };
  if (days===1)  return { label:'z\u00edtra', cls:'' };
  if (days===-1) return { label:'v\u010dera', cls:'overdue' };
  if (days<0)    return { label:Math.abs(days)+'d po term.', cls:'overdue' };
  return { label:'za '+days+' dn\u00ed', cls:'' };
}
function priorityScore(t) {
  var s = {high:30, mid:20, low:10}[t.priority||'mid'];
  if (t.due) {
    var d = Math.round((new Date(t.due+'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000);
    if (d<=0) s+=15; else if (d<=1) s+=10; else if (d<=3) s+=5; else if (d<=7) s+=2;
  }
  return s;
}
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function q(s) { return s.replace(/'/g, "\\'"); }
function renderMarkdown(s) {
  var lines = escHtml(s).split('\n');
  var out = [];
  var inUl = false, inOl = false;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var ulM = l.match(/^(\s*)[-*]\s+(.*)$/);
    var olM = l.match(/^(\s*)\d+\.\s+(.*)$/);
    if (ulM) {
      if (!inUl) { if (inOl) { out.push('</ol>'); inOl=false; } out.push('<ul>'); inUl=true; }
      out.push('<li>' + inlineMarkdown(ulM[2]) + '</li>');
    } else if (olM) {
      if (!inOl) { if (inUl) { out.push('</ul>'); inUl=false; } out.push('<ol>'); inOl=true; }
      out.push('<li>' + inlineMarkdown(olM[2]) + '</li>');
    } else {
      if (inUl) { out.push('</ul>'); inUl=false; }
      if (inOl) { out.push('</ol>'); inOl=false; }
      if (l.trim() === '') { out.push('<br>'); } else { out.push('<span>' + inlineMarkdown(l) + '</span><br>'); }
    }
  }
  if (inUl) out.push('</ul>');
  if (inOl) out.push('</ol>');
  return out.join('');
}
function inlineMarkdown(s) {
  return s
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    .replace(/_([^_]+?)_/g, '<em>$1</em>');
}

var pL = {high:'vysok\u00e1', mid:'st\u0159edn\u00ed', low:'n\u00edzk\u00e1'};
var pC = {high:'p-high', mid:'p-mid', low:'p-low'};
var chkSvg  = '<svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><polyline points="2,6 5,9 10,3"/></svg>';
var trSvg   = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
var dragSvg = '<svg width="12" height="14" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2" r="1.3"/><circle cx="6" cy="2" r="1.3"/><circle cx="2" cy="7" r="1.3"/><circle cx="6" cy="7" r="1.3"/><circle cx="2" cy="12" r="1.3"/><circle cx="6" cy="12" r="1.3"/></svg>';

/* RENDER DAILY */
function renderDaily() {
  var el = document.getElementById('daily-section');
  if (!isDailyFresh() || !daily.top3 || !daily.top3.length) {
    var active = tasks.filter(function(t){ return !t.done; });
    if (active.length >= 2) {
      el.innerHTML = '<div class="daily-header">'
        + '<span class="daily-label"><span class="dot"></span>Dne\u0161n\u00ed focus' + streakBadge() + '</span>'
        + '<button class="guide-btn" onclick="openGuide()">Spustit pr\u016fvodce \u2192</button>'
        + '</div>'
        + '<div style="padding:8px 20px 4px;font-size:13px;color:var(--muted)">Je\u0161t\u011b nevybr\u00e1no pro dne\u0161ek</div>'
        + '<div class="section-divider"><span>V\u0161echny \u00FAkoly</span></div>';
    } else {
      el.innerHTML = '<div class="section-divider" style="margin-top:8px"><span>\u00DAkoly</span></div>';
    }
    return;
  }
  var n1 = tasks.find(function(t){ return t.id === daily.no1; });
  var t3 = daily.top3.map(function(id){ return tasks.find(function(t){ return t.id === id; }); }).filter(Boolean);
  var h = '<div class="daily-header">'
    + '<span class="daily-label"><span class="dot"></span>Dne\u0161n\u00ed focus' + streakBadge() + '</span>'
    + '<button class="guide-btn" onclick="openGuide()">Zm\u011bnit</button>'
    + '</div>';
  if (n1) {
    var dn = n1.done;
    h += '<div class="no1-card">'
      + '<span class="no1-badge">No. 1</span>'
      + '<span class="no1-text"' + (dn ? ' style="text-decoration:line-through;color:var(--muted)"' : '') + ' onclick="openEdit(\'' + n1.id + '\')">' + escHtml(n1.text) + '</span>'
      + '<button class="no1-check' + (dn ? ' done' : '') + '" id="no1-check-' + n1.id + '" onclick="toggleWithAnim(this,\'' + n1.id + '\')">' + chkSvg + '</button>'
      + '</div>';
  }
  var oth = t3.filter(function(t){ return t.id !== daily.no1; });
  if (oth.length) {
    h += oth.map(function(t, i) {
      return '<div class="top3-card' + (t.done ? ' done' : '') + '">'
        + '<span class="top3-num">' + (i+2) + '.</span>'
        + '<span class="top3-card-text" onclick="openEdit(\'' + t.id + '\')">' + escHtml(t.text) + '</span>'
        + '<button class="top3-check' + (t.done ? ' done' : '') + '" id="top3-check-' + t.id + '" onclick="toggleWithAnim(this,\'' + t.id + '\')">' + chkSvg + '</button>'
        + '</div>';
    }).join('');
  }
  h += '<div class="section-divider"><span>Ostatn\u00ed \u00FAkoly</span></div>';
  el.innerHTML = h;
}

/* RENDER TASKS */
function renderTasks() {
  var tl = document.getElementById('task-list');
  var dIds = isDailyFresh() && daily && daily.top3 ? daily.top3 : [];
  var vis = tasks.filter(function(t){ return filter==='active' ? !t.done : filter==='done' ? t.done : true; });
  if ((filter==='all'||filter==='active') && dIds.length) vis = vis.filter(function(t){ return dIds.indexOf(t.id) < 0; });
  document.getElementById('stats').textContent = tasks.filter(function(t){ return !t.done; }).length + ' zb\u00fdv\u00e1';
  if (!vis.length) {
    tl.innerHTML = '<div class="empty">'
      + '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'
      + '<span>' + (filter==='done' ? '\u017e\u00e1dn\u00e9 hotov\u00e9' : dIds.length ? 'v\u0161e ve focusu' : '\u017e\u00e1dn\u00e9 \u00FAkoly') + '</span>'
      + '</div>';
    return;
  }
  tl.innerHTML = vis.map(function(t) {
    var di = formatDate(t.due);
    var inTop = dIds.indexOf(t.id) >= 0;
    return '<div class="task-wrap" data-id="' + t.id + '">'
      + '<div class="swipe-bg">' + trSvg + '</div>'
      + '<div class="task' + (t.done ? ' done' : '') + '" id="task-row-' + t.id + '">'
        + '<button class="task-check" id="chk-' + t.id + '" onclick="toggleWithAnim(this,\'' + t.id + '\')">' + chkSvg + '</button>'
        + '<div class="task-body" onclick="openEdit(\'' + t.id + '\')">'
          + '<div class="task-text">' + escHtml(t.text) + '</div>'
          + (t.detail ? '<div class="task-detail">' + renderMarkdown(t.detail) + '</div>' : '')
          + '<div class="task-meta">'
            + (di ? '<span class="task-date ' + di.cls + '">' + di.label + '</span>' : '')
            + '<span class="priority-badge ' + pC[t.priority||'mid'] + '">' + pL[t.priority||'mid'] + '</span>'
          + '</div>'
        + '</div>'
        + (inTop ? '<div class="in-top3"></div>' : '')
        + '<div class="drag-handle">' + dragSvg + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
  initSwipe();
  initDrag();
}

function render() { renderDaily(); renderTasks(); }

/* SWIPE TO DELETE */
function initSwipe() {
  document.querySelectorAll('.task-wrap').forEach(function(wrap) {
    var row = wrap.querySelector('.task');
    var x0=0, y0=0, dx=0, live=false, axis=null;
    var TRIG = 80;
    row.addEventListener('touchstart', function(e) {
      x0=e.touches[0].clientX; y0=e.touches[0].clientY; dx=0; live=true; axis=null;
      row.style.transition = 'none';
    }, {passive:true});
    row.addEventListener('touchmove', function(e) {
      if (!live) return;
      var cx=e.touches[0].clientX, cy=e.touches[0].clientY;
      if (!axis) {
        var ax=Math.abs(cx-x0), ay=Math.abs(cy-y0);
        if (ax<5 && ay<5) return;
        axis = ax>ay ? 'h' : 'v';
      }
      if (axis==='v') { live=false; wrap.classList.remove('swiping'); row.style.transform=''; return; }
      dx = Math.min(0, cx-x0);
      if (dx < -5) wrap.classList.add('swiping');
      row.style.transform = 'translateX('+dx+'px)';
    }, {passive:true});
    row.addEventListener('touchend', function() {
      if (!live) return; live=false; axis=null;
      var id = wrap.dataset.id;
      if (dx <= -TRIG) {
        row.style.transition = 'transform 0.18s ease-in';
        row.style.transform = 'translateX(-110%)';
        row.addEventListener('transitionend', function(){ doDelete(id); }, {once:true});
      } else {
        wrap.classList.remove('swiping');
        row.style.transition = 'transform 0.25s cubic-bezier(0.34,1.2,0.64,1)';
        row.style.transform = '';
      }
    }, {passive:true});
  });
}

/* DRAG TO REORDER */
function initDrag() {
  var tl = document.getElementById('task-list');
  var st = null;

  function onMove(e) {
    if (!st) return;
    e.preventDefault();
    var y = e.touches[0].clientY;
    st.ghost.style.top = (y - st.fingerOffsetY) + 'px';
    var wraps = Array.from(tl.querySelectorAll('.task-wrap:not(.drag-source)'));
    var newIdx = wraps.length;
    for (var i = 0; i < wraps.length; i++) {
      var r = wraps[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { newIdx = i; break; }
    }
    if (newIdx !== st.dropIdx) {
      st.dropIdx = newIdx;
      if (newIdx < wraps.length) tl.insertBefore(st.marker, wraps[newIdx]);
      else tl.appendChild(st.marker);
    }
  }

  function onEnd() {
    if (!st) return;
    isDragging = false;
    // Reorder: rebuild vis list with drag item at new drop position
    var newVis = st.visIds.filter(function(id) { return id !== st.dragId; });
    newVis.splice(st.dropIdx, 0, st.dragId);
    // Map task objects
    var visMap = {};
    tasks.forEach(function(t) { if (st.visSet[t.id]) visMap[t.id] = t; });
    // Find positions of vis tasks in global tasks array and reassign
    var visPos = [];
    tasks.forEach(function(t, i) { if (st.visSet[t.id]) visPos.push(i); });
    var newTasks = tasks.slice();
    visPos.forEach(function(pos, i) { newTasks[pos] = visMap[newVis[i]]; });
    tasks = newTasks;
    // Cleanup
    st.ghost.remove();
    st.marker.remove();
    st.dragEl.classList.remove('drag-source');
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    st = null;
    save(); render();
  }

  document.querySelectorAll('.drag-handle').forEach(function(handle) {
    handle.addEventListener('touchstart', function(e) {
      e.stopPropagation();
      var wrap = handle.closest('.task-wrap');
      var visEls = Array.from(tl.querySelectorAll('.task-wrap'));
      var visIds = visEls.map(function(el) { return el.dataset.id; });
      var dragId = wrap.dataset.id;
      var fromIdx = visIds.indexOf(dragId);
      var rect = wrap.getBoundingClientRect();
      var touchY = e.touches[0].clientY;
      // Ghost
      var ghost = wrap.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.cssText = 'position:fixed;left:' + rect.left + 'px;width:' + rect.width + 'px;top:' + rect.top + 'px;margin:0;pointer-events:none;z-index:1000;';
      document.body.appendChild(ghost);
      wrap.classList.add('drag-source');
      // Drop marker
      var marker = document.createElement('div');
      marker.className = 'drag-drop-marker';
      if (wrap.nextSibling) tl.insertBefore(marker, wrap.nextSibling);
      else tl.appendChild(marker);
      // visSet for fast lookup
      var visSet = {};
      visIds.forEach(function(id) { visSet[id] = true; });
      isDragging = true;
      st = { dragId: dragId, dragEl: wrap, visIds: visIds, visSet: visSet,
             ghost: ghost, marker: marker, fingerOffsetY: touchY - rect.top, dropIdx: fromIdx };
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd, { passive: true });
    }, { passive: false });
  });
}

/* TOGGLE */
function toggleWithAnim(el, id) {
  var t = tasks.find(function(t){ return t.id===id; });
  if (!t) return;
  var completing = !t.done;
  t.done = completing; save();
  if (completing) {
    if (isDailyFresh() && daily && daily.no1 === id) updateStreak();
    var e = el || document.getElementById('chk-'+id) || document.getElementById('no1-check-'+id) || document.getElementById('top3-check-'+id);
    if (e) { e.classList.add('done'); animateCompletion(e, id); setTimeout(render, 420); }
    else render();
  } else render();
}

/* DELETE + UNDO */
var undoStack = null;   // { task, dailyTop3, dailyNo1 }
var undoTimer = null;

function doDelete(id) {
  // Save undo snapshot before removing
  var t = tasks.find(function(t){ return t.id===id; });
  if (!t) return;
  undoStack = {
    task: JSON.parse(JSON.stringify(t)),
    dailyTop3: daily && daily.top3 ? daily.top3.slice() : null,
    dailyNo1:  daily ? daily.no1 : null,
    index: tasks.indexOf(t),
  };

  tasks = tasks.filter(function(t){ return t.id!==id; });
  if (daily && daily.top3) {
    daily.top3 = daily.top3.filter(function(i){ return i!==id; });
    if (daily.no1===id) daily.no1 = null;
    saveDaily();
  }
  save(); render();
  showUndoToast();
}

function showUndoToast() {
  var toast = document.getElementById('undo-toast');
  var fill  = toast.querySelector('.undo-bar-fill');
  // Reset animation
  fill.style.animation = 'none';
  fill.offsetHeight; // reflow
  toast.classList.remove('show');
  toast.offsetHeight; // reflow
  toast.classList.add('show');
  fill.style.animation = '';
  // Clear previous timer
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(function() {
    hideUndoToast();
    undoStack = null;
  }, 5000);
}

function hideUndoToast() {
  document.getElementById('undo-toast').classList.remove('show');
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
}

function undoDelete() {
  if (!undoStack) return;
  hideUndoToast();
  var snap = undoStack;
  undoStack = null;
  // Re-insert at original position (or top if position changed)
  var idx = Math.min(snap.index, tasks.length);
  tasks.splice(idx, 0, snap.task);
  // Restore daily if it was there
  if (daily && snap.dailyTop3 && snap.dailyTop3.includes(snap.task.id)) {
    daily.top3 = snap.dailyTop3;
    daily.no1  = snap.dailyNo1;
    saveDaily();
  }
  save(); render();
}

/* EDIT SHEET */
function openEdit(id) {
  var t = tasks.find(function(t){ return t.id===id; });
  if (!t) return;
  editingId = id;
  var et = document.getElementById('edit-text');
  var ed = document.getElementById('edit-detail');
  et.setAttribute('readonly',''); ed.setAttribute('readonly','');
  et.value = t.text;
  ed.value = t.detail || '';
  document.getElementById('edit-due').value = t.due || '';
  document.getElementById('edit-priority').value = t.priority || 'mid';
  document.getElementById('edit-subtitle').textContent = new Date(t.created||Date.now()).toLocaleDateString('cs-CZ', {day:'numeric',month:'long',year:'numeric'});
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  document.getElementById('edit-modal').classList.add('open');
  setTimeout(function(){ et.removeAttribute('readonly'); ed.removeAttribute('readonly'); }, 350);
}
function closeEdit() { document.getElementById('edit-modal').classList.remove('open'); editingId=null; }
function saveEdit() {
  if (!editingId) return;
  var t = tasks.find(function(t){ return t.id===editingId; });
  if (!t) return;
  var tx = document.getElementById('edit-text').value.trim();
  if (!tx) return;
  t.text = tx;
  t.detail = document.getElementById('edit-detail').value.trim();
  t.due = document.getElementById('edit-due').value || null;
  t.priority = document.getElementById('edit-priority').value;
  save(); closeEdit(); render();
}
function deleteFromEdit() { if (!editingId) return; var id=editingId; closeEdit(); doDelete(id); }
document.getElementById('edit-modal').addEventListener('click', function(e){ if(e.target===document.getElementById('edit-modal')) closeEdit(); });
document.getElementById('edit-text').addEventListener('keydown', function(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); saveEdit(); } });

/* ADD TASK */
var input = document.getElementById('input');
var detIn = document.getElementById('detail-input');
var detTog = document.getElementById('detail-toggle');
var detVis = false;
detTog.addEventListener('click', function(){
  detVis = !detVis;
  detIn.classList.toggle('visible', detVis);
  detTog.textContent = detVis ? '\u2212 detail' : '+ detail';
  detTog.classList.toggle('open', detVis);
});
document.getElementById('add-btn').addEventListener('click', addTask);
input.addEventListener('keydown', function(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); addTask(); } });
input.addEventListener('input', function(){ input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,120)+'px'; });
function addTask() {
  var tx = input.value.trim(); if (!tx) return;
  var due = document.getElementById('due-date').value;
  var pri = document.getElementById('priority').value;
  var det = detIn.value.trim();
  tasks.unshift({id:Date.now().toString(), text:tx, detail:det||'', done:false, due:due||null, priority:pri, created:Date.now()});
  save(); render();
  input.value=''; input.style.height='auto'; detIn.value='';
  document.getElementById('due-date').value=''; document.getElementById('priority').value='mid';
  if (detVis) { detVis=false; detIn.classList.remove('visible'); detTog.textContent='+ detail'; }
}

/* TABS */
document.querySelectorAll('.tab').forEach(function(b){
  b.addEventListener('click', function(){
    document.querySelectorAll('.tab').forEach(function(x){ x.classList.remove('active'); });
    b.classList.add('active'); filter=b.dataset.filter; render();
  });
});
document.getElementById('clear-done').addEventListener('click', function(){ tasks=tasks.filter(function(t){return !t.done;}); save(); render(); });
document.getElementById('notif-btn').addEventListener('click', async function(){
  if (!('Notification' in window)) { alert('Notifikace nejsou podporov\u00e1ny.'); return; }
  if (Notification.permission==='granted') { notifEnabled=!notifEnabled; document.getElementById('notif-btn').classList.toggle('enabled',notifEnabled); return; }
  var p = await Notification.requestPermission();
  if (p==='granted') { notifEnabled=true; document.getElementById('notif-btn').classList.add('enabled'); }
});

/* GUIDE */
function openGuide() {
  guideTop3=[]; guideNo1=null;
  var ds = todayStr();
  document.getElementById('guide-date1').textContent = ds;
  document.getElementById('guide-date2').textContent = ds;
  var carryId = (!isDailyFresh() && daily && daily.no1) ? daily.no1 : null;
  var carryTask = carryId ? tasks.find(function(t){ return t.id===carryId && !t.done; }) : null;
  var cands = tasks.filter(function(t){ return !t.done; }).sort(function(a,b){ return priorityScore(b)-priorityScore(a); }).slice(0,10);
  if (carryTask && cands[0] && cands[0].id !== carryTask.id) {
    cands = [carryTask].concat(cands.filter(function(t){ return t.id !== carryTask.id; })).slice(0,10);
  }
  document.getElementById('guide-task-list').innerHTML = cands.map(function(t){
    var di = formatDate(t.due);
    var carry = carryTask && t.id === carryTask.id;
    return '<div class="guide-task' + (carry ? ' carry-over' : '') + '" data-id="' + t.id + '" onclick="toggleGuideSelect(\'' + t.id + '\')">'
      + '<span class="guide-task-num">' + (carry ? '\u21a9' : '#') + '</span>'
      + '<div><div class="guide-task-text">' + escHtml(t.text) + '</div>'
      + (carry ? '<div class="carry-label">v\u010dera ned. \u00b7 ' + pL[t.priority||'mid'] + (di ? ' \u00b7 '+di.label : '') + '</div>' : '<div class="guide-task-meta">' + pL[t.priority||'mid'] + (di ? ' \u00b7 '+di.label : '') + '</div>')
      + '</div></div>';
  }).join('');
  goStep1(); document.getElementById('guide-modal').classList.add('open');
}
function closeGuide() { document.getElementById('guide-modal').classList.remove('open'); }
function goStep1() { document.getElementById('step1').classList.add('active'); document.getElementById('step2').classList.remove('active'); updateSelCount(); }
function goStep2() {
  document.getElementById('step1').classList.remove('active'); document.getElementById('step2').classList.add('active');
  guideNo1=null; document.getElementById('step2-confirm').disabled=true;
  var sel = guideTop3.map(function(id){ return tasks.find(function(t){ return t.id===id; }); }).filter(Boolean);
  document.getElementById('guide-no1-list').innerHTML = sel.map(function(t){
    var di = formatDate(t.due);
    return '<div class="guide-task" data-id="' + t.id + '" onclick="selectNo1(\'' + t.id + '\')">'
      + '<span class="guide-task-num">\u2014</span>'
      + '<div><div class="guide-task-text">' + escHtml(t.text) + '</div>'
      + '<div class="guide-task-meta">' + pL[t.priority||'mid'] + (di ? ' \u00b7 '+di.label : '') + '</div></div></div>';
  }).join('');
}
function toggleGuideSelect(id) {
  var el = document.querySelector('#guide-task-list .guide-task[data-id="'+id+'"]');
  if (guideTop3.indexOf(id)>=0) { guideTop3=guideTop3.filter(function(i){return i!==id;}); el.classList.remove('selected'); }
  else { if(guideTop3.length>=3) return; guideTop3.push(id); el.classList.add('selected'); }
  updateSelCount();
}
function updateSelCount() { document.getElementById('sel-count').textContent=guideTop3.length; document.getElementById('step1-next').disabled=guideTop3.length<2; }
function selectNo1(id) {
  document.querySelectorAll('#guide-no1-list .guide-task').forEach(function(el){ el.classList.remove('selected-no1'); el.querySelector('.guide-task-num').textContent='\u2014'; });
  var el = document.querySelector('#guide-no1-list .guide-task[data-id="'+id+'"]');
  el.classList.add('selected-no1'); el.querySelector('.guide-task-num').textContent='1.';
  guideNo1=id; document.getElementById('step2-confirm').disabled=false;
}
function confirmGuide() { daily={date:TODAY,top3:guideTop3,no1:guideNo1}; saveDaily(); closeGuide(); render(); }
document.getElementById('guide-modal').addEventListener('click', function(e){ if(e.target===document.getElementById('guide-modal')) closeGuide(); });

/* INSTALL */
window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferredPrompt=e; document.getElementById('install-banner').classList.add('show'); });
document.getElementById('install-btn').addEventListener('click', function(){ if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null;document.getElementById('install-banner').classList.remove('show');} });
document.getElementById('dismiss-banner').addEventListener('click', function(){ document.getElementById('install-banner').classList.remove('show'); });

/* GOOGLE DRIVE SYNC – Authorization Code + PKCE přes Cloudflare Worker */
var GOOGLE_CLIENT_ID = '477620373464-1apai7eth2sftqqtak88vau4tg5fnb0o.apps.googleusercontent.com';
var WORKER_URL = 'https://ukoly-auth.icx-cz.workers.dev';
var driveToken = null;
var driveSessionId = localStorage.getItem('gdrive-session') || null;
var driveFileId = localStorage.getItem('gdrive-file-id') || null;
var syncTimer = null;

function setSyncState(s) {
  var btn = document.getElementById('sync-btn');
  if (!btn) return;
  btn.dataset.state = s;
  var labels = { idle: 'drive', reconnect: 'drive ↻', syncing: 'sync…', ok: 'drive ✓', error: 'drive ✗' };
  btn.querySelector('.sync-label').textContent = labels[s] || 'drive';
}

function handleSyncBtn() {
  if (!driveToken) signInDrive();
  else if (confirm('Odhlásit z Google Drive?')) signOutDrive();
}

/* PKCE helpers */
function generateCodeVerifier() {
  var arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode.apply(null, arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  var data = new TextEncoder().encode(verifier);
  var digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/* Přesměruje uživatele na Google přihlášení */
async function signInDrive() {
  var verifier = generateCodeVerifier();
  var challenge = await generateCodeChallenge(verifier);
  localStorage.setItem('pkce_verifier', verifier);

  var params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: location.origin + '/',
    response_type: 'code',
    scope: 'openid https://www.googleapis.com/auth/drive.appdata',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
}

function signOutDrive() {
  if (driveSessionId) {
    fetch(WORKER_URL + '/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: driveSessionId })
    }).catch(function(){});
  }
  driveToken = null;
  driveSessionId = null;
  localStorage.removeItem('gdrive-signed-in');
  localStorage.removeItem('gdrive-session');
  setSyncState('idle');
}

/* Zpracuje ?code= po návratu z Google */
async function checkOAuthCallback() {
  var params = new URLSearchParams(location.search);
  var code = params.get('code');
  var error = params.get('error');

  if (error) { history.replaceState({}, '', location.pathname); setSyncState('idle'); return true; }
  if (!code) return false;

  history.replaceState({}, '', location.pathname);
  var verifier = localStorage.getItem('pkce_verifier');
  localStorage.removeItem('pkce_verifier');
  if (!verifier) { setSyncState('error'); return true; }

  setSyncState('syncing');
  try {
    var r = await fetch(WORKER_URL + '/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, code_verifier: verifier, redirect_uri: location.origin + '/' })
    });
    if (!r.ok) { var errBody = await r.text(); console.error('Worker /auth error:', r.status, errBody); throw new Error('HTTP ' + r.status); }
    var data = await r.json();
    if (data.error) throw new Error(data.error);
    driveToken = data.access_token;
    driveSessionId = data.session_id;
    localStorage.setItem('gdrive-session', driveSessionId);
    localStorage.setItem('gdrive-signed-in', '1');
    scheduleTokenRefresh(data.expires_in);
    loadFromDrive();
  } catch(e) {
    console.error('OAuth callback:', e);
    setSyncState('error');
  }
  return true;
}

/* Získá nový access token přes Worker (bez interakce uživatele) */
async function refreshDriveToken() {
  if (!driveSessionId) { setSyncState('reconnect'); return false; }
  if (!navigator.onLine) { setSyncState('error'); return false; }
  try {
    var r = await fetch(WORKER_URL + '/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: driveSessionId })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    if (data.error) throw new Error(data.error);
    driveToken = data.access_token;
    scheduleTokenRefresh(data.expires_in);
    return true;
  } catch(e) {
    console.error('Token refresh:', e);
    driveToken = null;
    // session expirovala → je potřeba nové přihlášení
    if (e.message === 'HTTP 401') {
      localStorage.removeItem('gdrive-session');
      localStorage.removeItem('gdrive-signed-in');
      driveSessionId = null;
      setSyncState('idle');
    } else {
      setSyncState('reconnect');
    }
    return false;
  }
}

function scheduleTokenRefresh(expiresIn) {
  var delay = Math.max(((expiresIn || 3600) - 300), 60) * 1000; // 5 minut před expirací
  setTimeout(function() {
    refreshDriveToken().then(function(ok) { if (ok) setSyncState('ok'); });
  }, delay);
}

async function initGoogleDrive() {
  if (!driveSessionId) return;
  setSyncState('syncing');
  var ok = await refreshDriveToken();
  if (ok) loadFromDrive();
}

/* Drive API volání */
async function driveReq(method, url, body) {
  var headers = { 'Authorization': 'Bearer ' + driveToken };
  var opts = { method: method, headers: headers };
  if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  var r = await fetch(url, opts);
  if (r.status === 401) { driveToken = null; setSyncState('reconnect'); throw new Error('auth'); }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  var ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : null;
}

async function findDriveFile() {
  var res = await driveReq('GET',
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27ukoly.json%27&fields=files(id)',
    null);
  if (res && res.files && res.files.length) {
    driveFileId = res.files[0].id;
    localStorage.setItem('gdrive-file-id', driveFileId);
    return true;
  }
  return false;
}

async function loadFromDrive() {
  if (!driveToken) return;
  setSyncState('syncing');
  try {
    if (!driveFileId && !(await findDriveFile())) {
      setSyncState('ok');
      scheduleDriveSync();
      return;
    }
    var r = await fetch(
      'https://www.googleapis.com/drive/v3/files/' + driveFileId + '?alt=media',
      { headers: { 'Authorization': 'Bearer ' + driveToken } }
    );
    if (r.status === 401) { driveToken = null; setSyncState('reconnect'); return; }
    if (r.status === 404) { driveFileId = null; localStorage.removeItem('gdrive-file-id'); setSyncState('ok'); scheduleDriveSync(); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    var localMod = parseInt(localStorage.getItem('tasks-modified') || '0');
    var driveMod = data.synced ? new Date(data.synced).getTime() : 0;
    if (driveMod > localMod && data.tasks && data.tasks.length > 0) {
      tasks = data.tasks;
      if (data.daily) { daily = data.daily; localStorage.setItem('daily', JSON.stringify(daily)); }
      localStorage.setItem('tasks', JSON.stringify(tasks));
      render();
    } else {
      scheduleDriveSync();
    }
    setSyncState('ok');
  } catch(e) {
    console.error('Drive load:', e);
    if (e.message !== 'auth') setSyncState('error');
  }
}

async function syncToDrive() {
  if (!driveToken || !navigator.onLine) return;
  setSyncState('syncing');
  var payload = { tasks: tasks, daily: daily, synced: new Date().toISOString() };
  try {
    if (!driveFileId) {
      var found = await findDriveFile();
      if (!found) {
        var meta = await driveReq('POST',
          'https://www.googleapis.com/drive/v3/files',
          { name: 'ukoly.json', parents: ['appDataFolder'] });
        driveFileId = meta.id;
        localStorage.setItem('gdrive-file-id', driveFileId);
      }
    }
    await fetch(
      'https://www.googleapis.com/upload/drive/v3/files/' + driveFileId + '?uploadType=media',
      {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + driveToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    setSyncState('ok');
  } catch(e) {
    console.error('Drive sync:', e);
    if (e.message !== 'auth') setSyncState('error');
  }
}

function scheduleDriveSync() {
  if (!driveToken) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToDrive, 4000);
}

/* EXPORT / IMPORT */
function exportTasks() {
  var data = { tasks: tasks, daily: daily, exported: new Date().toISOString() };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'ukoly-' + TODAY + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('import-input').addEventListener('change', function() {
  var file = this.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      var imported = Array.isArray(data) ? data : (data.tasks || []);
      if (!imported.length) { alert('Soubor neobsahuje žádné úkoly.'); return; }
      if (!confirm('Importovat ' + imported.length + ' úkolů? Stávající úkoly budou nahrazeny.')) return;
      tasks = imported;
      if (data.daily) { daily = data.daily; saveDaily(); }
      save(); render();
    } catch(err) {
      alert('Chyba při čtení souboru – zkontroluj formát.');
    }
  };
  reader.readAsText(file);
  this.value = '';
});

function importTasks() { document.getElementById('import-input').click(); }

/* INIT */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.error);
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if (!isDailyFresh() && tasks.filter(function(t){return !t.done;}).length >= 2) {
  var last = localStorage.getItem('last-guide-prompt');
  if (last !== TODAY) { localStorage.setItem('last-guide-prompt', TODAY); setTimeout(openGuide, 600); }
}
if (new URLSearchParams(location.search).get('action') === 'add') input.focus();
render();
checkOAuthCallback().then(function(wasCallback) { if (!wasCallback) initGoogleDrive(); });
