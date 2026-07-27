/* app.js — views, interactions, and rendering for Line Sweep Pro. */
(function () {
  'use strict';

  var S = window.Store;
  var M = window.Motion;

  var viewRoot = document.getElementById('viewRoot');
  var viewTitle = document.getElementById('viewTitle');
  var viewSubtitle = document.getElementById('viewSubtitle');
  var modalHost = document.getElementById('modalHost');
  var toastHost = document.getElementById('toastHost');
  var searchInput = document.getElementById('searchInput');

  var currentView = 'board';
  var query = '';

  // ---- Tiny DOM helpers -----------------------------------------------------

  function el(tag, cls, attrs) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function fmtDateFull(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function avatar(person, size) {
    var a = el('span', 'avatar', { title: person ? person.name + ' · ' + person.role : 'Unassigned' });
    if (size) a.style.setProperty('--sz', size + 'px');
    if (person) {
      a.style.background = '#868da0';   // neutral — avatars identify by initials, not colour
      a.textContent = person.initials;
    } else {
      a.classList.add('avatar--empty');
      a.textContent = '?';
    }
    return a;
  }

  // Overlapping avatars for a project's assignees (lead first), + "N" overflow.
  function avatarStack(ids, size) {
    size = size || 28;
    var wrap = el('span', 'avatar-stack');
    var people = (ids || []).map(function (id) { return S.personById(id); }).filter(Boolean);
    if (!people.length) { wrap.appendChild(avatar(null, size)); return wrap; }
    var overlap = Math.round(size * 0.4);
    people.slice(0, 3).forEach(function (person, i) {
      var a = avatar(person, size);
      if (i > 0) a.style.marginLeft = '-' + overlap + 'px';
      a.style.zIndex = String(10 - i);
      wrap.appendChild(a);
    });
    if (people.length > 3) {
      var more = el('span', 'avatar avatar--more', { text: '+' + (people.length - 3), title: people.slice(3).map(function (p) { return p.name; }).join(', ') });
      more.style.setProperty('--sz', size + 'px');
      more.style.marginLeft = '-' + overlap + 'px';
      wrap.appendChild(more);
    }
    return wrap;
  }

  // The status pill carries the PROJECT's colour (identity). Priority decides
  // fill vs. outline: high/critical projects are filled solid, everything else
  // wears the colour as an outline + text.
  function statusPill(p) {
    var meta = S.statusMeta(p.status);
    var strong = (p.priority === 'high' || p.priority === 'critical');
    var pill = el('button', 'pill pill--status ' + (strong ? 'pill--fill' : 'pill--stroke'),
      { 'data-project': p.id, 'data-field': 'status', text: meta.label });
    pill.style.setProperty('--pjc', p.color || '#5a63ad');
    return pill;
  }

  function priorityPill(p) {
    var meta = S.priorityMeta(p.priority);
    var pill = el('button', 'pill pill--priority', { 'data-project': p.id, 'data-field': 'priority', text: meta.label });
    pill.style.setProperty('--pc', meta.color);
    return pill;
  }

  function healthDot(p) {
    var h = S.projectHealth(p);
    return el('span', 'hdot hdot--' + h.level, { title: h.label });
  }

  // ---- Toast ----------------------------------------------------------------

  function toast(msg, kind) {
    var t = el('div', 'toast toast--' + (kind || 'info'), { text: msg });
    toastHost.appendChild(t);
    M.enter(t, { y: 16 });
    setTimeout(function () {
      var out = t.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(8px)' }],
        { duration: 220, easing: M.EASE.inOut, fill: 'both' });
      out.finished.then(function () { t.remove(); });
    }, 2400);
  }

  // ---- Popover (Monday-style quick edit) ------------------------------------

  var activePopover = null;
  function closePopover() {
    if (activePopover) { activePopover.remove(); activePopover = null; document.removeEventListener('mousedown', onDocDown, true); }
  }
  function onDocDown(e) {
    if (activePopover && !activePopover.contains(e.target)) closePopover();
  }

  function openPopover(anchor, buildContent) {
    closePopover();
    var pop = el('div', 'popover');
    buildContent(pop);
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8);
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    activePopover = pop;
    M.enter(pop, { y: 6, duration: 220 });
    setTimeout(function () { document.addEventListener('mousedown', onDocDown, true); }, 0);
  }

  function openStatusMenu(anchor, project) {
    openPopover(anchor, function (pop) {
      pop.classList.add('popover--swatches');
      S.STATUSES.forEach(function (s) {
        var opt = el('button', 'swatch', { text: s.label });
        opt.style.background = s.color;
        opt.addEventListener('click', function () {
          S.updateProject(project.id, { status: s.id }, { field: 'status' });
          closePopover();
        });
        pop.appendChild(opt);
      });
    });
  }

  function openPriorityMenu(anchor, project) {
    openPopover(anchor, function (pop) {
      pop.classList.add('popover--swatches');
      S.PRIORITIES.forEach(function (s) {
        var opt = el('button', 'swatch', { text: s.label });
        opt.style.background = s.color;
        opt.addEventListener('click', function () {
          S.updateProject(project.id, { priority: s.id }, { field: 'priority' });
          closePopover();
        });
        pop.appendChild(opt);
      });
    });
  }

  // Multi-select: toggle people on/off a project; the first stays the lead.
  function openAssigneeMenu(anchor, project) {
    openPopover(anchor, function (pop) {
      pop.classList.add('popover--people');
      pop.appendChild(el('div', 'popover__label', { text: 'Assigned people' }));
      S.state.people.forEach(function (person) {
        var opt = el('button', 'people-opt');
        var check = el('span', 'people-opt__check');
        opt.appendChild(avatar(person, 26));
        opt.appendChild(el('span', 'people-opt__name', { text: person.name }));
        opt.appendChild(check);
        function sync() {
          var on = (project.assigneeIds || []).indexOf(person.id) !== -1;
          opt.classList.toggle('is-on', on);
          check.innerHTML = on ? checkSVG() : '';
        }
        opt.addEventListener('click', function () {
          var ids = (project.assigneeIds || []).slice();
          var idx = ids.indexOf(person.id);
          if (idx === -1) ids.push(person.id);
          else if (ids.length > 1) ids.splice(idx, 1); // always keep at least one
          S.updateProject(project.id, { assigneeIds: ids }, { field: 'owner' });
          sync();
        });
        sync();
        pop.appendChild(opt);
      });
    });
  }

  function openProgressMenu(anchor, project) {
    openPopover(anchor, function (pop) {
      pop.classList.add('popover--progress');
      var label = el('div', 'popover__label', { text: 'Progress: ' + project.progress + '%' });
      var slider = el('input', 'range', { type: 'range', min: '0', max: '100', step: '5', value: project.progress });
      slider.addEventListener('input', function () {
        label.textContent = 'Progress: ' + slider.value + '%';
      });
      slider.addEventListener('change', function () {
        S.updateProject(project.id, { progress: parseInt(slider.value, 10) }, { field: 'progress' });
      });
      pop.appendChild(label);
      pop.appendChild(slider);
    });
  }

  // ---- Right-click context menus --------------------------------------------

  // A popover anchored to the cursor rather than an element.
  function openContextMenuAt(x, y, build) {
    closePopover();
    var pop = el('div', 'popover popover--context');
    build(pop);
    document.body.appendChild(pop);
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.min(x, window.innerWidth - pw - 8);
    var top = Math.min(y, window.innerHeight - ph - 8);
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = Math.max(8, top) + 'px';
    activePopover = pop;
    M.enter(pop, { y: 6, duration: 180 });
    setTimeout(function () { document.addEventListener('mousedown', onDocDown, true); }, 0);
  }

  // Column header menu: greyscale toggle + show/hide columns.
  // colKey === null is the fixed Project (name) column, which gets name-colour
  // options instead of a plain greyscale toggle.
  function openColumnMenuAt(x, y, colKey) {
    openContextMenuAt(x, y, function (pop) {
      if (colKey) {
        var col = S.columnByKey(colKey);
        var g = el('button', 'ctx-item', { text: col.greyscale ? 'Restore colour' : 'Make greyscale' });
        g.addEventListener('click', function () { S.toggleColumnGreyscale(colKey); closePopover(); });
        pop.appendChild(g);
        pop.appendChild(el('div', 'ctx-sep'));
      } else {
        pop.appendChild(el('div', 'ctx-label', { text: 'Project names' }));
        var cur = (S.state.settings && S.state.settings.nameStyle) || 'colour';
        [['colour', 'Project colour'], ['grey', 'Greyscale'], ['dark', 'Dark greyscale']].forEach(function (o) {
          var item = el('button', 'ctx-item ctx-item--check' + (cur === o[0] ? ' is-on' : ''));
          item.appendChild(el('span', 'ctx-check', { html: cur === o[0] ? checkSVG() : '' }));
          item.appendChild(el('span', 'ctx-item__label', { text: o[1] }));
          item.addEventListener('click', function () { S.setNameStyle(o[0]); closePopover(); });
          pop.appendChild(item);
        });
        pop.appendChild(el('div', 'ctx-sep'));
      }
      pop.appendChild(el('div', 'ctx-label', { text: 'Show columns' }));
      S.state.columns.forEach(function (c) {
        var item = el('button', 'ctx-item ctx-item--check' + (c.visible ? ' is-on' : ''));
        item.appendChild(el('span', 'ctx-check', { html: c.visible ? checkSVG() : '' }));
        item.appendChild(el('span', 'ctx-item__label', { text: c.label }));
        item.addEventListener('click', function () { S.toggleColumn(c.key); closePopover(); });
        pop.appendChild(item);
      });
    });
  }

  // Row colour swatches — pick the project's identity colour.
  function buildColorSwatches(pop, p) {
    pop.classList.add('popover--colors');
    pop.appendChild(el('div', 'ctx-label', { text: 'Row colour' }));
    var grid = el('div', 'color-grid');
    S.PROJECT_COLORS.forEach(function (c) {
      var sw = el('button', 'color-sw' + (p.color === c ? ' is-on' : ''), { title: c });
      sw.style.background = c;
      sw.addEventListener('click', function () { S.setProjectColor(p.id, c); closePopover(); });
      grid.appendChild(sw);
    });
    pop.appendChild(grid);
  }
  function openRowColorMenu(anchor, p) {
    openPopover(anchor, function (pop) { buildColorSwatches(pop, p); });
  }
  function openRowColorMenuAt(x, y, p) {
    openContextMenuAt(x, y, function (pop) { buildColorSwatches(pop, p); });
  }

  // ---- Progress bar ---------------------------------------------------------

  function progressBar(p) {
    var wrap = el('button', 'progress', { 'data-project': p.id, 'data-field': 'progress', title: p.progress + '% complete' });
    var track = el('span', 'progress__track');
    var fill = el('span', 'progress__fill');
    fill.style.background = p.color || '#5a63ad';   // project identity colour
    fill.dataset.pct = '0';
    track.appendChild(fill);
    wrap.appendChild(track);
    wrap.appendChild(el('span', 'progress__label', { text: p.progress + '%' }));
    requestAnimationFrame(function () { M.fill(fill, p.progress); });
    return wrap;
  }

  // ==========================================================================
  //  BOARD (table) view
  // ==========================================================================

  function matchesQuery(p) {
    if (!query) return true;
    var owner = S.personById(p.ownerId);
    var hay = (p.name + ' ' + (owner ? owner.name : '') + ' ' + p.notes + ' ' + p.status + ' ' + p.priority).toLowerCase();
    return hay.indexOf(query.toLowerCase()) !== -1;
  }

  function renderBoard() {
    viewTitle.textContent = S.state.board.name;
    var st = S.stats();
    viewSubtitle.textContent = st.total + ' projects · ' + st.done + ' done · ' +
      st.overdue + ' overdue · ' + st.avgProgress + '% avg progress';

    var root = el('div', 'board');
    // Project-name appearance (colour / grey / dark greyscale).
    var nameStyle = (S.state.settings && S.state.settings.nameStyle) || 'colour';
    if (nameStyle === 'grey') root.classList.add('names-grey');
    else if (nameStyle === 'dark') root.classList.add('names-dark');
    // Build the grid track list from the visible columns (name column fixed).
    var cols = S.visibleColumns();
    root.style.setProperty('--cols', 'minmax(200px,2.2fr) ' + cols.map(function (c) { return c.width; }).join(' '));
    var rowEls = [];

    S.state.groups.forEach(function (group) {
      var projects = S.projectsInGroup(group.id).filter(matchesQuery);
      if (query && !projects.length) return;

      var section = el('section', 'group', { 'data-group': group.id });
      section.style.setProperty('--group', group.color);

      var head = el('div', 'group__head');
      var grip = el('button', 'group__grip', { html: gripSVG(), title: 'Drag to reorder category' });
      var caret = el('button', 'group__caret' + (group.collapsed ? ' is-collapsed' : ''), { html: caretSVG() });
      var title = el('button', 'group__title', { text: group.name });
      title.style.color = group.color;
      var count = el('span', 'group__count', { text: projects.length + '' });
      head.appendChild(grip);
      head.appendChild(caret);
      head.appendChild(title);
      head.appendChild(count);
      section.appendChild(head);

      var body = el('div', 'group__body');
      if (group.collapsed) body.style.display = 'none';

      // Column header — Project is fixed; the rest come from the column config.
      // Right-click any header for greyscale + show/hide columns.
      var header = el('div', 'row row--header');
      var projHead = el('div', 'cell cell--head', { text: 'Project' });
      projHead.addEventListener('contextmenu', function (e) { e.preventDefault(); openColumnMenuAt(e.clientX, e.clientY, null); });
      header.appendChild(projHead);
      cols.forEach(function (col) {
        var hc = el('div', 'cell cell--head', { text: col.label });
        if (col.greyscale) hc.classList.add('is-greyscale-head');
        hc.addEventListener('contextmenu', function (e) { e.preventDefault(); openColumnMenuAt(e.clientX, e.clientY, col.key); });
        header.appendChild(hc);
      });
      body.appendChild(header);

      projects.forEach(function (p) {
        var row = buildRow(p, group);
        body.appendChild(row);
        rowEls.push(row);
      });

      // add-row
      var addRow = el('button', 'row row--add', { html: '<span class="cell">+ Add project</span>' });
      addRow.addEventListener('click', function () { openEditor(null, group.id); });
      body.appendChild(addRow);

      section.appendChild(body);
      root.appendChild(section);

      function toggle() {
        group.collapsed = !group.collapsed;
        caret.classList.toggle('is-collapsed', group.collapsed);
        if (group.collapsed) { body.style.display = 'none'; }
        else { body.style.display = ''; M.stagger(body.querySelectorAll('.row:not(.row--header)'), { step: 24 }); }
      }
      caret.addEventListener('click', toggle);
      title.addEventListener('click', toggle);
    });

    clear(viewRoot);
    viewRoot.appendChild(root);
    M.stagger(rowEls, { step: 26, y: 10 });
    initGroupSort(root);
  }

  // Grab a category's header grip to reorder the phase categories. The dragged
  // section dims in place while a lightweight header proxy follows the pointer;
  // a drop line shows where it will land. On release the board re-renders in the
  // new order with a settle stagger.
  function initGroupSort(root) {
    var proxy = null, dragId = null, indicator = null, grabDy = 0, capEl = null, capId = null, lastY = 0;

    function otherSections() {
      return Array.prototype.slice.call(root.querySelectorAll('.group')).filter(function (s) {
        return s.getAttribute('data-group') !== dragId;
      });
    }
    function dropIndex(y) {
      var o = otherSections();
      for (var i = 0; i < o.length; i++) {
        var r = o[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) return i;
      }
      return o.length;
    }
    function positionIndicator(y) {
      var o = otherSections();
      if (!o.length) return;
      var i = dropIndex(y), top;
      if (i >= o.length) top = o[o.length - 1].getBoundingClientRect().bottom + 5;
      else top = o[i].getBoundingClientRect().top - 5;
      indicator.style.top = (top - root.getBoundingClientRect().top) + 'px';
    }

    root.addEventListener('pointerdown', function (e) {
      var grip = e.target && e.target.closest ? e.target.closest('.group__grip') : null;
      if (!grip) return;
      var section = grip.closest('.group');
      if (!section) return;
      e.preventDefault();
      dragId = section.getAttribute('data-group');
      var head = section.querySelector('.group__head');
      var r = head.getBoundingClientRect();
      grabDy = e.clientY - r.top;

      proxy = head.cloneNode(true);
      proxy.classList.add('group__head--proxy', 'm-lift');
      proxy.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' +
        r.width + 'px;margin:0;z-index:600;pointer-events:none;';
      document.body.appendChild(proxy);
      section.classList.add('is-dragging-group');

      indicator = el('div', 'group__drop-line');
      root.appendChild(indicator);
      lastY = e.clientY;
      positionIndicator(e.clientY);

      capEl = grip; capId = e.pointerId;
      try { grip.setPointerCapture(capId); } catch (err) {}
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
    });

    function onMove(e) {
      lastY = e.clientY;
      proxy.style.top = (e.clientY - grabDy) + 'px';
      positionIndicator(e.clientY);
    }
    function onUp(e) {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      try { capEl.releasePointerCapture(capId); } catch (err) {}
      var o = otherSections();
      var i = dropIndex(lastY);
      var ids = o.map(function (s) { return s.getAttribute('data-group'); });
      ids.splice(i, 0, dragId);
      if (proxy) proxy.remove();
      if (indicator) indicator.remove();
      // Only commit (and re-render) if the order actually changed.
      var current = Array.prototype.slice.call(root.querySelectorAll('.group'))
        .map(function (s) { return s.getAttribute('data-group'); });
      var changed = ids.some(function (id, k) { return id !== current[k]; });
      if (changed) S.reorderGroups(ids);
      else { var d = root.querySelector('.group.is-dragging-group'); if (d) d.classList.remove('is-dragging-group'); }
      proxy = null; indicator = null; dragId = null;
    }
  }

  // Per-column cell builders, keyed by column id. renderBoard walks the
  // visible-column list and appends these in order.
  function buildCell(key, p) {
    if (key === 'owner') {
      var ownerCell = el('div', 'cell cell--owner', { 'data-label': 'Team' });
      var ownerBtn = el('button', 'owner-btn');
      ownerBtn.appendChild(avatarStack(p.assigneeIds, 28));
      ownerBtn.addEventListener('click', function (e) { e.stopPropagation(); openAssigneeMenu(ownerBtn, p); });
      ownerCell.appendChild(ownerBtn);
      return ownerCell;
    }
    if (key === 'status') {
      var stCell = el('div', 'cell cell--status', { 'data-label': 'Status' });
      var sp = statusPill(p);
      sp.addEventListener('click', function (e) { e.stopPropagation(); openStatusMenu(sp, p); });
      stCell.appendChild(sp);
      return stCell;
    }
    if (key === 'timeline') {
      var tlCell = el('div', 'cell cell--timeline', { 'data-label': 'Timeline' });
      var tlBtn = el('button', 'timeline-chip', { onclick: function () { openEditor(p.id); } });
      tlBtn.appendChild(el('span', 'timeline-chip__text', { text: fmtDate(p.startDate) + ' – ' + fmtDate(p.dueDate) }));
      var dueDays = S.daysBetween(S.todayISO(), p.dueDate);
      if (p.status !== 'done') {
        var badge = el('span', 'timeline-chip__due', {
          text: dueDays < 0 ? (Math.abs(dueDays) + 'd late') : (dueDays === 0 ? 'today' : dueDays + 'd left')
        });
        if (dueDays < 0) badge.classList.add('is-late');
        else if (dueDays <= (S.state.settings.atRiskDays || 3)) badge.classList.add('is-soon');
        tlBtn.appendChild(badge);
      }
      tlCell.appendChild(tlBtn);
      return tlCell;
    }
    if (key === 'priority') {
      var prCell = el('div', 'cell cell--priority', { 'data-label': 'Priority' });
      var pp = priorityPill(p);
      pp.addEventListener('click', function (e) { e.stopPropagation(); openPriorityMenu(pp, p); });
      prCell.appendChild(pp);
      return prCell;
    }
    if (key === 'progress') {
      var pgCell = el('div', 'cell cell--progress', { 'data-label': 'Progress' });
      var pg = progressBar(p);
      pg.addEventListener('click', function (e) { e.stopPropagation(); openProgressMenu(pg, p); });
      pgCell.appendChild(pg);
      return pgCell;
    }
    // next milestone
    var msCell = el('div', 'cell cell--milestone', { 'data-label': 'Next milestone' });
    var nm = S.nextMilestone(p);
    if (nm) {
      var chip = el('div', 'ms-chip');
      var d = S.daysBetween(S.todayISO(), nm.date);
      if (d < 0) chip.classList.add('is-late');
      else if (d <= 3) chip.classList.add('is-soon');
      chip.appendChild(el('span', 'ms-chip__flag', { html: flagSVG() }));
      chip.appendChild(el('span', 'ms-chip__name', { text: nm.name }));
      if (nm.assigneeId) { var mw = S.personById(nm.assigneeId); if (mw) chip.appendChild(avatar(mw, 18)); }
      chip.appendChild(el('span', 'ms-chip__date', { text: fmtDate(nm.date) }));
      msCell.appendChild(chip);
    } else {
      msCell.appendChild(el('span', 'ms-chip ms-chip--empty', { text: p.status === 'done' ? 'All complete' : 'No milestones' }));
    }
    return msCell;
  }

  function buildRow(p, group) {
    var row = el('div', 'row', { 'data-project': p.id });
    row.style.setProperty('--group', group.color);
    row.style.setProperty('--pjc', p.color || '#5a63ad');   // project identity colour

    // name (fixed first column). Right-click the name to recolour the row.
    var nameCell = el('div', 'cell cell--name', { 'data-label': 'Project' });
    var nameBtn = el('button', 'cell__name', { text: p.name });
    nameBtn.addEventListener('click', function () { openEditor(p.id); });
    nameCell.appendChild(nameBtn);
    nameCell.addEventListener('contextmenu', function (e) {
      e.preventDefault(); openRowColorMenuAt(e.clientX, e.clientY, p);
    });
    row.appendChild(nameCell);

    // dynamic, user-configurable columns
    S.visibleColumns().forEach(function (col) {
      var cell = buildCell(col.key, p);
      if (col.greyscale) cell.classList.add('is-greyscale');
      row.appendChild(cell);
    });

    return row;
  }

  // ==========================================================================
  //  TIMELINE (Gantt) view
  // ==========================================================================

  function renderTimeline() {
    viewTitle.textContent = 'Timeline';
    var projects = S.state.projects.filter(matchesQuery).slice().sort(function (a, b) {
      return a.startDate < b.startDate ? -1 : 1;
    });
    viewSubtitle.textContent = projects.length + ' projects on the schedule';

    // Compute date range
    var today = S.todayISO();
    var min = today, max = today;
    projects.forEach(function (p) {
      if (p.startDate < min) min = p.startDate;
      if (p.dueDate > max) max = p.dueDate;
    });
    (S.allMilestones()).forEach(function (x) {
      if (x.milestone.date < min) min = x.milestone.date;
      if (x.milestone.date > max) max = x.milestone.date;
    });
    // pad
    min = S.addDays(min, -3);
    max = S.addDays(max, 3);
    var span = Math.max(1, S.daysBetween(min, max));
    var DAY_W = 26; // px per day
    var totalW = span * DAY_W;

    var wrap = el('div', 'timeline');
    var scroll = el('div', 'timeline__scroll');
    var inner = el('div', 'timeline__inner');
    inner.style.width = (totalW + 240) + 'px';

    // Month header
    var months = el('div', 'timeline__months');
    months.style.marginLeft = '240px';
    var cursor = new Date(min + 'T00:00:00');
    var end = new Date(max + 'T00:00:00');
    while (cursor <= end) {
      var mStartISO = cursor.toISOString().slice(0, 10);
      var y = cursor.getFullYear(), mo = cursor.getMonth();
      var next = new Date(y, mo + 1, 1);
      var segEnd = next <= end ? next : end;
      var segEndISO = segEnd.toISOString().slice(0, 10);
      var w = Math.max(0, S.daysBetween(mStartISO, segEndISO)) * DAY_W;
      var mlabel = el('div', 'timeline__month', { text: cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) });
      mlabel.style.width = w + 'px';
      months.appendChild(mlabel);
      cursor = next;
    }
    inner.appendChild(months);

    // Today marker offset
    var todayX = 240 + S.daysBetween(min, today) * DAY_W;
    var todayLine = el('div', 'timeline__today');
    todayLine.style.left = todayX + 'px';
    todayLine.appendChild(el('span', 'timeline__today-flag', { text: 'Today' }));
    inner.appendChild(todayLine);

    var rows = el('div', 'timeline__rows');
    var barEls = [];
    projects.forEach(function (p) {
      var owner = S.personById(p.ownerId);
      var r = el('div', 'timeline__row');
      var label = el('button', 'timeline__label', { onclick: function () { openEditor(p.id); } });
      label.appendChild(avatarStack(p.assigneeIds, 24));
      label.appendChild(el('span', 'timeline__label-text', { text: p.name }));
      r.appendChild(label);

      var track = el('div', 'timeline__track');
      var x = S.daysBetween(min, p.startDate) * DAY_W;
      var w2 = Math.max(DAY_W, S.daysBetween(p.startDate, p.dueDate) * DAY_W);
      var bar = el('button', 'gbar', { onclick: function () { openEditor(p.id); }, title: p.name + ' · ' + fmtDate(p.startDate) + '–' + fmtDate(p.dueDate) });
      bar.style.left = x + 'px';
      bar.style.width = w2 + 'px';
      var h = S.projectHealth(p);
      bar.style.background = p.color || '#5a63ad';   // project identity colour
      if (h.level === 'overdue') bar.classList.add('is-late');   // red ring flags lateness
      var barFill = el('span', 'gbar__fill'); barFill.style.width = p.progress + '%';
      bar.appendChild(barFill);
      bar.appendChild(el('span', 'gbar__label', { text: p.progress + '%' }));
      track.appendChild(bar);
      barEls.push(bar);

      // milestone diamonds (tinted by the person who owns the milestone)
      (p.milestones || []).forEach(function (m) {
        var mx = S.daysBetween(min, m.date) * DAY_W;
        var who = m.assigneeId ? S.personById(m.assigneeId) : null;
        var tip = m.name + ' · ' + fmtDateFull(m.date) + (who ? ' · ' + who.name : '');
        var dia = el('span', 'gdia' + (m.done ? ' is-done' : ''), { title: tip });
        dia.style.left = (mx - 6) + 'px';
        track.appendChild(dia);
      });

      r.appendChild(track);
      rows.appendChild(r);
    });

    inner.appendChild(rows);
    scroll.appendChild(inner);
    wrap.appendChild(scroll);

    clear(viewRoot);
    viewRoot.appendChild(wrap);
    // Scroll so today is near left third
    scroll.scrollLeft = Math.max(0, todayX - scroll.clientWidth / 3);
    M.stagger(barEls, { step: 30, y: 6 });
  }

  // ==========================================================================
  //  KANBAN view (by status) with drag & drop
  // ==========================================================================

  function renderKanban() {
    viewTitle.textContent = 'Kanban';
    var projects = S.state.projects.filter(matchesQuery);
    viewSubtitle.textContent = 'Drag cards between statuses to update';

    var board = el('div', 'kanban');
    var cardEls = [];

    S.STATUSES.forEach(function (s) {
      var col = el('div', 'kcol', { 'data-status': s.id });
      var head = el('div', 'kcol__head');
      head.style.setProperty('--c', s.color);
      var items = projects.filter(function (p) { return p.status === s.id; });
      head.appendChild(el('span', 'kcol__dot'));
      head.appendChild(el('span', 'kcol__title', { text: s.label }));
      head.appendChild(el('span', 'kcol__count', { text: items.length + '' }));
      col.appendChild(head);

      var list = el('div', 'kcol__list', { 'data-status': s.id });
      items.forEach(function (p) {
        var card = buildCard(p);
        list.appendChild(card);
        cardEls.push(card);
      });
      col.appendChild(list);

      // Drop handling
      list.addEventListener('dragover', function (e) {
        e.preventDefault();
        list.classList.add('is-over');
      });
      list.addEventListener('dragleave', function () { list.classList.remove('is-over'); });
      list.addEventListener('drop', function (e) {
        e.preventDefault();
        list.classList.remove('is-over');
        var id = e.dataTransfer.getData('text/plain');
        var p = S.projectById(id);
        if (p && p.status !== s.id) {
          S.updateProject(id, { status: s.id }, { field: 'status', silent: false });
          toast('Moved to “' + s.label + '”', 'success');
        }
      });

      board.appendChild(col);
    });

    clear(viewRoot);
    viewRoot.appendChild(board);
    M.stagger(cardEls, { step: 24, y: 10 });
  }

  function buildCard(p) {
    var owner = S.personById(p.ownerId);
    var strong = (p.priority === 'high' || p.priority === 'critical');
    var card = el('div', 'kcard ' + (strong ? 'kcard--fill' : 'kcard--stroke'), { draggable: 'true', 'data-project': p.id });
    card.style.setProperty('--pc', S.priorityMeta(p.priority).color);
    card.style.setProperty('--pjc', p.color || '#5a63ad');

    card.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', p.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', function () { card.classList.remove('is-dragging'); });

    var top = el('div', 'kcard__top');
    top.appendChild(priorityTag(p));
    card.appendChild(top);

    var title = el('button', 'kcard__title', { text: p.name, onclick: function () { openEditor(p.id); } });
    card.appendChild(title);

    var meta = el('div', 'kcard__meta');
    meta.appendChild(avatarStack(p.assigneeIds, 26));
    var due = el('span', 'kcard__due', { text: fmtDate(p.dueDate) });
    var dd = S.daysBetween(S.todayISO(), p.dueDate);
    if (p.status !== 'done') { if (dd < 0) due.classList.add('is-late'); else if (dd <= 3) due.classList.add('is-soon'); }
    meta.appendChild(due);
    card.appendChild(meta);

    var pg = el('div', 'kcard__progress');
    var fill = el('span', 'kcard__progress-fill');
    fill.style.background = '#868da0';
    pg.appendChild(fill);
    card.appendChild(pg);
    requestAnimationFrame(function () { M.fill(fill, p.progress); });

    var nm = S.nextMilestone(p);
    if (nm) {
      var ms = el('div', 'kcard__ms');
      ms.appendChild(el('span', 'kcard__ms-flag', { html: flagSVG() }));
      ms.appendChild(el('span', null, { text: nm.name + ' · ' + fmtDate(nm.date) }));
      card.appendChild(ms);
    }
    return card;
  }

  function priorityTag(p) {
    var meta = S.priorityMeta(p.priority);
    var tag = el('span', 'ptag', { text: meta.label });
    tag.style.setProperty('--pc', meta.color);
    return tag;
  }

  // ==========================================================================
  //  PEOPLE / workload view
  // ==========================================================================

  function renderPeople() {
    viewTitle.textContent = 'Team';
    viewSubtitle.textContent = S.state.people.length + ' team members · workload & assignments';

    var grid = el('div', 'people-grid');
    var cardEls = [];

    // Balance reference: max active among team
    var loads = S.state.people.map(function (pe) { return S.workloadFor(pe.id); });
    var maxActive = Math.max(1, Math.max.apply(null, loads.map(function (l) { return l.active; })));

    S.state.people.forEach(function (person, i) {
      var w = loads[i];
      var card = el('div', 'pcard');
      var head = el('div', 'pcard__head');
      head.appendChild(avatar(person, 46));
      var idn = el('div', 'pcard__id');
      idn.appendChild(el('div', 'pcard__name', { text: person.name }));
      idn.appendChild(el('div', 'pcard__role', { text: person.role }));
      head.appendChild(idn);
      card.appendChild(head);

      var stats = el('div', 'pcard__stats');
      stats.appendChild(stat(w.active, 'Active'));
      stats.appendChild(stat(w.overdue, 'Overdue', w.overdue > 0 ? 'danger' : null));
      stats.appendChild(stat(w.avgProgress + '%', 'Avg progress'));
      card.appendChild(stats);

      // capacity meter
      var cap = el('div', 'pcard__cap');
      var capLabel = el('div', 'pcard__cap-label');
      capLabel.appendChild(el('span', null, { text: 'Workload' }));
      var level = w.active >= maxActive && maxActive > 2 ? 'High' : (w.active === 0 ? 'Free' : 'Balanced');
      capLabel.appendChild(el('span', 'pcard__cap-level pcard__cap-level--' + level.toLowerCase(), { text: level }));
      cap.appendChild(capLabel);
      var bar = el('div', 'pcard__cap-bar');
      var fill = el('span', 'pcard__cap-fill');
      fill.style.background = level === 'High' ? '#b04e5b' : (level === 'Free' ? '#868fa1' : '#4f77ae');
      bar.appendChild(fill);
      cap.appendChild(bar);
      card.appendChild(cap);
      requestAnimationFrame(function () { M.fill(fill, (w.active / maxActive) * 100); });

      // project list
      var list = el('div', 'pcard__projects');
      w.projects.slice().sort(function (a, b) { return (a.status === 'done') - (b.status === 'done'); }).forEach(function (p) {
        var item = el('button', 'pcard__proj', { onclick: function () { openEditor(p.id); } });
        var dot = el('span', 'pcard__proj-dot'); dot.style.background = S.statusMeta(p.status).color;
        item.appendChild(dot);
        item.appendChild(el('span', 'pcard__proj-name', { text: p.name }));
        item.appendChild(el('span', 'pcard__proj-due', { text: fmtDate(p.dueDate) }));
        list.appendChild(item);
      });
      if (!w.projects.length) list.appendChild(el('div', 'pcard__empty', { text: 'No projects assigned' }));
      card.appendChild(list);

      grid.appendChild(card);
      cardEls.push(card);
    });

    clear(viewRoot);
    viewRoot.appendChild(grid);
    M.stagger(cardEls, { step: 40, y: 14 });

    function stat(value, label, kind) {
      var s = el('div', 'pstat' + (kind ? ' pstat--' + kind : ''));
      var v = el('div', 'pstat__value');
      s.appendChild(v);
      s.appendChild(el('div', 'pstat__label', { text: label }));
      var num = typeof value === 'number' ? value : parseFloat(value);
      var suffix = typeof value === 'string' && value.indexOf('%') > -1 ? '%' : '';
      M.countUp(v, isNaN(num) ? 0 : num, { format: function (x) { return Math.round(x) + suffix; } });
      return s;
    }
  }

  // ==========================================================================
  //  DASHBOARD / insights
  // ==========================================================================

  function renderDashboard() {
    viewTitle.textContent = 'Insights';
    var st = S.stats();
    viewSubtitle.textContent = 'Department health at a glance';

    var dash = el('div', 'dash');

    // KPI cards
    var kpis = el('div', 'dash__kpis');
    kpis.appendChild(kpi(st.total, 'Total projects', '#4f77ae', gridSVG()));
    kpis.appendChild(kpi(st.avgProgress, 'Avg progress', '#4e8d6e', chartSVG(), '%'));
    kpis.appendChild(kpi(st.overdue, 'Overdue', '#b04e5b', alertSVG()));
    kpis.appendChild(kpi(st.atRisk, 'At risk', '#b58234', clockSVG()));
    dash.appendChild(kpis);

    var cols = el('div', 'dash__cols');

    // Status distribution (donut)
    var statusCard = card('Status breakdown');
    statusCard.appendChild(donut(st));
    cols.appendChild(statusCard);

    // Workload chart
    var wlCard = card('Workload by team member');
    wlCard.appendChild(workloadChart());
    cols.appendChild(wlCard);

    dash.appendChild(cols);

    // Upcoming milestones
    var upCard = card('Upcoming milestones');
    var ups = S.upcomingMilestones(21).slice(0, 8);
    if (!ups.length) upCard.appendChild(el('div', 'dash__empty', { text: 'No milestones in the next 3 weeks.' }));
    ups.forEach(function (x) {
      var owner = S.personById(x.project.ownerId);
      var item = el('button', 'up-item', { onclick: function () { openEditor(x.project.id); } });
      var flag = el('span', 'up-item__flag');
      if (x.inDays < 0) flag.classList.add('is-late');
      else if (x.inDays <= 3) flag.classList.add('is-soon');
      flag.innerHTML = flagSVG();
      item.appendChild(flag);
      var mid = el('div', 'up-item__mid');
      mid.appendChild(el('div', 'up-item__name', { text: x.milestone.name }));
      mid.appendChild(el('div', 'up-item__proj', { text: x.project.name }));
      item.appendChild(mid);
      item.appendChild(avatar(owner, 26));
      var when = el('div', 'up-item__when', {
        text: x.inDays < 0 ? Math.abs(x.inDays) + 'd late' : (x.inDays === 0 ? 'Today' : 'in ' + x.inDays + 'd')
      });
      if (x.inDays < 0) when.classList.add('is-late'); else if (x.inDays <= 3) when.classList.add('is-soon');
      item.appendChild(when);
      upCard.appendChild(item);
    });
    dash.appendChild(upCard);

    clear(viewRoot);
    viewRoot.appendChild(dash);
    M.stagger(dash.querySelectorAll('.kpi, .card'), { step: 46, y: 16 });

    function kpi(value, label, color, icon, suffix) {
      var c = el('div', 'kpi');
      c.style.setProperty('--c', color);
      var ic = el('div', 'kpi__icon', { html: icon });
      c.appendChild(ic);
      var body = el('div', 'kpi__body');
      var v = el('div', 'kpi__value');
      body.appendChild(v);
      body.appendChild(el('div', 'kpi__label', { text: label }));
      c.appendChild(body);
      M.countUp(v, value, { format: function (x) { return Math.round(x) + (suffix || ''); } });
      return c;
    }

    function card(title) {
      var c = el('div', 'card');
      c.appendChild(el('div', 'card__title', { text: title }));
      return c;
    }
  }

  function donut(st) {
    var wrap = el('div', 'donut-wrap');
    var SVGNS = 'http://www.w3.org/2000/svg';
    var size = 168, cx = size / 2, cy = size / 2, R = 78, r = 54; // outer/inner radius
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svg.setAttribute('class', 'donut');

    // Background ring (full annulus)
    svg.appendChild(sectorPath(0, 360, '#eef0f4'));

    var total = st.total || 1;
    var angle = 0;
    var segs = [];
    S.STATUSES.forEach(function (s) {
      var count = st.byStatus[s.id] || 0;
      if (!count) return;
      var sweep = (count / total) * 360;
      // tiny gap between segments for definition
      var pad = total > 1 && sweep < 360 ? 1.2 : 0;
      var path = sectorPath(angle + pad / 2, angle + sweep - pad / 2, s.color);
      svg.appendChild(path);
      segs.push(path);
      angle += sweep;
    });

    var center = document.createElementNS(SVGNS, 'text');
    center.setAttribute('x', cx); center.setAttribute('y', cy - 2);
    center.setAttribute('text-anchor', 'middle'); center.setAttribute('class', 'donut__num');
    center.textContent = st.total;
    var sub = document.createElementNS(SVGNS, 'text');
    sub.setAttribute('x', cx); sub.setAttribute('y', cy + 18);
    sub.setAttribute('text-anchor', 'middle'); sub.setAttribute('class', 'donut__sub');
    sub.textContent = 'projects';
    svg.appendChild(center); svg.appendChild(sub);
    wrap.appendChild(svg);

    // Entrance: gentle scale/opacity pop (base state stays fully visible).
    if (!M.reduced) {
      svg.animate([{ opacity: 0, transform: 'scale(0.9) rotate(-8deg)' },
                   { opacity: 1, transform: 'scale(1) rotate(0)' }],
        { duration: 620, easing: M.EASE.softSpring });
    }

    var legend = el('div', 'donut__legend');
    S.STATUSES.forEach(function (s) {
      var count = st.byStatus[s.id] || 0;
      var li = el('div', 'donut__legend-item');
      var dot = el('span', 'donut__legend-dot'); dot.style.background = s.color;
      li.appendChild(dot);
      li.appendChild(el('span', 'donut__legend-label', { text: s.label }));
      li.appendChild(el('span', 'donut__legend-count', { text: count + '' }));
      legend.appendChild(li);
    });
    wrap.appendChild(legend);
    return wrap;

    // Annular sector as a filled path (robust across all renderers).
    function pt(radius, deg) {
      var a = (deg - 90) * Math.PI / 180;
      return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
    }
    function sectorPath(startDeg, endDeg, color) {
      var full = Math.abs(endDeg - startDeg) >= 359.999;
      if (full) endDeg = startDeg + 359.999; // avoid degenerate full-circle arc
      var large = (endDeg - startDeg) > 180 ? 1 : 0;
      var o1 = pt(R, startDeg), o2 = pt(R, endDeg);
      var i2 = pt(r, endDeg), i1 = pt(r, startDeg);
      var d = 'M' + o1[0] + ',' + o1[1] +
        'A' + R + ',' + R + ' 0 ' + large + ' 1 ' + o2[0] + ',' + o2[1] +
        'L' + i2[0] + ',' + i2[1] +
        'A' + r + ',' + r + ' 0 ' + large + ' 0 ' + i1[0] + ',' + i1[1] + 'Z';
      var p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d); p.setAttribute('fill', color);
      return p;
    }
  }

  function workloadChart() {
    var wrap = el('div', 'wlchart');
    var loads = S.state.people.map(function (pe) {
      return { person: pe, w: S.workloadFor(pe.id) };
    });
    var max = Math.max(1, Math.max.apply(null, loads.map(function (l) { return l.w.total; })));
    loads.forEach(function (l) {
      var row = el('div', 'wlchart__row');
      var lab = el('div', 'wlchart__name');
      lab.appendChild(avatar(l.person, 24));
      lab.appendChild(el('span', null, { text: l.person.name.split(' ')[0] }));
      row.appendChild(lab);
      var track = el('div', 'wlchart__track');
      // stacked: active (blue) + overdue (red) + done (green)
      var done = l.w.total - l.w.active;
      var segs = [
        { n: l.w.active - l.w.overdue, c: '#4f77ae' },
        { n: l.w.overdue, c: '#b04e5b' },
        { n: done, c: '#4e8d6e' }
      ];
      segs.forEach(function (s) {
        if (s.n <= 0) return;
        var seg = el('span', 'wlchart__seg');
        seg.style.background = s.c;
        track.appendChild(seg);
        requestAnimationFrame(function () {
          seg.style.width = ((s.n / max) * 100) + '%';
        });
      });
      row.appendChild(track);
      row.appendChild(el('div', 'wlchart__total', { text: l.w.total + '' }));
      wrap.appendChild(row);
    });
    var legend = el('div', 'wlchart__legend');
    [['#4f77ae', 'Active'], ['#b04e5b', 'Overdue'], ['#4e8d6e', 'Done']].forEach(function (x) {
      var i = el('span', 'wlchart__legend-item');
      var d = el('span', 'wlchart__legend-dot'); d.style.background = x[0];
      i.appendChild(d); i.appendChild(document.createTextNode(x[1]));
      legend.appendChild(i);
    });
    wrap.appendChild(legend);
    return wrap;
  }

  // ==========================================================================
  //  PROJECT EDITOR modal
  // ==========================================================================

  function openEditor(projectId, defaultGroupId) {
    var isNew = !projectId;
    var p = isNew ? {
      name: '', groupId: defaultGroupId || S.state.groups[0].id,
      ownerId: S.state.people[0] && S.state.people[0].id, status: 'not_started', priority: 'medium',
      startDate: S.todayISO(), dueDate: S.addDays(S.todayISO(), 14), progress: 0, notes: '', milestones: []
    } : Object.assign({}, S.projectById(projectId));
    // work on a deep-ish copy of milestones
    p.milestones = (p.milestones || []).map(function (m) { return Object.assign({}, m); });

    var backdrop = el('div', 'modal-backdrop');
    var panel = el('div', 'modal');
    // Remembered layout: 'stack' (single column) or 'wide' (two panes, side by side).
    var layout = (S.state.settings && S.state.settings.editorLayout) || 'stack';
    function applyLayout() { panel.classList.toggle('modal--wide', layout === 'wide'); }
    function toggleLayout() {
      layout = (layout === 'wide') ? 'stack' : 'wide';
      applyLayout();
      S.setEditorLayout(layout);
    }

    var head = el('div', 'modal__head', { title: 'Right-click for layout options' });
    head.appendChild(el('div', 'modal__eyebrow', { text: isNew ? 'New project' : 'Edit project' }));
    var headTools = el('div', 'modal__head-tools');
    var layoutBtn = el('button', 'modal__layout', { title: 'Toggle wide / stacked layout', html: layoutSVG() });
    layoutBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleLayout(); });
    headTools.appendChild(layoutBtn);
    var closeBtn = el('button', 'modal__close', { html: '&times;', onclick: dismiss });
    headTools.appendChild(closeBtn);
    head.appendChild(headTools);
    head.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      openContextMenuAt(e.clientX, e.clientY, function (pop) {
        pop.appendChild(el('div', 'ctx-label', { text: 'Layout' }));
        [['stack', 'Stacked (single column)'], ['wide', 'Wide (two columns)']].forEach(function (o) {
          var item = el('button', 'ctx-item ctx-item--check' + (layout === o[0] ? ' is-on' : ''));
          item.appendChild(el('span', 'ctx-check', { html: layout === o[0] ? checkSVG() : '' }));
          item.appendChild(el('span', 'ctx-item__label', { text: o[1] }));
          item.addEventListener('click', function () {
            if (layout !== o[0]) toggleLayout();
            closePopover();
          });
          pop.appendChild(item);
        });
      });
    });
    panel.appendChild(head);
    applyLayout();

    var form = el('div', 'modal__body');
    var paneMain = el('div', 'modal__pane modal__pane--main');
    var paneSide = el('div', 'modal__pane modal__pane--side');

    // Name
    var nameInput = field(paneMain, 'Project name', el('input', 'input', { type: 'text', value: p.name, placeholder: 'e.g. Opening Night Graphics' }));

    // Assigned people (multi-select) — the first picked is the lead/owner.
    var assigneeIds = (p.assigneeIds || (p.ownerId ? [p.ownerId] : [])).slice();
    var pickField = el('div', 'field');
    pickField.appendChild(el('label', 'field__label', { text: 'Assigned to (first is lead)' }));
    var peoplePick = el('div', 'people-pick');
    S.state.people.forEach(function (person) {
      var chip = el('button', 'people-pick__chip', { type: 'button' });
      chip.appendChild(avatar(person, 22));
      chip.appendChild(el('span', null, { text: person.name.split(' ')[0] }));
      function sync() { chip.classList.toggle('is-on', assigneeIds.indexOf(person.id) !== -1); }
      chip.addEventListener('click', function () {
        var idx = assigneeIds.indexOf(person.id);
        if (idx === -1) assigneeIds.push(person.id);
        else if (assigneeIds.length > 1) assigneeIds.splice(idx, 1);
        sync();
      });
      sync();
      peoplePick.appendChild(chip);
    });
    pickField.appendChild(peoplePick);
    paneMain.appendChild(pickField);

    // Group
    var grid2 = el('div', 'form-grid');
    var groupSel = selectFrom(S.state.groups.map(function (g) { return { value: g.id, label: g.name }; }), p.groupId);
    grid2.appendChild(labeled('Group', groupSel));
    grid2.appendChild(el('div', 'field'));
    paneMain.appendChild(grid2);

    // Status + Priority
    var grid2b = el('div', 'form-grid');
    var statusSel = selectFrom(S.STATUSES.map(function (s) { return { value: s.id, label: s.label }; }), p.status);
    var prioSel = selectFrom(S.PRIORITIES.map(function (s) { return { value: s.id, label: s.label }; }), p.priority);
    grid2b.appendChild(labeled('Status', statusSel));
    grid2b.appendChild(labeled('Priority', prioSel));
    paneMain.appendChild(grid2b);

    // Dates
    var grid2c = el('div', 'form-grid');
    var startInput = el('input', 'input', { type: 'date', value: p.startDate });
    var dueInput = el('input', 'input', { type: 'date', value: p.dueDate });
    grid2c.appendChild(labeled('Start date', startInput));
    grid2c.appendChild(labeled('Milestone / due date', dueInput));
    paneMain.appendChild(grid2c);

    // Progress
    var progWrap = el('div', 'field');
    var progLabel = el('label', 'field__label', { text: 'Progress: ' + p.progress + '%' });
    var progInput = el('input', 'range', { type: 'range', min: '0', max: '100', step: '5', value: p.progress });
    progInput.addEventListener('input', function () { progLabel.textContent = 'Progress: ' + progInput.value + '%'; });
    progWrap.appendChild(progLabel); progWrap.appendChild(progInput);
    paneMain.appendChild(progWrap);

    // Notes
    var notesInput = field(paneMain, 'Notes', el('textarea', 'input input--area', { rows: '3', placeholder: 'Context, blockers, links…' }));
    notesInput.value = p.notes;

    // Milestones editor
    var msField = el('div', 'field');
    msField.appendChild(el('label', 'field__label', { text: 'Milestones' }));
    var msList = el('div', 'ms-editor');
    msField.appendChild(msList);
    // Pointer-based live reorder (Rundown style). The row that follows the
    // pointer every frame is a LIGHTWEIGHT text proxy (no native select/date
    // inputs), so the continuous motion is trivially smooth. The real row hides;
    // the others part to open the gap (they move only on threshold crossings);
    // everything settles on release.
    (function initSortable() {
      var SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';
      var dragEl = null, proxy = null, rows = [], origIndex = 0, step = 0, startY = 0, target = 0,
          capHandle = null, capId = null, backdrop = null;
      function rowEls() { return Array.prototype.slice.call(msList.querySelectorAll('.ms-editor__row')); }

      function buildProxy(row) {
        var mid = row.getAttribute('data-msid'), mObj = null;
        for (var i = 0; i < p.milestones.length; i++) { if (p.milestones[i].id === mid) { mObj = p.milestones[i]; break; } }
        var r = row.getBoundingClientRect();
        var px = el('div', 'ms-editor__row ms-editor__proxy m-lift');
        px.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width +
          'px;height:' + r.height + 'px;margin:0;z-index:600;pointer-events:none;will-change:transform;';
        px.appendChild(el('span', 'ms-editor__handle', { html: gripSVG() }));
        px.appendChild(el('span', 'ms-editor__proxy-chk' + (mObj && mObj.done ? ' is-on' : ''), { html: (mObj && mObj.done) ? checkSVG() : '' }));
        px.appendChild(el('span', 'ms-editor__proxy-name', { text: (mObj && mObj.name) || 'Milestone' }));
        px.appendChild(el('span', 'ms-editor__proxy-date', { text: mObj ? fmtDate(mObj.date) : '' }));
        var whoTxt = 'Everyone';
        if (mObj && mObj.assigneeId) { var per = S.personById(mObj.assigneeId); if (per) whoTxt = per.name.split(' ')[0]; }
        px.appendChild(el('span', 'ms-editor__proxy-who', { text: whoTxt }));
        return px;
      }

      msList.addEventListener('pointerdown', function (e) {
        var handle = e.target && e.target.closest ? e.target.closest('.ms-editor__handle') : null;
        if (!handle) return;
        var row = handle.closest('.ms-editor__row');
        if (!row) return;
        e.preventDefault();
        dragEl = row; rows = rowEls(); origIndex = rows.indexOf(row); target = origIndex; startY = e.clientY;
        step = (rows.length > 1
          ? Math.abs(rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top)
          : row.getBoundingClientRect().height + 8) || 44;
        capHandle = handle; capId = e.pointerId;
        try { handle.setPointerCapture(capId); } catch (err) {}
        proxy = buildProxy(row);
        document.body.appendChild(proxy);
        row.style.visibility = 'hidden';         // real row keeps its slot (the moving gap)
        rows.forEach(function (r) { if (r !== row) r.style.transition = 'transform var(--motion) ' + SETTLE; });
        document.body.style.userSelect = 'none';
        msList.classList.add('is-sorting');       // layer-promote the parting rows
        backdrop = modalHost.querySelector('.modal-backdrop');
        if (backdrop) backdrop.classList.add('is-static');
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
      });

      function onMove(e) {
        if (!dragEl) return;
        var dy = e.clientY - startY;
        proxy.style.transform = 'translateY(' + dy + 'px) scale(1.02)';   // cheap: text only
        var t = Math.max(0, Math.min(rows.length - 1, origIndex + Math.round(dy / step)));
        if (t === target) return;
        target = t;
        rows.forEach(function (r, i) {
          if (r === dragEl) return;
          var shift = 0;
          if (origIndex < target && i > origIndex && i <= target) shift = -step;
          else if (origIndex > target && i >= target && i < origIndex) shift = step;
          r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
        });
      }

      function onUp() {
        if (!dragEl) return;
        var el2 = dragEl, from = origIndex, to = target;
        if (capHandle) {
          capHandle.removeEventListener('pointermove', onMove);
          capHandle.removeEventListener('pointerup', onUp);
          capHandle.removeEventListener('pointercancel', onUp);
          try { capHandle.releasePointerCapture(capId); } catch (err) {}
        }
        document.body.style.userSelect = '';
        // Old positions: the proxy for the dragged row, current spot for the rest.
        var proxyTop = proxy ? proxy.getBoundingClientRect().top : 0;
        var firstTop = rows.map(function (r) { return r === el2 ? proxyTop : r.getBoundingClientRect().top; });
        rows.forEach(function (r) { r.style.transition = ''; r.style.transform = ''; });
        el2.style.visibility = '';
        if (proxy && proxy.parentNode) proxy.parentNode.removeChild(proxy);
        proxy = null;
        if (to !== from) {
          var addBtn = msList.querySelector('.ms-editor__add');
          var order = rows.slice(); order.splice(from, 1); order.splice(to, 0, el2);
          order.forEach(function (r) { msList.insertBefore(r, addBtn); });
          var moved = p.milestones.splice(from, 1)[0];
          p.milestones.splice(to, 0, moved);
        }
        if (!M.reduced) {
          rows.forEach(function (r, i) {
            var dy = firstTop[i] - r.getBoundingClientRect().top;
            if (r !== el2 && Math.abs(dy) < 0.5) return;
            r.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }],
              { duration: 340, easing: SETTLE });
          });
        }
        var bd = backdrop;
        setTimeout(function () { msList.classList.remove('is-sorting'); if (bd) bd.classList.remove('is-static'); }, 380);
        dragEl = null; rows = []; capHandle = null; backdrop = null;
      }
    })();

    function renderMsEditor() {
      clear(msList);
      // Manual order is preserved (no auto date-sort) so drag-to-reorder sticks.
      p.milestones.forEach(function (m, idx) {
        var rowm = el('div', 'ms-editor__row', { 'data-msid': m.id });

        // Grip: initiates the pointer-based reorder (see initSortable above).
        var handle = el('span', 'ms-editor__handle', { html: gripSVG(), title: 'Drag to reorder' });

        var chk = el('input', 'ms-editor__chk', { type: 'checkbox' });
        chk.checked = m.done;
        chk.addEventListener('change', function () { m.done = chk.checked; });
        var name = el('input', 'input input--sm', { type: 'text', value: m.name, placeholder: 'Milestone' });
        name.addEventListener('input', function () { m.name = name.value; });
        var date = el('input', 'input input--sm input--date', { type: 'date', value: m.date });
        date.addEventListener('input', function () { m.date = date.value; });

        // Who owns this milestone: "Everyone" (project-level) or one assignee.
        var who = el('select', 'input input--sm ms-editor__who', { title: 'Assign this milestone' });
        who.appendChild(el('option', null, { value: '', text: 'Everyone' }));
        assigneeIds.forEach(function (pid) {
          var per = S.personById(pid);
          if (per) who.appendChild(el('option', null, { value: pid, text: per.name.split(' ')[0] }));
        });
        who.value = m.assigneeId || '';
        who.addEventListener('change', function () { m.assigneeId = who.value || null; });

        var del = el('button', 'ms-editor__del', { html: '&times;', onclick: function () {
          p.milestones = p.milestones.filter(function (x) { return x.id !== m.id; });
          renderMsEditor();
        } });
        rowm.appendChild(handle); rowm.appendChild(chk); rowm.appendChild(name);
        rowm.appendChild(date); rowm.appendChild(who); rowm.appendChild(del);
        msList.appendChild(rowm);
      });
      var add = el('button', 'ms-editor__add', { text: '+ Add milestone', onclick: function () {
        p.milestones.push({ id: 'ms_' + Math.random().toString(36).slice(2, 8), name: '', date: dueInput.value || S.todayISO(), done: false, assigneeId: null });
        renderMsEditor();
      } });
      msList.appendChild(add);
    }
    renderMsEditor();
    paneSide.appendChild(msField);

    form.appendChild(paneMain);
    form.appendChild(paneSide);
    panel.appendChild(form);

    // Footer
    var foot = el('div', 'modal__foot');
    if (!isNew) {
      var delBtn = el('button', 'btn btn--ghost-danger', { text: 'Delete', onclick: function () {
        S.deleteProject(projectId);
        toast('Project deleted', 'info');
        dismiss();
      } });
      foot.appendChild(delBtn);
    }
    var spacer = el('div', 'modal__foot-spacer'); foot.appendChild(spacer);
    foot.appendChild(el('button', 'btn btn--soft', { text: 'Cancel', onclick: dismiss }));
    var saveBtn = el('button', 'btn btn--primary', { text: isNew ? 'Create project' : 'Save changes', onclick: save });
    foot.appendChild(saveBtn);
    panel.appendChild(foot);

    modalHost.hidden = false;
    clear(modalHost);
    modalHost.appendChild(backdrop);
    modalHost.appendChild(panel);
    M.modalIn(panel, backdrop);
    backdrop.addEventListener('click', dismiss);
    setTimeout(function () { nameInput.focus(); }, 60);

    function save() {
      var data = {
        name: nameInput.value.trim() || 'Untitled project',
        groupId: groupSel.value,
        assigneeIds: assigneeIds.length ? assigneeIds : [S.state.people[0] && S.state.people[0].id],
        status: statusSel.value, priority: prioSel.value,
        startDate: startInput.value, dueDate: dueInput.value,
        progress: parseInt(progInput.value, 10),
        notes: notesInput.value,
        milestones: p.milestones.filter(function (m) { return m.name.trim(); })
      };
      if (isNew) { S.addProject(data); toast('Project created', 'success'); }
      else { S.updateProject(projectId, data); toast('Changes saved', 'success'); }
      dismiss();
    }

    function dismiss() {
      M.modalOut(panel, backdrop).finished.then(function () {
        modalHost.hidden = true; clear(modalHost);
      });
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') dismiss(); }
    document.addEventListener('keydown', onKey);

    // helpers
    function field(parent, label, input) {
      var f = el('div', 'field');
      f.appendChild(el('label', 'field__label', { text: label }));
      f.appendChild(input);
      parent.appendChild(f);
      return input;
    }
    function labeled(label, input) {
      var f = el('div', 'field');
      f.appendChild(el('label', 'field__label', { text: label }));
      f.appendChild(input);
      return f;
    }
    function selectFrom(opts, selected) {
      var s = el('select', 'input input--select');
      opts.forEach(function (o) {
        var opt = el('option', null, { value: o.value, text: o.label });
        if (o.value === selected) opt.selected = true;
        s.appendChild(opt);
      });
      return s;
    }
  }

  // ==========================================================================
  //  Navigation & wiring
  // ==========================================================================

  var VIEWS = { board: renderBoard, timeline: renderTimeline, kanban: renderKanban, people: renderPeople, dashboard: renderDashboard };

  function navTo(view) {
    if (!VIEWS[view]) view = 'board';
    currentView = view;
    closePopover();
    document.querySelectorAll('[data-nav]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-nav') === view);
    });
    render();
    viewRoot.scrollTop = 0;
  }

  function render() {
    (VIEWS[currentView] || renderBoard)();
  }

  // Re-render on store changes, with a pop on the touched cell where possible.
  S.subscribe(function (state, meta) {
    render();
    if (meta && meta.id) {
      requestAnimationFrame(function () {
        var row = viewRoot.querySelector('[data-project="' + meta.id + '"]');
        if (row) {
          if (meta.milestoneDone) M.celebrate(row);
          var target = meta.field ? row.querySelector('[data-field="' + meta.field + '"]') : row;
          M.pop(target || row);
        }
      });
    }
  });

  document.querySelectorAll('[data-nav]').forEach(function (btn) {
    btn.addEventListener('click', function () { navTo(btn.getAttribute('data-nav')); });
  });

  document.getElementById('addProjectBtn').addEventListener('click', function () { openEditor(null); });
  document.getElementById('addProjectBtnMobile').addEventListener('click', function () { openEditor(null); });

  var searchDebounce;
  searchInput.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(function () { query = searchInput.value.trim(); render(); }, 140);
  });

  // Mobile menu button cycles quick actions (reset demo etc.)
  document.getElementById('menuBtn').addEventListener('click', function () {
    openPopover(document.getElementById('menuBtn'), function (pop) {
      pop.classList.add('popover--menu');
      var rename = el('button', 'menu-opt', { text: '✏️  Rename board' });
      rename.addEventListener('click', function () {
        closePopover();
        var name = prompt('Board name:', S.state.board.name);
        if (name) S.renameBoard(name.trim());
      });
      var addP = el('button', 'menu-opt', { text: '👤  Add team member' });
      addP.addEventListener('click', function () {
        closePopover();
        var name = prompt('Team member name:');
        if (!name) return;
        var role = prompt('Role:', 'Team member') || 'Team member';
        S.addPerson(name.trim(), role.trim());
        toast('Added ' + name.trim(), 'success');
      });
      var reset = el('button', 'menu-opt menu-opt--danger', { text: '↺  Reset demo data' });
      reset.addEventListener('click', function () {
        closePopover();
        if (confirm('Reset all data back to the sample board? This cannot be undone.')) {
          S.resetDemo(); toast('Demo data reset', 'info');
        }
      });
      pop.appendChild(rename); pop.appendChild(addP); pop.appendChild(reset);
    });
  });

  window.addEventListener('resize', closePopover);
  window.addEventListener('scroll', closePopover, true);

  // ---- Inline SVG icons -----------------------------------------------------
  function caretSVG() { return '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function checkSVG() { return '<svg viewBox="0 0 24 24"><path d="M5 13l4 4 10-11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function gripSVG() { return '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>'; }
  function flagSVG() { return '<svg viewBox="0 0 24 24"><path d="M6 3v18M6 4h11l-2 4 2 4H6" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'; }
  function layoutSVG() { return '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="4" width="8" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>'; }
  function gridSVG() { return '<svg viewBox="0 0 24 24"><path d="M4 5h6v14H4zM14 5h6v6h-6zM14 13h6v6h-6z"/></svg>'; }
  function chartSVG() { return '<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function alertSVG() { return '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5M12 17.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'; }
  function clockSVG() { return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'; }

  // ---- Boot -----------------------------------------------------------------
  navTo('board');

  // Register service worker (only over http/https; ignored on file://).
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('service-worker.js').catch(function () {});
    });
  }
})();
