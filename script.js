// ── STORAGE HELPERS ──
function lsGet(key) {
  try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch(e) { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}
function lsDel(key) {
  try { localStorage.removeItem(key); } catch(e) {}
}

function escapeHTML(text) {
  return String(text || '').replace(/[&<>"']/g, function(ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

function getStoredApiKey() {
  return localStorage.getItem('gemini_api_key') || localStorage.getItem('anthropic_api_key') || '';
}

function isDirectBrowserMode() {
  return window.location.protocol === 'file:';
}

function openLocalApp() {
  window.location.href = 'http://localhost:3000';
}

function showKeyBanner() {
  var banner = document.getElementById('keyBanner');
  if (banner) banner.classList.remove('hidden');
  document.body.classList.add('key-banner-open');
}

function hideKeyBanner() {
  var banner = document.getElementById('keyBanner');
  if (banner) banner.classList.add('hidden');
  document.body.classList.remove('key-banner-open');
}

function ensureAIReady() {
  if (isDirectBrowserMode()) {
    showKeyBanner();
    return false;
  }
  return true;
}

function updateApiKeyUI() {
  var row = document.getElementById('apiKeyRow');
  if (!row) return;
  row.classList.remove('has-key');

  if (isDirectBrowserMode()) {
    row.innerHTML = '&#9888; Open the app through http://localhost:3000';
    row.title = 'Gemini requests need the local server proxy';
    return;
  }

  row.classList.add('has-key');
  row.innerHTML = '&#10003; Server mode active - using backend proxy';
  row.title = 'The hosted app uses the server-side GEMINI_API_KEY';
}

// ── AUTO-SAVE ──
function saveCurrentProject() {
  if (!activeProject) return;
  // Save chat messages
  var msgs = [];
  document.querySelectorAll('#chatMessages .msg').forEach(function(el) {
    var role = el.classList.contains('msg-user') ? 'user' : 'ai';
    var bubble = el.querySelector('.msg-bubble');
    if (bubble) msgs.push({ role: role, html: bubble.innerHTML });
  });
  lsSet('project_chat_' + activeProject, msgs);
  lsSet('project_history_' + activeProject, chatHistory);
  lsSet('project_sketches_' + activeProject, sketchImages);
  // Save all layer content
  var layers = {};
  ['concept','outline','script','storyboard','breakdown','schedule'].forEach(function(name) {
    var el = document.getElementById('layer-' + name);
    if (el) layers[name] = el.innerHTML;
  });
  lsSet('project_layers_' + activeProject, layers);
  // Save which tabs have green done dots
  var doneTabs = [];
  document.querySelectorAll('.layer-tab.tab-done').forEach(function(tab) {
    doneTabs.push(tab.getAttribute('data-layer'));
  });
  lsSet('project_done_tabs_' + activeProject, doneTabs);
  var p = projects.find(function(x) { return x.id === activeProject; });
  if (p) lsSet('projects_meta', projects);
  showSaveIndicator();
}

function loadProjectChat(id) {
  var msgs    = lsGet('project_chat_'     + id) || [];
  var history = lsGet('project_history_'  + id) || [];
  var layers  = lsGet('project_layers_'   + id) || {};
  var doneTabs= lsGet('project_done_tabs_'+ id) || [];

  // Restore chat
  var container = document.getElementById('chatMessages');
  container.innerHTML = '';
  if (msgs.length === 0) {
    container.innerHTML = '<div class="chat-welcome" id="chatWelcome">'
      + '<div class="chat-welcome-icon">&#10022;</div>'
      + '<div class="chat-welcome-text">Tell me your story idea and I&#39;ll help bring it to life.</div></div>';
  } else {
    msgs.forEach(function(m) {
      var div = document.createElement('div');
      div.className = 'msg msg-' + m.role;
      var label = m.role === 'user' ? 'You' : 'Script AI';
      div.innerHTML = '<div class="msg-label">' + label + '</div><div class="msg-bubble">' + m.html + '</div>';
      container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
  }
  chatHistory = history;

  // Restore layer content
  var emptyHTML = '<div class="layer-empty"><div class="layer-empty-icon">&#10022;</div><div class="layer-empty-text">Generate your project to see this layer.</div></div>';
  ['concept','outline','script','storyboard','breakdown','schedule'].forEach(function(name) {
    var el = document.getElementById('layer-' + name);
    if (!el) return;
    el.innerHTML = (layers[name] && layers[name].indexOf('layer-empty') === -1)
      ? layers[name]
      : emptyHTML;
    // Re-wire sketch events if storyboard
    if (name === 'storyboard') wireSketchEvents(el);
  });

  // Restore done tab indicators
  document.querySelectorAll('.layer-tab').forEach(function(tab) {
    tab.classList.remove('tab-done');
    var span = tab.querySelector('.tab-done-dot');
    if (span) span.remove();
  });
  doneTabs.forEach(function(layerName) {
    var tab = document.querySelector('.layer-tab[data-layer="' + layerName + '"]');
    if (tab && !tab.classList.contains('tab-done')) {
      tab.classList.add('tab-done');
      tab.insertAdjacentHTML('beforeend', '<span class="tab-done-dot">&#9679;</span>');
    }
  });

  // Switch to script tab if script content exists, else concept
  if (layers.script && layers.script.indexOf('layer-empty') === -1) {
    switchLayer('script');
  } else {
    switchLayer('concept');
  }
}

function showSaveIndicator() {
  var ind = document.getElementById('saveIndicator');
  if (!ind) return;
  ind.style.opacity = '1';
  clearTimeout(ind._timer);
  ind._timer = setTimeout(function() { ind.style.opacity = '0'; }, 1500);
}

// ── PROJECTS ──
var projects = lsGet('projects_meta') || [];
var activeProject = projects[0] ? projects[0].id : null;
var activeCtxProject = null;
var renamingId = null;

function renderProjects() {
  var list = document.getElementById('hamProjectList');
  if (!list) return;
  list.innerHTML = '';
  if (projects.length === 0) {
    list.innerHTML = '<div style="padding:16px 12px;color:var(--text-muted);font-size:12px;text-align:center;opacity:0.6;">No projects yet.<br>Click &ldquo;+ New Project&rdquo; to start.</div>';
    return;
  }
  projects.forEach(function(p) {
    var div = document.createElement('div');
    div.className = 'ham-project-item' + (p.id === activeProject ? ' active' : '');
    var nameHtml = renamingId === p.id
      ? '<input class="rename-input" id="renameInput" value="' + p.name + '" onblur="saveRename(' + p.id + ')" onkeydown="renameKey(event,' + p.id + ')" autofocus>'
      : '<div class="ham-project-name">' + p.name + '</div>';
    div.innerHTML = '<div class="ham-project-dot"></div>'
      + '<div class="ham-project-info">' + nameHtml + '<div class="ham-project-summary">' + p.summary + '</div></div>'
      + '<button class="ham-project-menu" onclick="openCtx(event,' + p.id + ')">&#8942;</button>';
    div.addEventListener('click', function(e) {
      if (e.target.closest('.ham-project-menu')) return;
      if (renamingId) return;
      openProject(p.id);
    });
    list.appendChild(div);
  });
  if (renamingId) {
    var inp = document.getElementById('renameInput');
    if (inp) { inp.focus(); inp.select(); }
  }
}

function openProject(id) {
  if (activeProject === id) { closeHamburger(); return; }
  saveCurrentProject();
  activeProject = id;
  loadProjectChat(id);
  loadSketchImages();
  renderProjects();
  closeHamburger();
}

function newProject() {
  saveCurrentProject();
  var id = Date.now();
  projects.unshift({ id: id, name: 'New Project', summary: 'Start describing your story.' });
  activeProject = id;
  chatHistory = [];
  sketchImages = {};
  lsSet('projects_meta', projects);
  // Clear chat area immediately
  var container = document.getElementById('chatMessages');
  container.innerHTML = '<div class="chat-welcome" id="chatWelcome">'
    + '<div class="chat-welcome-icon">&#10022;</div>'
    + '<div class="chat-welcome-text">Tell me your story idea and I&#39;ll help bring it to life.</div></div>';
  // Clear all layer tabs
  ['concept','outline','script','storyboard','breakdown','schedule'].forEach(function(layer) {
    var el = document.getElementById('layer-' + layer);
    if (el) el.innerHTML = '<div class="layer-empty"><div class="layer-empty-icon">&#10022;</div><div class="layer-empty-text">Generate your project to see ' + layer + '.</div></div>';
    var tab = document.querySelector('[data-layer="' + layer + '"]');
    if (tab) {
      tab.classList.remove('tab-done');
      var dot = tab.querySelector('.tab-done-dot');
      if (dot) dot.remove();
    }
  });
  switchLayer('concept');
  lsSet('projects_meta', projects);
  renderProjects();
  closeHamburger();
}

function openCtx(e, id) {
  e.stopPropagation();
  activeCtxProject = id;
  var menu = document.getElementById('ctxMenu');
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.add('open');
}

function closeCtx() { document.getElementById('ctxMenu').classList.remove('open'); }

function renameProject() {
  closeCtx();
  renamingId = activeCtxProject;
  renderProjects();
}

function saveRename(id) {
  var inp = document.getElementById('renameInput');
  if (inp) {
    var p = projects.find(function(x) { return x.id === id; });
    if (p) p.name = inp.value.trim() || p.name;
  }
  renamingId = null;
  lsSet('projects_meta', projects);
  renderProjects();
}

function renameKey(e, id) {
  if (e.key === 'Enter') saveRename(id);
  if (e.key === 'Escape') { renamingId = null; renderProjects(); }
}

function deleteProject() {
  closeCtx();
  var delId = activeCtxProject;
  lsDel('project_chat_'      + delId);
  lsDel('project_history_'   + delId);
  lsDel('project_layers_'    + delId);
  lsDel('project_done_tabs_' + delId);
  lsDel('project_sketches_'  + delId);
  projects = projects.filter(function(p) { return p.id !== delId; });
  if (activeProject === delId) {
    activeProject = projects[0] ? projects[0].id : null;
    if (activeProject) {
      loadProjectChat(activeProject);
      loadSketchImages();
    } else {
      // No projects left — clear the workspace
      chatHistory = [];
      sketchImages = {};
      var container = document.getElementById('chatMessages');
      container.innerHTML = '<div class="chat-welcome" id="chatWelcome">'
        + '<div class="chat-welcome-icon">&#10022;</div>'
        + '<div class="chat-welcome-text">Create a new project to get started.</div></div>';
    }
  }
  lsSet('projects_meta', projects);
  renderProjects();
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.ctx-menu') && !e.target.closest('.ham-project-menu')) closeCtx();
  if (!e.target.closest('.ham-dropdown') && !e.target.closest('.hamburger-btn')) closeHamburger();
});

// ── HAMBURGER ──
function toggleHamburger() {
  document.getElementById('hamDropdown').classList.toggle('open');
}
function closeHamburger() {
  document.getElementById('hamDropdown').classList.remove('open');
}

// ── LAYER TABS ──
function switchLayer(name) {
  document.querySelectorAll('.layer-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.layer').forEach(function(l) { l.classList.remove('active'); });
  document.querySelector('[data-layer="' + name + '"]').classList.add('active');
  document.getElementById('layer-' + name).classList.add('active');
}

// ── ACT TOGGLE ──
function toggleAct(header) {
  var toggle = header.querySelector('.act-toggle');
  var scenes = header.nextElementSibling;
  if (scenes.style.display === 'none') {
    scenes.style.display = 'flex';
    toggle.classList.add('open');
  } else {
    scenes.style.display = 'none';
    toggle.classList.remove('open');
  }
}

// ── CHAT ──
var chatHistory = [];
var isStreaming = false;

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

function appendMessage(role, text, id) {
  var welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.remove();
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'msg msg-' + role;
  if (id) div.id = id;
  var label = role === 'user' ? 'You' : 'Script AI';
  div.innerHTML = '<div class="msg-label">' + label + '</div>'
    + '<div class="msg-bubble">' + text.replace(/\n/g, '<br>') + '</div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function updateMessage(id, text) {
  var el = document.getElementById(id);
  if (el) el.querySelector('.msg-bubble').innerHTML = text.replace(/\n/g, '<br>');
  var msgs = document.getElementById('chatMessages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function showTyping(id) {
  var welcome = document.getElementById('chatWelcome');
  if (welcome) welcome.remove();
  var msgs = document.getElementById('chatMessages');
  var div = document.createElement('div');
  div.className = 'msg msg-ai';
  div.id = id || 'typingIndicator';
  div.innerHTML = '<div class="msg-label">Script AI</div>'
    + '<div class="typing-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeEl(id) {
  var t = document.getElementById(id);
  if (t) t.remove();
}

function isGenerationIntent(text) {
  var t = text.toLowerCase();
  return /(generate|write|create|make|build|produce|give me|show me).*(script|story|film|screenplay|scene|concept|outline|storyboard|breakdown)/.test(t)
    || /(script|story|screenplay).*(generate|write|create|make|build)/.test(t)
    || /^(generate|write|create|make)\s/.test(t);
}

function extractGeminiText(data) {
  var candidate = (data.candidates || [])[0] || {};
  var parts = ((candidate.content || {}).parts) || [];
  return parts.map(function(part) { return part.text || ''; }).join('').trim();
}

function callAI(systemPrompt, userPrompt, maxTokens, retryCount) {
  retryCount = retryCount || 0;
  var body = JSON.stringify({
    model: 'gemini-2.5-flash',
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      maxOutputTokens: maxTokens || 1000,
      temperature: 0.7
    }
  });

  // Gemini requests go through the backend proxy.
  var apiUrl = '/api/chat';
  var headers = { 'Content-Type': 'application/json' };

  return fetch(apiUrl, {
    method: 'POST',
    headers: headers,
    body: body
  }).then(function(r) {
    // Log HTTP status for debugging
    console.log('[callAI] HTTP status:', r.status);
    if (!r.ok) {
      return r.json().catch(function() { return {}; }).then(function(errData) {
        var msg = (errData.error && errData.error.message) || errData.message || ('HTTP ' + r.status);
        // 529 = overloaded, 429 = rate limit — retry up to 3 times
        if ((r.status === 429 || r.status === 500 || r.status === 503 || r.status === 504) && retryCount < 3 && msg.toLowerCase().indexOf('environment variable') === -1) {
          var delay = (retryCount + 1) * 2000;
          console.log('[callAI] Retrying in ' + delay + 'ms (attempt ' + (retryCount+1) + ')...');
          return new Promise(function(resolve) { setTimeout(resolve, delay); })
            .then(function() { return callAI(systemPrompt, userPrompt, maxTokens, retryCount + 1); });
        }
        throw new Error(msg);
      });
    }
    return r.json();
  }).then(function(data) {
    var candidate = (data.candidates || [])[0] || {};
    console.log('[callAI] finishReason:', candidate.finishReason, '| candidates:', (data.candidates || []).length);
    if (data.error) throw new Error(data.error.message || 'API error');
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error('Gemini blocked the prompt: ' + data.promptFeedback.blockReason);
    }
    var text = extractGeminiText(data);
    if (!text) {
      console.warn('[callAI] Empty text. Full response:', JSON.stringify(data).slice(0, 400));
      // Retry on empty if we haven't exceeded limit
      if (retryCount < 2) {
        console.log('[callAI] Retrying empty response...');
        return new Promise(function(resolve) { setTimeout(resolve, 1500); })
          .then(function() { return callAI(systemPrompt, userPrompt, maxTokens, retryCount + 1); });
      }
      throw new Error('Empty response from Gemini (finishReason: ' + (candidate.finishReason || 'unknown') + ')');
    }
    return text;
  });
}

// ── RENDER HELPERS ──

function renderConceptLayer(d) {
  var themeTags = (d.themes || []).map(function(t) {
    return '<span class="theme-tag">' + t + '</span>';
  }).join('');
  var charItems = (d.characters || []).map(function(c) {
    return '<div class="char-item">'
      + '<div class="char-avatar">' + c.name.charAt(0).toUpperCase() + '</div>'
      + '<div><div class="char-info-name">' + c.name + '</div>'
      + '<div class="char-info-role">' + c.role + '</div></div></div>';
  }).join('');
  document.getElementById('layer-concept').innerHTML =
    '<div class="section-header"><div class="section-title">' + (d.title || 'Concept') + '</div><div class="section-badge">Concept</div></div>'
    + '<div class="concept-grid">'
    + '<div class="concept-card full"><div class="card-label">Main Idea</div><div class="card-title">' + (d.title || '') + '</div><div class="card-text">' + (d.logline || '') + '</div></div>'
    + '<div class="concept-card"><div class="card-label">Themes</div><div class="theme-tags">' + themeTags + '</div></div>'
    + '<div class="concept-card"><div class="card-label">Setting</div><div class="card-text">' + (d.setting || '') + '</div></div>'
    + '<div class="concept-card full"><div class="card-label">Characters</div><div class="char-list">' + charItems + '</div></div>'
    + '</div>';
}

function renderOutlineLayer(d) {
  var actColors = ['act-1', 'act-2', 'act-3', 'act-4'];
  var actsHtml = '';
  (d.acts || []).forEach(function(act, i) {
    var scenesHtml = '';
    (act.scenes || []).forEach(function(sc) {
      var plotHtml = (sc.plotPoints || []).map(function(p) {
        return '<li class="plot-point">' + p + '</li>';
      }).join('');
      scenesHtml += '<div class="scene-card">'
        + '<div class="scene-card-title">' + sc.title + '</div>'
        + '<div class="scene-card-chars">Characters: ' + (sc.characters || []).join(', ') + '</div>'
        + '<ul class="plot-points">' + plotHtml + '</ul></div>';
    });
    actsHtml += '<div class="act-card ' + actColors[i % 4] + '">'
      + '<div class="act-header" onclick="toggleAct(this)">'
      + '<div class="act-title">' + act.title + '</div>'
      + '<div class="act-toggle open">&#9658;</div></div>'
      + '<div class="act-scenes">' + scenesHtml + '</div></div>';
  });
  document.getElementById('layer-outline').innerHTML =
    '<div class="section-header"><div class="section-title">Story Outline</div><div class="section-badge">' + (d.acts || []).length + ' Acts</div></div>'
    + '<div class="outline-acts">' + actsHtml + '</div>';
}

function renderScriptLayer(text) {
  var lines = text.split('\n');
  var html = '<div class="script-content">';
  lines.forEach(function(line) {
    var t = line.trim();
    if (!t) { html += '<div style="margin-bottom:8px"></div>'; return; }
    if (/^(INT\.|EXT\.|INT\/EXT\.|EXT\/INT\.)/i.test(t)) {
      html += '<div class="scene-heading">' + t + '</div>';
    } else if (/^[A-Z][A-Z\s\.]{2,}$/.test(t) && t.length < 40 && !/^(FADE|CUT|DISSOLVE)/.test(t)) {
      html += '<div class="character-name">' + t + '</div>';
    } else if (/^\(.*\)$/.test(t)) {
      html += '<div class="parenthetical">' + t + '</div>';
    } else if (/^(FADE|CUT TO|DISSOLVE|SMASH CUT|MATCH CUT)/i.test(t)) {
      html += '<div class="scene-heading" style="text-align:right;margin-top:20px">' + t + '</div>';
    } else {
      var indent = line.length - line.trimStart().length;
      if (indent >= 10) {
        html += '<div class="dialogue">' + t + '</div>';
      } else {
        html += '<div class="action-line">' + t + '</div>';
      }
    }
  });
  html += '</div>';
  document.getElementById('layer-script').innerHTML = html;
}

// Sketch image store: { sketchId: base64dataUrl }
var sketchImages = {};
var _lastStoryboardData = null;

function renderStoryboardLayer(d) {
  _lastStoryboardData = d;
  var html = '<div class="section-header"><div class="section-title">Storyboard</div>'
    + '<div class="section-badge">' + (d.scenes || []).length + ' Scenes</div></div>'
    + '<div class="storyboard-scenes">';
  (d.scenes || []).forEach(function(scene, si) {
    html += '<div><div class="sb-scene-label">' + scene.title + '</div><div class="sb-rows">';
    (scene.shots || []).forEach(function(shot, shi) {
      var sid = 'sketch_' + si + '_' + shi;
      var existingImg = sketchImages[sid] || '';
      html += '<div class="sb-row">'
        + '<div class="sb-cell sb-sketch">'
        +   '<div class="sb-cell-label">Sketch</div>'
        +   '<div class="sketch-upload-area" id="sua_' + sid + '" data-sid="' + sid + '">'
        +     buildSketchInner(sid, existingImg)
        +   '</div>'
        +   '<div class="sb-cell-text">' + (shot.description || '') + '</div>'
        + '</div>'
        + '<div class="sb-cell sb-dialogue"><div class="sb-cell-label">Dialogue</div><div class="sb-cell-text">' + (shot.dialogue || '&mdash;') + '</div></div>'
        + '<div class="sb-cell sb-lighting"><div class="sb-cell-label">Lighting</div><div class="sb-cell-text">' + (shot.lighting || '') + '</div></div>'
        + '<div class="sb-cell sb-camera"><div class="sb-cell-label">Camera</div><div class="sb-cell-text">' + (shot.cameraAngle || '') + '</div></div>'
        + '<div class="sb-cell sb-emotion"><div class="sb-cell-label">Emotion</div><div class="sb-cell-text">' + (shot.emotion || '') + '</div></div>'
        + '</div>';
    });
    html += '</div></div>';
  });
  html += '</div>';
  var el = document.getElementById('layer-storyboard');
  el.innerHTML = html;
  wireSketchEvents(el);
}

function buildSketchInner(sid, imgSrc) {
  var img = imgSrc
    ? '<img src="' + imgSrc + '" style="width:100%;height:80px;object-fit:cover;border-radius:4px;display:block;" alt="sketch">'
    : '<div class="sb-sketch-img">&#127916;</div>';
  var del = imgSrc
    ? '<button class="sketch-delete-btn" data-action="delete" data-sid="' + sid + '" title="Delete sketch">&#10005;</button>'
    : '';
  return img
    + '<div class="sketch-controls">'
    +   '<label class="sketch-upload-btn" title="' + (imgSrc ? 'Replace' : 'Upload') + ' sketch">'
    +     '&#128247; ' + (imgSrc ? 'Replace' : 'Upload')
    +     '<input type="file" accept="image/*" data-action="upload" data-sid="' + sid + '" style="display:none">'
    +   '</label>'
    +   del
    + '</div>';
}

function wireSketchEvents(container) {
  container.querySelectorAll('input[data-action="upload"]').forEach(function(input) {
    input.addEventListener('change', function() {
      var sid = this.getAttribute('data-sid');
      var file = this.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB.'); return; }
      var reader = new FileReader();
      reader.onload = function(ev) {
        sketchImages[sid] = ev.target.result;
        saveSketchImages();
        refreshSketchCell(sid);
      };
      reader.readAsDataURL(file);
    });
  });
  container.querySelectorAll('button[data-action="delete"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var sid = this.getAttribute('data-sid');
      delete sketchImages[sid];
      saveSketchImages();
      refreshSketchCell(sid);
    });
  });
}

function refreshSketchCell(sid) {
  var area = document.getElementById('sua_' + sid);
  if (!area) return;
  area.innerHTML = buildSketchInner(sid, sketchImages[sid] || '');
  wireSketchEvents(area);
}

function saveSketchImages() {
  lsSet('project_sketches_' + activeProject, sketchImages);
  showSaveIndicator();
}

function loadSketchImages() {
  sketchImages = lsGet('project_sketches_' + activeProject) || {};
}

function renderBreakdownLayer(d) {
  var html = '<div class="section-header"><div class="section-title">Production Breakdown</div>'
    + '<div class="section-badge">Scene-by-Scene</div></div><div class="bd-scenes">';
  (d.scenes || []).forEach(function(sc) {
    var charsHtml = (sc.characters || []).map(function(c) { return '<span class="bd-mini-card">&#128100; ' + c + '</span>'; }).join('');
    var propsHtml = (sc.props || []).map(function(p) { return '<span class="bd-mini-card">' + p + '</span>'; }).join('');
    var techHtml  = (sc.technical || []).map(function(t) { return '<span class="bd-mini-card">&#128247; ' + t + '</span>'; }).join('');
    html += '<div class="bd-scene-row">'
      + '<div class="bd-scene-head">' + (sc.heading || '') + '</div>'
      + '<div class="bd-row-cells">'
      + '<div class="bd-cell bd-chars"><div class="bd-cell-label">Characters</div>' + charsHtml + '</div>'
      + '<div class="bd-cell bd-props"><div class="bd-cell-label">Props &amp; Wardrobe</div>' + propsHtml + '</div>'
      + '<div class="bd-cell bd-location"><div class="bd-cell-label">Location &amp; Set</div><div class="bd-text">' + (sc.location || '') + '</div></div>'
      + '<div class="bd-cell bd-technical"><div class="bd-cell-label">Technical</div>' + techHtml + '</div>'
      + '<div class="bd-cell bd-notes"><div class="bd-cell-label">Notes</div><div class="bd-text">' + (sc.notes || '') + '</div></div>'
      + '</div></div>';
  });
  html += '</div>';
  document.getElementById('layer-breakdown').innerHTML = html;
}

function renderScheduleLayer(d) {
  var days = (d.days || []).length ? d.days : [
    { label: 'Day 1', focus: 'Prep' },
    { label: 'Day 2', focus: 'Shoot' },
    { label: 'Day 3', focus: 'Shoot' },
    { label: 'Day 4', focus: 'Wrap' }
  ];
  var rows = d.rows || [];
  var gridTemplate = '200px repeat(' + days.length + ', 1fr)';
  var html = '<div class="section-header"><div class="section-title">Production Schedule</div>'
    + '<div class="section-badge">' + days.length + ' Days</div></div>'
    + '<div class="schedule-wrap"><div class="schedule-table">';

  html += '<div class="schedule-header" style="grid-template-columns:' + gridTemplate + ';">'
    + '<div class="sched-scene-col">Scenes</div>';
  days.forEach(function(day) {
    html += '<div class="sched-day-col">' + escapeHTML(day.label || '') + '<br><span style="font-size:10px;font-weight:500;opacity:0.7;">' + escapeHTML(day.focus || '') + '</span></div>';
  });
  html += '</div><div class="sched-rows">';

  rows.forEach(function(row) {
    var resources = (row.resources || []).map(function(item) {
      return '<span class="res-chip">' + escapeHTML(item) + '</span>';
    }).join('');
    html += '<div class="sched-row" style="grid-template-columns:' + gridTemplate + ';">'
      + '<div class="sched-scene-info">'
      + '<div class="sched-scene-name">' + escapeHTML(row.scene || 'Scene') + '</div>'
      + '<div class="bd-text">' + escapeHTML(row.notes || '') + '</div>'
      + '<div class="sched-scene-res">' + resources + '</div>'
      + '</div>';

    days.forEach(function(day, index) {
      var slot = (row.slots || [])[index];
      if (!slot || !slot.label) {
        html += '<div class="sched-cell empty"></div>';
        return;
      }
      html += '<div class="sched-cell"><div class="sched-bar ' + escapeHTML(slot.status || 'planned') + '">' + escapeHTML(slot.label) + '</div></div>';
    });

    html += '</div>';
  });

  html += '</div></div></div>';
  document.getElementById('layer-schedule').innerHTML = html;
}

function markTabDone(layer) {
  var tab = document.querySelector('[data-layer="' + layer + '"]');
  if (tab && !tab.classList.contains('tab-done')) {
    tab.classList.add('tab-done');
    var dot = document.createElement('span');
    dot.className = 'tab-done-dot';
    dot.style.cssText = 'display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--green);margin-left:5px;vertical-align:middle;';
    tab.appendChild(dot);
  }
}

function parseJSON(raw) {
  console.log('[parseJSON] raw response (first 300):', raw ? raw.slice(0,300) : 'EMPTY');

  if (!raw || !raw.trim()) throw new Error('Empty response from AI');

  // 1. Strip markdown fences
  var s = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // 2. Find first { character — skip any preamble text
  var start = s.indexOf('{');
  if (start === -1) throw new Error('No JSON object in response: ' + s.slice(0,100));
  s = s.slice(start);

  // 3. Scan to find matching closing brace
  var depth = 0, inStr = false, esc = false, end = -1;
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (esc)          { esc = false; continue; }
    if (c === '\\')  { esc = true;  continue; }
    if (c === '"')    { inStr = !inStr; continue; }
    if (inStr)        { continue; }
    if (c === '{')    depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }

  // 4. Slice to the balanced object (or try to heal truncated JSON)
  s = (end !== -1) ? s.slice(0, end + 1) : healJSON(s);

  // 5. Sanitise: remove literal newlines/tabs inside strings, strip control chars
  s = s
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/,\s*([}\]])/g, '$1');   // trailing commas

  console.log('[parseJSON] cleaned (first 300):', s.slice(0,300));
  return JSON.parse(s);
}

function healJSON(s) {
  // Close any open string first
  var inStr = false, esc = false;
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') inStr = !inStr;
  }
  if (inStr) s += '"';

  // Remove trailing comma
  s = s.replace(/,\s*$/, '');

  // Close open arrays then objects
  var opens = [];
  inStr = false; esc = false;
  for (var j = 0; j < s.length; j++) {
    var ch = s[j];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') opens.push('}');
    else if (ch === '[') opens.push(']');
    else if (ch === '}' || ch === ']') opens.pop();
  }
  while (opens.length) s += opens.pop();
  return s;
}

// ── GENERATION PIPELINE ──
function runGeneration(storyIdea) {
  if (!ensureAIReady()) return;
  isStreaming = true;
  document.getElementById('sendBtn').style.opacity = '0.4';

  var progressId = 'gen-progress';
  var steps = ['Concept', 'Outline', 'Script', 'Storyboard', 'Breakdown', 'Schedule'];
  var done = [];

  function progressMsg(active) {
    var line = steps.map(function(s) {
      if (done.indexOf(s) >= 0) return '&#10003; ' + s;
      if (s === active) return '&#9679; ' + s + ' &mdash; writing...';
      return '&#9675; ' + s;
    }).join('&nbsp;&nbsp;&#183;&nbsp;&nbsp;');
    updateMessage(progressId, '&#10022; Generating your project...<br><br>' + line);
  }

  appendMessage('ai', '&#10022; Starting generation &mdash; building Concept, Outline, Script, Storyboard, Breakdown and Schedule now...', progressId);

  var conceptJson, outlineJson, breakdownJson;

  callAI(
    'You are a screenplay development AI. Respond ONLY with valid JSON, no markdown, no extra text.',
    'Create a film concept for this story: ' + storyIdea + '\nRespond with ONLY a JSON object, no other text:\n{"title":"","logline":"","themes":[""],"setting":"","characters":[{"name":"","role":""}]}',
    1200
  ).then(function(raw) {
    progressMsg('Concept');
    conceptJson = parseJSON(raw);
    renderConceptLayer(conceptJson);
    markTabDone('concept');
    done.push('Concept');
    progressMsg('Outline');

    var charNames = (conceptJson.characters || []).map(function(c) { return c.name; }).join(', ');
    return callAI(
      'You are a screenplay development AI. Respond ONLY with valid JSON, no markdown, no extra text.',
      'Create a 3-act outline for the film "' + conceptJson.title + '". Characters: ' + charNames + '. Logline: ' + conceptJson.logline + '\nReturn ONLY this exact JSON (no other text):\n'
      + '{"acts":[{"title":"Act I - Setup","scenes":[{"title":"Scene 1: Title","characters":["Name"],"plotPoints":["point 1","point 2"]}]},'
      + '{"title":"Act II - Conflict","scenes":[{"title":"Scene 1: Title","characters":["Name"],"plotPoints":["point 1"]}]},'
      + '{"title":"Act III - Resolution","scenes":[{"title":"Scene 1: Title","characters":["Name"],"plotPoints":["point 1"]}]}]}',
      2000
    );
  }).then(function(raw) {
    outlineJson = parseJSON(raw);
    renderOutlineLayer(outlineJson);
    markTabDone('outline');
    done.push('Outline');
    progressMsg('Script');

    var charDescs = (conceptJson.characters || []).map(function(c) { return c.name + ': ' + c.role; }).join('; ');
    var outlineSummary = (outlineJson.acts || []).map(function(a) {
      return a.title + ': ' + (a.scenes || []).map(function(s) { return s.title; }).join(', ');
    }).join(' | ');
    return callAI(
      'You are a professional screenwriter. Write in standard screenplay format. Scene headings start with INT. or EXT. in uppercase. Character names are ALL CAPS on their own line. Parentheticals on their own line in (parentheses). Dialogue is indented with 15 spaces. Action lines have no indent.',
      'Write a 3-5 scene screenplay for: "' + storyIdea + '".\nTitle: ' + conceptJson.title + '\nCharacters: ' + charDescs + '\nOutline: ' + outlineSummary + '\n\nWrite the full screenplay now.',
      3000
    );
  }).then(function(text) {
    renderScriptLayer(text);
    markTabDone('script');
    done.push('Script');
    progressMsg('Storyboard');

    var sceneTitles = (outlineJson.acts || []).map(function(a) {
      return (a.scenes || []).map(function(s) { return s.title; }).join(', ');
    }).join(' | ');
    return callAI(
      'You are a storyboard artist. Respond ONLY with valid JSON, no markdown, no extra text.',
      'Create a storyboard for "' + conceptJson.title + '". Scenes: ' + sceneTitles + '.\n'
      + 'Return ONLY this exact JSON:\n'
      + '{"scenes":[{"title":"Scene 1: Title","shots":[{"description":"Shot description","dialogue":"Key line or none",'
      + '"lighting":"Lighting notes","cameraAngle":"Shot type","emotion":"Character emotions"}]}]}',
      2500
    );
  }).then(function(raw) {
    var sbJson = parseJSON(raw);
    renderStoryboardLayer(sbJson);
    markTabDone('storyboard');
    done.push('Storyboard');
    progressMsg('Breakdown');

    var allScenes = (outlineJson.acts || []).map(function(a) {
      return (a.scenes || []).map(function(s) { return s.title; }).join(', ');
    }).join(', ');
    var charNames = (conceptJson.characters || []).map(function(c) { return c.name; }).join(', ');
    return callAI(
      'You are a film production manager. Respond ONLY with valid JSON, no markdown, no extra text.',
      'Create a production breakdown for "' + conceptJson.title + '". Scenes: ' + allScenes + '. Characters: ' + charNames + '.\n'
      + 'Return ONLY this exact JSON:\n'
      + '{"scenes":[{"heading":"Scene N: INT./EXT. LOCATION - TIME","characters":["Name"],'
      + '"props":["prop 1","prop 2"],"location":"Location notes","technical":["camera","equipment"],"notes":"Notes"}]}',
      2000
    );
  }).then(function(raw) {
    breakdownJson = parseJSON(raw);
    renderBreakdownLayer(breakdownJson);
    markTabDone('breakdown');
    done.push('Breakdown');
    progressMsg('Schedule');

    var scheduleSource = (breakdownJson.scenes || []).map(function(sc, index) {
      return 'Scene ' + (index + 1) + ': ' + (sc.heading || '') + ' | Characters: ' + (sc.characters || []).join(', ') + ' | Location: ' + (sc.location || '') + ' | Notes: ' + (sc.notes || '');
    }).join('\n');
    return callAI(
      'You are a first assistant director. Respond ONLY with valid JSON, no markdown, no extra text.',
      'Create a 4-day production schedule for "' + conceptJson.title + '". Use this scene breakdown:\n' + scheduleSource + '\n'
      + 'Return ONLY this exact JSON:\n'
      + '{"days":[{"label":"Day 1","focus":"Company move / prep"}],'
      + '"rows":[{"scene":"Scene 1","notes":"Why this day works","resources":["Cast","Location"],'
      + '"slots":[{"label":"Prep","status":"planned"},{"label":"Shoot","status":"shooting"},{"label":"Hold","status":"planned"},{"label":"Wrap","status":"completed"}]}]}',
      1800
    );
  }).then(function(raw) {
    var scheduleJson = parseJSON(raw);
    renderScheduleLayer(scheduleJson);
    markTabDone('schedule');
    done.push('Schedule');
    updateMessage(progressId, '&#10003; All done! Your project is ready.<br><br>&#10003; Concept &nbsp;&#183;&nbsp; &#10003; Outline &nbsp;&#183;&nbsp; &#10003; Script &nbsp;&#183;&nbsp; &#10003; Storyboard &nbsp;&#183;&nbsp; &#10003; Breakdown &nbsp;&#183;&nbsp; &#10003; Schedule<br><br>Click any tab above to explore. Want me to refine anything?');
    switchLayer('script');
    // Auto-name the project from the script title
    if (conceptJson && conceptJson.title) {
      var p = projects.find(function(x) { return x.id === activeProject; });
      if (p) {
        p.name = conceptJson.title;
        p.summary = conceptJson.logline ? conceptJson.logline.slice(0, 80) + '...' : p.summary;
        lsSet('projects_meta', projects);
        renderProjects();
      }
    }
    saveCurrentProject();
    isStreaming = false;
    document.getElementById('sendBtn').style.opacity = '1';
  }).catch(function(err) {
    console.error('[ScriptAI generation error]', err);
    var hint = '';
    if (err.message.indexOf('429') >= 0 || err.message.toLowerCase().indexOf('rate') >= 0) {
      hint = 'The API is rate limited. Wait a minute then try again.';
    } else if (err.message.indexOf('529') >= 0 || err.message.toLowerCase().indexOf('overload') >= 0) {
      hint = 'The API is temporarily overloaded. Please try again in a moment.';
    } else if (err.message.toLowerCase().indexOf('empty') >= 0) {
      hint = 'The AI returned an empty response. This sometimes happens with long story ideas — try shortening your description and generating again.';
    } else if (err.message.toLowerCase().indexOf('network') >= 0 || err.message.toLowerCase().indexOf('failed to fetch') >= 0) {
      hint = 'Network error — check your internet connection and try again.';
    } else {
      hint = 'Open the browser console (F12) for details. Try again or rephrase your story idea.';
    }
    updateMessage(progressId, '&#9888; Generation failed: ' + err.message + '<br><br>' + hint);
    isStreaming = false;
    document.getElementById('sendBtn').style.opacity = '1';
  });
}

function sendChat() {
  if (isStreaming) return;
  if (!ensureAIReady()) return;
  var input = document.getElementById('chatInput');
  var val = input.value.trim();
  if (!val) return;
  input.value = '';
  input.style.height = 'auto';

  appendMessage('user', val);
  chatHistory.push({ role: 'user', content: val });
  // Auto-name project from first user message if still called 'New Project'
  var ap = projects.find(function(x) { return x.id === activeProject; });
  if (ap && ap.name === 'New Project') {
    var preview = val.slice(0, 40).trim();
    if (preview.length === 40) preview += '...';
    ap.name = preview;
    ap.summary = val.slice(0, 80);
    lsSet('projects_meta', projects);
    renderProjects();
  }
  saveCurrentProject();

  if (isGenerationIntent(val)) {
    var storyContext = chatHistory.map(function(m) { return m.role + ': ' + m.content; }).join('\n');
    runGeneration(storyContext);
    chatHistory.push({ role: 'assistant', content: 'Generating your complete project across all layers.' });
    return;
  }

  isStreaming = true;
  document.getElementById('sendBtn').style.opacity = '0.4';
  showTyping('typingIndicator');

  callAI(
    'You are Script AI, a creative partner for screenwriters and filmmakers. Help develop story concepts, outlines, scripts, storyboards, and breakdowns. Be conversational and imaginative. When the user has shared enough story detail, encourage them to say "generate my script" to create the full project.',
    chatHistory.map(function(m) { return m.role + ': ' + m.content; }).join('\n')
  ).then(function(aiText) {
    removeEl('typingIndicator');
    chatHistory.push({ role: 'assistant', content: aiText });
    appendMessage('ai', aiText);
    saveCurrentProject();
  }).catch(function(err) {
    removeEl('typingIndicator');
    console.error('[sendChat error]', err);
    var msg = err && err.message ? err.message : String(err);
    if (msg.indexOf('Failed to fetch') >= 0 || msg.indexOf('NetworkError') >= 0 || msg.indexOf('CORS') >= 0) {
      appendMessage('ai', '&#9888; Network error while contacting the AI service.<br><br>'
        + 'If you opened the app with file://, switch to http://localhost:3000. If you are using the server app, confirm the server is running and GEMINI_API_KEY is set.<br><br>'
        + 'If this persists, check the browser console (F12) for details.');
    } else {
      appendMessage('ai', '&#9888; Error: ' + msg);
    }
  }).then(function() {
    isStreaming = false;
    document.getElementById('sendBtn').style.opacity = '1';
  });
}

// ── UPLOAD ──
function triggerUpload() { document.getElementById('fileInput').click(); }
function handleFileUpload(input) {
  var file = input && input.files ? input.files[0] : null;
  if (!file) return;

  var lowerName = file.name.toLowerCase();
  var done = function(summary, bubbleHtml) {
    appendMessage('user', bubbleHtml);
    chatHistory.push({ role: 'user', content: summary });
    appendMessage('ai', 'Reference added. I can use it in the chat and generation flow.');
    chatHistory.push({ role: 'assistant', content: 'Reference added. I can use it in the chat and generation flow.' });
    saveCurrentProject();
    input.value = '';
  };

  if (/^text\//.test(file.type) || /\.txt$/.test(lowerName)) {
    var textReader = new FileReader();
    textReader.onload = function(ev) {
      var text = String(ev.target.result || '').trim();
      var excerpt = text.slice(0, 2000);
      done(
        'Uploaded text reference from ' + file.name + ':\n' + text.slice(0, 4000),
        'Uploaded text reference: <strong>' + escapeHTML(file.name) + '</strong><br><br>' + escapeHTML(excerpt || '(empty file)').replace(/\n/g, '<br>')
      );
    };
    textReader.readAsText(file);
    return;
  }

  if (/^image\//.test(file.type) || /\.(png|jpe?g|gif|webp)$/.test(lowerName)) {
    var imageReader = new FileReader();
    imageReader.onload = function(ev) {
      done(
        'Uploaded image reference: ' + file.name + '. Use it as visual inspiration for mood, wardrobe, sets, or storyboarding.',
        'Uploaded image reference: <strong>' + escapeHTML(file.name) + '</strong><br><br><img src="' + ev.target.result + '" alt="' + escapeHTML(file.name) + '" style="max-width:100%;border-radius:8px;">'
      );
    };
    imageReader.readAsDataURL(file);
    return;
  }

  if (file.type === 'application/pdf' || /\.pdf$/.test(lowerName)) {
    done(
      'Uploaded PDF reference: ' + file.name + '. The file is attached as a reference, but detailed PDF text extraction is not available in this browser-only build.',
      'Uploaded PDF reference: <strong>' + escapeHTML(file.name) + '</strong><br><br>I logged the file name and type for this project. Paste any key pages into the chat if you want me to use the actual text.'
    );
    return;
  }

  done(
    'Uploaded file reference: ' + file.name + '.',
    'Uploaded file reference: <strong>' + escapeHTML(file.name) + '</strong>'
  );
}

// ── MODAL ──
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  showStep('A');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
function handleOverlayClick(e) { if (e.target === e.currentTarget) closeModal(); }
function showStep(s) {
  document.querySelectorAll('.modal-step').forEach(function(el) { el.classList.remove('active'); });
  document.getElementById('step' + s).classList.add('active');
}
function goToStepA() { showStep('A'); }
function goToStepB() { showStep('B'); }
function goToStepC() {
  var checked = Array.from(document.querySelectorAll('#stepB .check-item.checked'))
    .map(function(el) { return el.querySelector('.check-label').textContent; });
  var list = document.getElementById('confirmList');
  list.innerHTML = checked.map(function(label) {
    return '<div class="confirm-item"><span class="check-icon">&#10003;</span>' + label + '</div>';
  }).join('');
  showStep('C');
}
function downloadPDF() {
  // Gather form fields
  var scriptName = (document.getElementById('scriptName') || {}).value || 'Untitled';
  var writtenBy  = (document.getElementById('writtenBy')  || {}).value || '';
  var emailAddr  = (document.getElementById('emailAddr')  || {}).value || '';
  var contactNum = (document.getElementById('contactNum') || {}).value || '';

  // Which sections to include
  var checked = Array.from(document.querySelectorAll('#stepB .check-item.checked'))
    .map(function(el) { return el.querySelector('.check-label').textContent.toLowerCase(); });

  // Build export HTML
  var body = '';

  // Title page
  body += '<div class="title-page">'
    + '<div class="title-page-title">' + scriptName + '</div>'
    + (writtenBy ? '<div class="title-page-by">Written by ' + writtenBy + '</div>' : '')
    + (emailAddr || contactNum
        ? '<div class="title-page-contact">' + [emailAddr, contactNum].filter(Boolean).join(' &nbsp;|&nbsp; ') + '</div>'
        : '')
    + '</div>';

  // Helper: get inner HTML of a layer
  function layerHTML(id) {
    var el = document.getElementById('layer-' + id);
    return el ? el.innerHTML : '';
  }

  if (checked.indexOf('concept') >= 0) {
    var ch = layerHTML('concept');
    if (ch && ch.indexOf('layer-empty') === -1) {
      body += '<div class="export-section"><h2 class="section-title">Concept</h2>' + ch + '</div>';
    }
  }
  if (checked.indexOf('outline') >= 0) {
    var oh = layerHTML('outline');
    if (oh && oh.indexOf('layer-empty') === -1) {
      body += '<div class="export-section"><h2 class="section-title">Outline</h2>' + oh + '</div>';
    }
  }
  if (checked.indexOf('script') >= 0) {
    var sh = layerHTML('script');
    if (sh && sh.indexOf('layer-empty') === -1) {
      body += '<div class="export-section script-export"><h2 class="section-title">Script</h2>' + sh + '</div>';
    }
  }
  if (checked.indexOf('storyboard') >= 0) {
    var sbh = layerHTML('storyboard');
    if (sbh && sbh.indexOf('layer-empty') === -1) {
      body += '<div class="export-section"><h2 class="section-title">Storyboard</h2>' + sbh + '</div>';
    }
  }
  if (checked.indexOf('breakdown') >= 0) {
    var bdh = layerHTML('breakdown');
    if (bdh && bdh.indexOf('layer-empty') === -1) {
      body += '<div class="export-section"><h2 class="section-title">Production Breakdown</h2>' + bdh + '</div>';
    }
  }
  if (checked.indexOf('schedule') >= 0) {
    var sch = layerHTML('schedule');
    if (sch && sch.indexOf('layer-empty') === -1) {
      body += '<div class="export-section"><h2 class="section-title">Schedule</h2>' + sch + '</div>';
    }
  }

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<title>' + scriptName + '</title>'
    + '<style>'
    + '* { box-sizing: border-box; margin: 0; padding: 0; }'
    + 'body { font-family: "Courier New", Courier, monospace; background: #fff; color: #111; font-size: 12pt; line-height: 1.6; }'
    + '.title-page { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; text-align:center; page-break-after:always; padding:60px; }'
    + '.title-page-title { font-size:32pt; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:24px; }'
    + '.title-page-by { font-size:14pt; margin-bottom:12px; }'
    + '.title-page-contact { font-size:11pt; color:#555; margin-top:8px; }'
    + '.export-section { padding:48px 60px; page-break-before:always; }'
    + '.script-export { font-family:"Courier New",Courier,monospace; }'
    + 'h2.section-title { font-size:11pt; text-transform:uppercase; letter-spacing:0.15em; border-bottom:1px solid #ccc; padding-bottom:8px; margin-bottom:32px; color:#555; }'
    + '.script-content { max-width:680px; margin:0 auto; }'
    + '.scene-heading { text-transform:uppercase; font-weight:700; margin:28px 0 12px; letter-spacing:0.04em; }'
    + '.action-line { margin-bottom:14px; }'
    + '.character-name { text-align:center; text-transform:uppercase; font-weight:700; margin:18px 0 2px; letter-spacing:0.06em; }'
    + '.parenthetical { text-align:center; font-style:italic; margin-bottom:4px; font-size:11pt; color:#444; }'
    + '.dialogue { margin:0 auto 16px; width:62%; text-align:left; }'
    // concept
    + '.concept-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }'
    + '.concept-card { border:1px solid #ddd; border-radius:8px; padding:16px; }'
    + '.concept-card.full { grid-column:1/-1; }'
    + '.card-label { font-size:9pt; text-transform:uppercase; letter-spacing:0.1em; color:#888; margin-bottom:6px; }'
    + '.card-title { font-size:18pt; font-weight:700; margin-bottom:8px; }'
    + '.card-text { font-size:11pt; line-height:1.5; }'
    + '.theme-tag { display:inline-block; padding:3px 10px; border:1px solid #ccc; border-radius:12px; font-size:10pt; margin:3px; }'
    + '.char-list { display:flex; flex-wrap:wrap; gap:10px; }'
    + '.char-card { display:flex; align-items:center; gap:8px; border:1px solid #ddd; border-radius:6px; padding:8px 12px; }'
    + '.char-avatar { width:28px; height:28px; border-radius:50%; background:#eee; display:flex; align-items:center; justify-content:center; font-size:13px; }'
    + '.char-info-name { font-weight:600; font-size:11pt; }'
    + '.char-info-role { font-size:10pt; color:#666; }'
    // outline
    + '.act-card { border:1px solid #ddd; border-radius:8px; padding:16px; margin-bottom:16px; }'
    + '.act-title { font-size:13pt; font-weight:700; margin-bottom:12px; }'
    + '.scene-item { padding:8px 0; border-bottom:1px solid #eee; }'
    + '.scene-item-title { font-weight:600; margin-bottom:4px; }'
    + '.scene-chars { font-size:10pt; color:#666; margin-bottom:4px; }'
    + '.plot-point { font-size:10pt; color:#555; padding-left:12px; position:relative; }'
    // storyboard
    + '.sb-scene-label { font-size:12pt; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin:24px 0 10px; }'
    + '.sb-rows { display:flex; flex-direction:column; gap:10px; }'
    + '.sb-row { display:grid; grid-template-columns:1.5fr 1fr 1fr 1fr 1fr; gap:8px; border:1px solid #ddd; border-radius:6px; padding:10px; }'
    + '.sb-cell-label { font-size:8pt; text-transform:uppercase; letter-spacing:0.1em; color:#888; margin-bottom:4px; }'
    + '.sb-cell-text { font-size:10pt; }'
    + '.sb-sketch-img { font-size:24pt; text-align:center; padding:10px; }'
    + '.sketch-controls { display:none; }'
    + 'img[alt="sketch"] { max-width:100%; max-height:120px; object-fit:cover; border-radius:4px; }'
    // breakdown
    + '.bd-scene-row { border:1px solid #ddd; border-radius:8px; padding:14px; margin-bottom:14px; }'
    + '.bd-scene-head { font-weight:700; text-transform:uppercase; font-size:10pt; letter-spacing:0.08em; margin-bottom:10px; }'
    + '.bd-row-cells { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }'
    + '.bd-cell-label { font-size:8pt; text-transform:uppercase; letter-spacing:0.1em; color:#888; margin-bottom:4px; }'
    + '.bd-mini-card { display:inline-block; padding:2px 8px; border:1px solid #ddd; border-radius:10px; font-size:9pt; margin:2px; }'
    + '.bd-text { font-size:10pt; }'
    // schedule
    + '.schedule-wrap { overflow:visible; }'
    + '.schedule-header, .sched-row { display:grid; gap:8px; margin-bottom:8px; }'
    + '.sched-scene-col { font-size:10pt; color:#666; padding:8px 0; }'
    + '.sched-day-col, .sched-scene-info, .sched-cell.empty, .sched-bar { border:1px solid #ddd; border-radius:6px; padding:10px; }'
    + '.sched-day-col { text-align:center; font-size:10pt; font-weight:700; text-transform:uppercase; }'
    + '.sched-scene-name { font-size:11pt; font-weight:700; margin-bottom:6px; }'
    + '.sched-scene-res { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }'
    + '.res-chip { display:inline-block; padding:2px 8px; border:1px solid #ddd; border-radius:10px; font-size:9pt; }'
    + '.sched-cell { min-height:54px; }'
    + '.sched-bar { height:100%; min-height:54px; display:flex; align-items:center; justify-content:center; font-size:10pt; font-weight:700; }'
    + '.sched-bar.planned { background:#f3f3f3; color:#555; }'
    + '.sched-bar.shooting { background:#eef9f1; color:#245b39; }'
    + '.sched-bar.completed { background:#eef4fb; color:#214b7a; }'
    + '.sched-bar.delayed { background:#fdeff3; color:#8b3653; }'
    + '@media print { body { margin:0; } .title-page, .export-section { page-break-before: always; } }'
    + '</style></head><body>'
    + body
    + '</body></html>';

  // Trigger download as .html file (opens in browser for print-to-PDF)
  var blob = new Blob([html], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = scriptName.replace(/[^a-z0-9\s\-_]/gi, '').trim().replace(/\s+/g, '_') + '_export.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  closeModal();
  var btn = document.querySelector('.btn-download');
  if (btn) {
    var orig = btn.innerHTML;
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg> Downloaded!';
    setTimeout(function() { btn.innerHTML = orig; }, 2500);
  }
}
function toggleCheck(el) {
  el.classList.toggle('checked');
  var box = el.querySelector('.check-box');
  box.textContent = el.classList.contains('checked') ? '&#10003;' : '';
}

// ── API KEY ──
function saveApiKey() {
  openLocalApp();
}

function clearApiKey() {
  localStorage.removeItem('gemini_api_key');
  localStorage.removeItem('anthropic_api_key');
  updateApiKeyUI();
  checkApiKey();
}

function handleApiKeyRowClick() {
  if (isDirectBrowserMode()) {
    openLocalApp();
  }
}


function checkApiKey() {
  var hasKey = !!getStoredApiKey();
  if (isDirectBrowserMode() && !hasKey) {
    showKeyBanner();
  } else {
    hideKeyBanner();
  }
  updateApiKeyUI();
}

function setupUploadArea() {
  var area = document.getElementById('uploadArea');
  var fileInput = document.getElementById('fileInput');
  if (!area || !fileInput) return;

  ['dragenter', 'dragover'].forEach(function(name) {
    area.addEventListener(name, function(e) {
      e.preventDefault();
      area.style.borderColor = 'var(--accent)';
    });
  });

  ['dragleave', 'drop'].forEach(function(name) {
    area.addEventListener(name, function(e) {
      e.preventDefault();
      area.style.borderColor = '';
    });
  });

  area.addEventListener('drop', function(e) {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files[0]) return;
    handleFileUpload({ files: e.dataTransfer.files, value: '' });
  });
}

// ── INIT ──
checkApiKey();
setupUploadArea();
renderProjects();
if (activeProject) {
  loadProjectChat(activeProject);
  loadSketchImages();
} else {
  var container = document.getElementById('chatMessages');
  container.innerHTML = '<div class="chat-welcome" id="chatWelcome">'
    + '<div class="chat-welcome-icon">&#10022;</div>'
    + '<div class="chat-welcome-text">Click &ldquo;+ New Project&rdquo; to start your first screenplay.</div></div>';
}
