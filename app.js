/* MyRandomToDo928 - app.js
 * 想到就记，纠结就抽。
 * 数据全部保存在浏览器 LocalStorage，key = randomtodo_items
 */
(function () {
  'use strict';

  /* ================= 常量 ================= */

  var LS_KEY = 'randomtodo_items';
  var BACKUP_HEADER = 'RANDOMTODO_BACKUP_V1';
  var APP_NAME = 'MyRandomToDo928';
  var APP_VERSION = '1.0.0';

  var TYPES = ['work', 'life', 'fun', 'idea'];
  var TYPE_NAME = { work: '工作 / 学习', life: '日常生活', fun: '娱乐', idea: 'Idea' };
  var TYPE_EMOJI = { work: '📚', life: '🏠', fun: '🎮', idea: '💡' };
  var DRAW_TYPES = ['work', 'life', 'fun']; // 参与随机抽取的分类

  var PREF_NAME = { more: '多抽到', normal: '普通', less: '少抽到' };
  var WEIGHT = { more: 3, normal: 1, less: 0.35 }; // 工作/学习 的抽取倾向权重

  /* ================= 状态 ================= */

  var items = loadItems();

  var state = {
    view: 'home',          // home | scope | result | category | done | data
    cat: null,             // 当前分类页
    scope: null,           // 抽取范围 work | life | fun | all
    drawnId: null,         // 本次抽到的任务 id
    lastDrawnId: null,     // 上一个抽到的 id（用于“换一个”去重）
    sheet: null,           // add | edit
    addType: 'work',
    editingId: null,
    editType: null,
    editPref: 'normal',
    batch: false,
    selected: {},
    restoreOpen: false
  };

  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  /* ================= 数据层 ================= */

  function loadItems() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveItems() {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function newItem(text, type) {
    return {
      id: uid(),
      text: text,
      type: type,
      createdAt: Date.now(),
      done: false,
      active: false,
      completedAt: null,
      drawPreference: 'normal'
    };
  }

  function findItem(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function activeItem() {
    for (var i = 0; i < items.length; i++) if (items[i].active) return items[i];
    return null;
  }

  function pendingByType(type) {
    return items.filter(function (it) {
      return it.type === type && !it.done && !it.active;
    });
  }

  function drawPool(scope) {
    return items.filter(function (it) {
      if (it.done || it.active) return false;
      if (it.type === 'idea') return false;
      if (scope !== 'all' && it.type !== scope) return false;
      return true;
    });
  }

  function weightOf(it) {
    if (it.type === 'work') return WEIGHT[it.drawPreference] || 1;
    return 1; // 生活、娱乐权重始终为 1
  }

  function weightedPick(pool, excludeId) {
    var cand = pool;
    if (excludeId && pool.length >= 2) {
      var filtered = pool.filter(function (it) { return it.id !== excludeId; });
      if (filtered.length > 0) cand = filtered;
    }
    var total = 0;
    var ws = cand.map(function (it) { total += weightOf(it); return weightOf(it); });
    var r = Math.random() * total;
    for (var i = 0; i < cand.length; i++) {
      r -= ws[i];
      if (r < 0) return cand[i];
    }
    return cand[cand.length - 1];
  }

  /* ================= 工具 ================= */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }

  /* ================= 路由与渲染 ================= */

  function show(view, patch) {
    state.view = view;
    if (patch) for (var k in patch) state[k] = patch[k];
    render();
    window.scrollTo(0, 0);
  }

  function openSheet(name, patch) {
    state.sheet = name;
    if (patch) for (var k in patch) state[k] = patch[k];
    render();
    var input = document.getElementById('sheet-input');
    if (input) input.focus();
  }

  function closeSheet() {
    state.sheet = null;
    state.editingId = null;
    state.restoreOpen = false;
    render();
  }

  function render() {
    clearSheets();
    var html = '';
    if (state.view === 'home') html = renderHome();
    else if (state.view === 'scope') html = renderScope();
    else if (state.view === 'result') html = renderResult();
    else if (state.view === 'category') html = renderCategory();
    else if (state.view === 'done') html = renderDone();
    else if (state.view === 'data') html = renderData();
    app.innerHTML = html;

    if (state.sheet === 'add') appendSheet(renderAddSheet());
    else if (state.sheet === 'edit') appendSheet(renderEditSheet());
  }

  function appendSheet(innerHtml) {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="sheet-backdrop" data-action="closeSheet"></div>' +
      '<div class="sheet">' + innerHtml + '</div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  function clearSheets() {
    var els = document.querySelectorAll('.sheet, .sheet-backdrop');
    for (var i = 0; i < els.length; i++) els[i].parentNode.removeChild(els[i]);
  }

  /* ================= 首页 ================= */

  function renderHome() {
    var act = activeItem();
    var h = '';
    h += '<div class="home-header">' +
      '<div class="home-title">MyRandomToDo928</div>' +
      '<div class="home-subtitle">想到就记，纠结就抽。</div></div>';

    h += '<button class="btn-primary" data-action="openDraw">🎲 随机抽一个</button>';

    if (act) {
      h += '<div class="active-card">' +
        '<div class="active-label">正在做</div>' +
        '<div class="active-text">' + esc(act.text) + '</div>' +
        '<div class="active-actions">' +
        '<button class="btn-later" data-action="postponeActive">待会做</button>' +
        '<button class="btn-finish" data-action="completeActive">完成</button>' +
        '</div></div>';
    }

    h += '<div class="section-title">我的空间</div>';
    h += '<div class="cat-grid">';
    TYPES.forEach(function (t) {
      var count = pendingByType(t).length;
      h += '<button class="cat-card" data-action="openCategory" data-cat="' + t + '">' +
        '<div class="cat-name">' + TYPE_EMOJI[t] + ' ' + TYPE_NAME[t] + '</div>' +
        '<div class="cat-count">' + count + '</div></button>';
    });
    h += '</div>';

    h += '<button class="link-row" data-action="openDone">' +
      '<span>✓ 已完成任务</span><span class="arrow">›</span></button>';
    h += '<button class="link-row" data-action="openData">' +
      '<span>⚙️ 数据管理</span><span class="arrow">›</span></button>';

    if (!state.batch) {
      h += '<button class="fab-add" data-action="openAdd">＋ 添加</button>';
    }
    return h;
  }

  /* ================= 随机抽取 ================= */

  function renderScope() {
    var h = backRow('随机抽一个') + '<div class="page-title">从哪里抽？</div>';
    h += '<div class="scope-list">';
    DRAW_TYPES.forEach(function (t) {
      h += '<button class="scope-btn" data-action="setScope" data-scope="' + t + '">' +
        TYPE_EMOJI[t] + ' ' + TYPE_NAME[t] +
        '<span class="muted">' + drawPool(t).length + ' 项</span></button>';
    });
    h += '<button class="scope-btn" data-action="setScope" data-scope="all">✨ 全部' +
      '<span class="muted">' + drawPool('all').length + ' 项</span></button>';
    h += '</div>';
    return h;
  }

  function doDraw() {
    var pool = drawPool(state.scope);
    if (pool.length === 0) {
      toast('这个范围里暂时没有可抽的任务');
      return false;
    }
    var picked = weightedPick(pool, state.lastDrawnId);
    state.drawnId = picked.id;
    state.lastDrawnId = picked.id;
    return true;
  }

  function renderResult() {
    var it = findItem(state.drawnId);
    if (!it) return renderScope();
    var h = backRow('换一个', 'data-action="backScope"') +
      '<div class="card result-card">' +
      '<div class="result-label">今天就做这个</div>' +
      '<div class="result-type">' + TYPE_EMOJI[it.type] + ' ' + TYPE_NAME[it.type] + '</div>' +
      '<div class="result-text">' + esc(it.text) + '</div>' +
      '</div>';
    h += '<div class="result-actions">' +
      '<button class="btn-primary" data-action="acceptDraw">✅ 就做这个</button>' +
      '<button class="btn-secondary" data-action="redraw">🎲 换一个</button>' +
      '<button class="btn-secondary" data-action="completeDraw">✓ 已完成</button>' +
      '<button class="btn-secondary" data-action="backScope">↩ 重新选择范围</button>' +
      '</div>';
    return h;
  }

  /* ================= 分类页 ================= */

  function catItems(cat) {
    return items.filter(function (it) { return it.type === cat && !it.done; });
  }

  function renderCategory() {
    var cat = state.cat;
    var isIdea = cat === 'idea';
    var list = catItems(cat);
    var h = backRow(TYPE_NAME[cat]);
    h += '<div class="page-title">' + TYPE_EMOJI[cat] + ' ' + TYPE_NAME[cat] +
      '<span class="muted" style="font-size:15px;font-weight:400">　' + list.length + ' 项</span></div>';

    if (list.length === 0) {
      h += '<div class="empty-tip">这里还是空的<br>点下方 ＋ 添加 记点什么吧</div>';
    } else {
      if (!state.batch) {
        h += '<button class="btn-secondary" style="margin-bottom:12px" data-action="enterBatch">批量管理</button>';
      }
      h += '<div class="todo-list">';
      list.forEach(function (it) {
        h += todoItemHtml(it, isIdea);
      });
      h += '</div>';
    }

    if (state.batch) h += batchBarHtml(isIdea ? ['全选', '删除'] : ['全选', '完成', '删除']);
    else h += '<button class="fab-add" data-action="openAdd">＋ 添加</button>';
    return h;
  }

  function todoItemHtml(it, isIdea) {
    var cls = 'todo-item' + (isIdea ? ' idea' : '') + (state.batch ? ' batch-on' : '');
    var h = '<div class="' + cls + '">';
    if (state.batch) {
      var on = state.selected[it.id] ? ' on' : '';
      var tick = state.selected[it.id] ? '✓' : '';
      h += '<button class="batch-check' + on + '" data-action="toggleSelect" data-id="' + it.id + '">' + tick + '</button>';
    } else {
      if (isIdea) h += '<span class="todo-dot"></span>';
      else h += '<button class="todo-check" data-action="quickDone" data-id="' + it.id + '" aria-label="完成"></button>';
    }
    h += '<div class="todo-text">' + esc(it.text);
    if (it.type === 'work' && it.drawPreference && it.drawPreference !== 'normal') {
      h += '<span class="pref">抽取倾向：' + PREF_NAME[it.drawPreference] + '</span>';
    }
    h += '</div>';
    if (!state.batch) {
      h += '<button class="todo-more" data-action="openEdit" data-id="' + it.id + '">···</button>';
    }
    h += '</div>';
    return h;
  }

  function batchBarHtml(actions) {
    var count = Object.keys(state.selected).length;
    var h = '<div class="batch-bar"><div class="batch-count">已选 ' + count + ' 项</div><div class="batch-bar-inner">';
    h += '<button data-action="selectAll">全选</button>';
    if (actions.indexOf('完成') >= 0) h += '<button class="primary" data-action="batchComplete">批量完成</button>';
    if (actions.indexOf('恢复') >= 0) h += '<button class="primary" data-action="batchRestore">批量恢复</button>';
    if (actions.indexOf('删除') >= 0) h += '<button class="danger" data-action="batchDelete">批量删除</button>';
    h += '<button data-action="exitBatch">取消</button>';
    h += '</div></div>';
    return h;
  }

  /* ================= 已完成 ================= */

  function renderDone() {
    var list = items.filter(function (it) { return it.done; });
    list.sort(function (a, b) { return (b.completedAt || 0) - (a.completedAt || 0); });

    var h = backRow('已完成任务') + '<div class="page-title">✓ 已完成任务</div>';
    if (list.length === 0) {
      h += '<div class="empty-tip">还没有已完成的任务</div>';
      return h;
    }
    if (!state.batch) {
      h += '<button class="btn-secondary" style="margin-bottom:12px" data-action="enterBatch">批量管理</button>';
    }
    list.forEach(function (it) {
      var cls = 'done-item' + (state.batch ? ' batch-on' : '');
      h += '<div class="' + cls + '" style="display:flex;align-items:center;gap:12px">' +
        '<div style="flex:1">' +
        '<div class="done-text">' + esc(it.text) + '</div>' +
        '<div class="done-meta">原分类：' + TYPE_EMOJI[it.type] + ' ' + TYPE_NAME[it.type] +
        '<br>创建：' + fmtTime(it.createdAt) + '　完成：' + fmtTime(it.completedAt) + '</div>';
      if (!state.batch) {
        h += '<button class="done-restore" data-action="restoreItem" data-id="' + it.id + '">恢复</button>';
      }
      h += '</div>';
      if (state.batch) {
        var on = state.selected[it.id] ? ' on' : '';
        var tick = state.selected[it.id] ? '✓' : '';
        h += '<button class="batch-check' + on + '" data-action="toggleSelect" data-id="' + it.id + '">' + tick + '</button>';
      }
      h += '</div>';
    });
    if (state.batch) h += batchBarHtml(['全选', '恢复', '删除']);
    return h;
  }

  /* ================= 数据管理 ================= */

  function renderData() {
    var total = items.length;
    var doing = items.filter(function (it) { return it.active; }).length;
    var doneCnt = items.filter(function (it) { return it.done; }).length;
    var ideaCnt = items.filter(function (it) { return it.type === 'idea'; }).length;
    var pending = items.filter(function (it) { return !it.done && !it.active && it.type !== 'idea'; }).length;

    var h = backRow('数据管理') + '<div class="page-title">⚙️ 数据管理</div>';
    h += '<div class="stat-grid">' +
      statHtml(total, '全部记录') + statHtml(pending, '待做事项') +
      statHtml(doing, '正在做') + statHtml(doneCnt, '已完成') +
      statHtml(ideaCnt, 'Idea') +
      '</div>';

    h += '<div class="data-actions">' +
      '<button class="btn-secondary" data-action="copyBackup">📋 复制备份</button>' +
      '<button class="btn-secondary" data-action="restoreBackup">📥 恢复备份</button>' +
      '<button class="btn-danger" data-action="clearAll">🗑 清空全部数据</button>' +
      '</div>';

    if (state.restoreOpen) {
      h += '<div style="margin-top:16px" class="card">' +
        '<div class="sheet-label">粘贴备份文本（第一行应为 ' + BACKUP_HEADER + '）：</div>' +
        '<textarea id="restore-input" class="text-input" placeholder="' + BACKUP_HEADER + '\n{...}"></textarea>' +
        '<div class="sheet-actions-row">' +
        '<button class="btn-secondary" data-action="cancelRestore">取消</button>' +
        '<button class="btn-primary" data-action="confirmRestore">确认恢复</button>' +
        '</div></div>';
    }
    return h;
  }

  function statHtml(num, name) {
    return '<div class="stat-card"><div class="stat-num">' + num + '</div><div class="stat-name">' + name + '</div></div>';
  }

  /* ================= 添加 / 编辑弹层 ================= */

  function typePickerHtml(current, action) {
    var h = '<div class="type-picker">';
    TYPES.forEach(function (t) {
      h += '<button class="type-chip' + (current === t ? ' on' : '') + '" data-action="' + action + '" data-type="' + t + '">' +
        TYPE_EMOJI[t] + ' ' + TYPE_NAME[t] + '</button>';
    });
    return h + '</div>';
  }

  function renderAddSheet() {
    var h = '<div class="sheet-title">记点什么？</div>' +
      '<div class="sheet-label">放到哪里？</div>' +
      typePickerHtml(state.addType, 'setAddType') +
      '<input id="sheet-input" class="text-input" type="text" maxlength="200" enterkeyhint="done" ' +
      'placeholder="输入一句话，按完成即可保存">' +
      '<div class="sheet-actions">' +
      '<button class="btn-primary" data-action="saveAdd">保存</button>' +
      '</div>';
    return h;
  }

  function renderEditSheet() {
    var it = findItem(state.editingId);
    if (!it) return '';
    var h = '<div class="sheet-title">编辑</div>' +
      '<div class="sheet-label">任务内容</div>' +
      '<input id="sheet-input" class="text-input" type="text" maxlength="200" enterkeyhint="done" value="' +
      esc(it.text) + '">' +
      '<div class="sheet-label">分类</div>' +
      typePickerHtml(state.editType, 'setEditType');

    if (state.editType === 'work') {
      h += '<div class="sheet-label" style="margin-top:14px">抽取倾向</div>' +
        '<div class="type-picker">';
      ['more', 'normal', 'less'].forEach(function (p) {
        h += '<button class="type-chip' + (state.editPref === p ? ' on' : '') + '" data-action="setEditPref" data-pref="' + p + '">' +
          PREF_NAME[p] + '</button>';
      });
      h += '</div>';
    }

    h += '<div class="sheet-actions" style="margin-top:16px">' +
      '<button class="btn-primary" data-action="saveEdit">保存</button>' +
      '<button class="btn-danger" data-action="deleteEdit">删除该任务</button>' +
      '</div>';
    return h;
  }

  /* ================= 公共片段 ================= */

  function backRow(label, attrs) {
    if (!attrs) attrs = 'data-action="goHome"';
    return '<div class="back-row"><button class="back-btn" ' + attrs + '>‹ ' + esc(label) + '</button></div>';
  }

  /* ================= 备份 ================= */

  function buildBackupText() {
    var data = {
      app: APP_NAME,
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      items: items
    };
    return BACKUP_HEADER + '\n' + JSON.stringify(data);
  }

  function parseBackupText(text) {
    if (typeof text !== 'string') return null;
    var lines = text.split('\n');
    if (lines[0].trim() !== BACKUP_HEADER) return null;
    var jsonText = lines.slice(1).join('\n').trim();
    if (!jsonText) return null;
    var data;
    try { data = JSON.parse(jsonText); } catch (e) { return null; }
    if (!data || !Array.isArray(data.items)) return null;
    var cleaned = data.items.filter(function (it) {
      return it && typeof it.text === 'string' && TYPES.indexOf(it.type) >= 0;
    }).map(function (it) {
      return {
        id: typeof it.id === 'string' ? it.id : uid(),
        text: it.text,
        type: it.type,
        createdAt: typeof it.createdAt === 'number' ? it.createdAt : Date.now(),
        done: !!it.done,
        active: false, // 恢复后不允许存在多个“正在做”
        completedAt: typeof it.completedAt === 'number' ? it.completedAt : null,
        drawPreference: PREF_NAME[it.drawPreference] ? it.drawPreference : 'normal'
      };
    });
    return cleaned;
  }

  /* ================= 动作 ================= */

  var actions = {
    goHome: function () { show('home', { batch: false, selected: {} }); },

    openAdd: function () { openSheet('add', { addType: state.view === 'category' ? state.cat : 'work' }); },
    setAddType: function (d) { state.addType = d.type; refreshSheet(); },
    saveAdd: function () {
      var input = document.getElementById('sheet-input');
      var text = input ? input.value.trim() : '';
      if (!text) { toast('先写点什么吧'); return; }
      items.unshift(newItem(text, state.addType));
      saveItems();
      closeSheet();
      toast('已保存');
    },

    openEdit: function (d) {
      var it = findItem(d.id);
      if (!it) return;
      openSheet('edit', { editingId: it.id, editType: it.type, editPref: it.drawPreference || 'normal' });
    },
    setEditType: function (d) { state.editType = d.type; refreshSheet(); },
    setEditPref: function (d) { state.editPref = d.pref; refreshSheet(); },
    saveEdit: function () {
      var it = findItem(state.editingId);
      var input = document.getElementById('sheet-input');
      if (!it || !input) return;
      var text = input.value.trim();
      if (!text) { toast('内容不能为空'); return; }
      it.text = text;
      it.type = state.editType;
      if (it.type === 'work') it.drawPreference = state.editPref;
      else it.drawPreference = 'normal';
      saveItems();
      closeSheet();
      toast('已保存');
    },
    deleteEdit: function () {
      var it = findItem(state.editingId);
      if (!it) return;
      if (!confirm('删除这条任务？')) return;
      items = items.filter(function (x) { return x.id !== it.id; });
      saveItems();
      closeSheet();
      toast('已删除');
    },

    quickDone: function (d) {
      var it = findItem(d.id);
      if (!it) return;
      it.done = true;
      it.active = false;
      it.completedAt = Date.now();
      saveItems();
      render();
      toast('已完成');
    },

    /* ---- 正在做 ---- */
    postponeActive: function () {
      var it = activeItem();
      if (!it) return;
      it.active = false; // 回到原来的随机池
      saveItems();
      render();
      toast('已放回随机池');
    },
    completeActive: function () {
      var it = activeItem();
      if (!it) return;
      it.done = true;
      it.active = false;
      it.completedAt = Date.now();
      saveItems();
      render();
      toast('已完成，干得漂亮');
    },

    /* ---- 随机 ---- */
    openDraw: function () {
      if (activeItem()) { toast('先处理正在做的任务'); return; }
      show('scope', { scope: null });
    },
    setScope: function (d) {
      if (activeItem()) { toast('先处理正在做的任务'); return; }
      state.scope = d.scope;
      if (doDraw()) show('result');
    },
    redraw: function () {
      if (doDraw()) render();
    },
    backScope: function () { show('scope'); },
    acceptDraw: function () {
      var it = findItem(state.drawnId);
      if (!it) return;
      it.active = true;
      it.done = false;
      saveItems();
      show('home');
      toast('开始吧！');
    },
    completeDraw: function () {
      var it = findItem(state.drawnId);
      if (!it) return;
      it.done = true;
      it.active = false;
      it.completedAt = Date.now();
      saveItems();
      show('home');
      toast('已完成');
    },

    /* ---- 分类 / 已完成 ---- */
    openCategory: function (d) { show('category', { cat: d.cat, batch: false, selected: {} }); },
    openDone: function () { show('done', { batch: false, selected: {} }); },
    restoreItem: function (d) {
      var it = findItem(d.id);
      if (!it) return;
      it.done = false;
      it.active = false;
      it.completedAt = null;
      saveItems();
      render();
      toast('已恢复');
    },

    /* ---- 批量 ---- */
    enterBatch: function () { state.batch = true; state.selected = {}; render(); },
    exitBatch: function () { show(state.view === 'done' ? 'done' : 'category', { batch: false, selected: {} }); },
    toggleSelect: function (d) {
      if (state.selected[d.id]) delete state.selected[d.id];
      else state.selected[d.id] = true;
      render();
    },
    selectAll: function () {
      var list = state.view === 'done'
        ? items.filter(function (it) { return it.done; })
        : catItems(state.cat);
      var all = Object.keys(state.selected).length === list.length && list.length > 0;
      state.selected = {};
      if (!all) list.forEach(function (it) { state.selected[it.id] = true; });
      render();
    },
    batchComplete: function () {
      var ids = state.selected;
      var n = 0;
      items.forEach(function (it) {
        if (ids[it.id] && !it.done) {
          it.done = true; it.active = false; it.completedAt = Date.now(); n++;
        }
      });
      saveItems();
      show(state.view, { batch: false, selected: {} });
      toast('已完成 ' + n + ' 项');
    },
    batchRestore: function () {
      var ids = state.selected;
      var n = 0;
      items.forEach(function (it) {
        if (ids[it.id] && it.done) {
          it.done = false; it.active = false; it.completedAt = null; n++;
        }
      });
      saveItems();
      show('done', { batch: false, selected: {} });
      toast('已恢复 ' + n + ' 项');
    },
    batchDelete: function () {
      var ids = state.selected;
      var n = Object.keys(ids).length;
      if (n === 0) { toast('先选择要操作的项'); return; }
      if (!confirm('确定删除选中的 ' + n + ' 项？删除后无法恢复。')) return;
      items = items.filter(function (it) { return !ids[it.id]; });
      saveItems();
      show(state.view, { batch: false, selected: {} });
      toast('已删除');
    },

    /* ---- 数据管理 ---- */
    openData: function () { show('data', { restoreOpen: false }); },
    copyBackup: function () {
      var text = buildBackupText();
      function ok() { toast('备份已复制到剪贴板'); }
      function fail() {
        // 剪贴板不可用时，显示文本让用户手动复制
        state.restoreOpen = false;
        prompt('复制下面的备份文本：', text);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, function () { legacyCopy(text) ? ok() : fail(); });
      } else {
        legacyCopy(text) ? ok() : fail();
      }
    },
    restoreBackup: function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (text) {
          var parsed = parseBackupText(text);
          if (parsed) applyRestore(parsed);
          else { state.restoreOpen = true; render(); toast('未在剪贴板找到有效备份，请手动粘贴'); }
        }, function () {
          state.restoreOpen = true;
          render();
        });
      } else {
        state.restoreOpen = true;
        render();
      }
    },
    cancelRestore: function () { state.restoreOpen = false; render(); },
    confirmRestore: function () {
      var ta = document.getElementById('restore-input');
      var parsed = ta ? parseBackupText(ta.value) : null;
      if (!parsed) { toast('备份格式不正确'); return; }
      applyRestore(parsed);
    },
    clearAll: function () {
      if (!confirm('清空全部数据后无法恢复，确定继续？')) return;
      if (!confirm('再次确认：真的要清空所有数据吗？')) return;
      items = [];
      saveItems();
      render();
      toast('已清空全部数据');
    },

    closeSheet: function () { closeSheet(); }
  };

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function applyRestore(parsed) {
    if (!confirm('恢复备份将覆盖当前数据，是否继续？')) return;
    items = parsed;
    saveItems();
    state.restoreOpen = false;
    show('home');
    toast('已恢复 ' + items.length + ' 条记录');
  }

  function refreshSheet() {
    render(); // 重建弹层以保持滚动位置可接受；随后把焦点还给输入框
    var input = document.getElementById('sheet-input');
    if (input) {
      var v = input.value;
      input.focus();
      input.value = '';
      input.value = v;
    }
  }

  /* ================= 事件绑定 ================= */

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (!t) return;
    var fn = actions[t.dataset.action];
    if (fn) fn(t.dataset);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'sheet-input') {
      if (state.sheet === 'add') actions.saveAdd();
      else if (state.sheet === 'edit') actions.saveEdit();
    }
    if (e.key === 'Escape' && state.sheet) closeSheet();
  });

  document.addEventListener('input', function (e) {
    // 弹层内输入时无需额外处理，保留以便扩展
  });

  /* ================= Service Worker ================= */

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* 本地 file:// 打开时忽略 */ });
    });
  }

  /* ================= 启动 ================= */

  render();
})();
