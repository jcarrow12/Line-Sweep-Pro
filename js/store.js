/* store.js — state, persistence, and domain logic for Line Sweep Pro. */
(function (global) {
  'use strict';

  var KEY = 'line-sweep-pro:v1';

  // ---- Reference data -------------------------------------------------------

  var STATUSES = [
    { id: 'not_started', label: 'Not started', color: '#868fa1' },
    { id: 'working',     label: 'Working on it', color: '#b58234' },
    { id: 'stuck',       label: 'Stuck',        color: '#b04e5b' },
    { id: 'on_hold',     label: 'On hold',      color: '#7660a6' },
    { id: 'done',        label: 'Done',         color: '#4e8d6e' }
  ];

  var PRIORITIES = [
    { id: 'low',      label: 'Low',      color: '#6b88c0' },
    { id: 'medium',   label: 'Medium',   color: '#5a63ad' },
    { id: 'high',     label: 'High',     color: '#b04e5b' },
    { id: 'critical', label: 'Critical', color: '#454e63' }
  ];

  var AVATAR_COLORS = ['#4f77ae', '#4e8d6e', '#7660a6', '#b04e5b', '#b58234',
    '#3f8f7e', '#b0623f', '#7159a3', '#4d86a8', '#a04e6e', '#7a6f52'];

  // Each project carries its own color. Fill vs. outline (in app.js) encodes
  // priority; the hue simply identifies the project. Deep + distinct so the
  // rows never read as washed out.
  var PROJECT_COLORS = [
    '#3f6fb0', '#4759b0', '#5b8ccc', '#3f8fb0', '#2f8f86',
    '#2f8f6b', '#4e8d6e', '#6f8f3f', '#8a8f2e', '#c07a2e',
    '#c0504e', '#b0563f', '#a03f5f', '#a84e78', '#c94f8a',
    '#8a5cc0', '#7660a6', '#5a63ad', '#7a6f52', '#6b8f8f'];

  // Board columns beyond the fixed Project name. `visible` drives show/hide;
  // `greyscale` desaturates that column's color. Priority ships hidden — it's
  // now available on demand via the column menu.
  function defaultColumns() {
    return [
      { key: 'owner',    label: 'Team',           width: '92px',              visible: true,  greyscale: false },
      { key: 'status',   label: 'Status',         width: '150px',             visible: true,  greyscale: false },
      { key: 'timeline', label: 'Timeline',       width: '190px',             visible: true,  greyscale: false },
      { key: 'priority', label: 'Priority',       width: '110px',             visible: false, greyscale: false },
      { key: 'progress', label: 'Progress',       width: '150px',             visible: true,  greyscale: false },
      { key: 'next',     label: 'Next milestone',  width: 'minmax(160px,1.4fr)', visible: true, greyscale: false }
    ];
  }

  function nextProjectColor(existing) {
    // Pick the palette color least used so far, so a fresh project stands out.
    var counts = PROJECT_COLORS.map(function () { return 0; });
    (existing || []).forEach(function (p) {
      var i = PROJECT_COLORS.indexOf(p.color);
      if (i !== -1) counts[i]++;
    });
    var best = 0;
    for (var i = 1; i < counts.length; i++) { if (counts[i] < counts[best]) best = i; }
    return PROJECT_COLORS[best];
  }

  // ---- Utilities ------------------------------------------------------------

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9);
  }

  function todayISO() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    var d = iso ? new Date(iso + 'T00:00:00') : new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(aISO, bISO) {
    var a = new Date(aISO + 'T00:00:00');
    var b = new Date(bISO + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  function initials(name) {
    return name.split(/\s+/).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase();
  }

  // ---- Seed -----------------------------------------------------------------

  function seed() {
    var t = todayISO();

    var people = [
      { id: uid('emp'), name: 'Maya Rodriguez', role: 'Motion Designer' },
      { id: uid('emp'), name: 'James Okafor', role: 'Video Editor' },
      { id: uid('emp'), name: 'Priya Nair', role: 'Broadcast Engineer' },
      { id: uid('emp'), name: 'Devin Clarke', role: 'Producer' },
      { id: uid('emp'), name: 'Sara Lindqvist', role: 'Graphics Developer' },
      { id: uid('emp'), name: 'Tomás Rivera', role: 'Digital Producer' }
    ].map(function (p, i) {
      p.color = AVATAR_COLORS[i % AVATAR_COLORS.length];
      p.initials = initials(p.name);
      return p;
    });

    function ms(name, offset, done) {
      return { id: uid('ms'), name: name, date: addDays(t, offset), done: !!done };
    }

    var groups = [
      { id: uid('grp'), name: 'In Production', color: '#4f77ae', collapsed: false },
      { id: uid('grp'), name: 'Upcoming', color: '#7660a6', collapsed: false },
      { id: uid('grp'), name: 'Completed', color: '#4e8d6e', collapsed: false }
    ];

    function proj(o) {
      return {
        id: uid('prj'),
        name: o.name,
        groupId: o.groupId,
        ownerId: o.ownerId,
        assigneeIds: o.assigneeIds || [o.ownerId],
        status: o.status,
        priority: o.priority,
        startDate: o.start,
        dueDate: o.due,
        progress: o.progress,
        notes: o.notes || '',
        color: nc(),
        milestones: o.milestones || [],
        createdAt: t
      };
    }

    var g0 = groups[0].id, g1 = groups[1].id, g2 = groups[2].id;

    var pc = 0;
    function nc() { var c = PROJECT_COLORS[pc % PROJECT_COLORS.length]; pc++; return c; }

    var projects = [
      proj({ name: 'Opening Night Graphics Package', groupId: g0, ownerId: people[0].id,
        assigneeIds: [people[0].id, people[4].id, people[1].id],
        status: 'working', priority: 'high', start: addDays(t, -12), due: addDays(t, 8), progress: 65,
        notes: 'Full lower-thirds + intro sting refresh for season opener.',
        milestones: [ms('Design approved', -6, true), ms('Animation pass', 2), ms('Final render + QC', 7)] }),

      proj({ name: 'Playoff Push Promo', groupId: g0, ownerId: people[1].id,
        status: 'stuck', priority: 'critical', start: addDays(t, -8), due: addDays(t, -1), progress: 40,
        notes: 'Waiting on licensed music clearance — blocking final cut.',
        milestones: [ms('Script locked', -5, true), ms('Rough cut', -2, true), ms('Music cleared', -1), ms('Delivery', 1)] }),

      proj({ name: 'Studio Set LED Refresh', groupId: g0, ownerId: people[2].id,
        assigneeIds: [people[2].id, people[4].id],
        status: 'working', priority: 'medium', start: addDays(t, -20), due: addDays(t, 21), progress: 45,
        notes: 'New wall content + calibration for the A-camera set.',
        milestones: [ms('Vendor selected', -14, true), ms('Content templates', 5), ms('Install + calibrate', 18)] }),

      proj({ name: 'Mobile App v2.1 — Live Scores', groupId: g0, ownerId: people[5].id,
        status: 'working', priority: 'high', start: addDays(t, -5), due: addDays(t, 14), progress: 30,
        notes: 'Real-time score widget + push notifications.',
        milestones: [ms('API contract', -1, true), ms('Beta build', 6), ms('App Store submit', 12)] }),

      proj({ name: 'Highlight Automation Pipeline', groupId: g1, ownerId: people[4].id,
        status: 'not_started', priority: 'high', start: addDays(t, 3), due: addDays(t, 34), progress: 0,
        notes: 'Auto-clip generation from game feed with AI tagging.',
        milestones: [ms('Tech spike', 7), ms('MVP pipeline', 20), ms('Ops handoff', 33)] }),

      proj({ name: 'Sponsor Billboard Rotation', groupId: g1, ownerId: people[0].id,
        status: 'not_started', priority: 'medium', start: addDays(t, 10), due: addDays(t, 30), progress: 0,
        notes: 'Rotating sponsor animations for in-broadcast billboards.',
        milestones: [ms('Asset list', 12), ms('Build + review', 24)] }),

      proj({ name: 'Pre-Game Show Rebrand', groupId: g1, ownerId: people[3].id,
        status: 'on_hold', priority: 'low', start: addDays(t, 14), due: addDays(t, 60), progress: 5,
        notes: 'On hold pending exec creative direction.',
        milestones: [ms('Moodboard', 18), ms('Concept pitch', 30)] }),

      proj({ name: 'Season Recap Documentary', groupId: g2, ownerId: people[1].id,
        status: 'done', priority: 'medium', start: addDays(t, -60), due: addDays(t, -6), progress: 100,
        notes: 'Delivered and aired. Archived project files.',
        milestones: [ms('Interviews', -40, true), ms('Edit locked', -14, true), ms('Delivery', -6, true)] }),

      proj({ name: 'Broadcast Truck Firmware Update', groupId: g2, ownerId: people[2].id,
        status: 'done', priority: 'high', start: addDays(t, -30), due: addDays(t, -10), progress: 100,
        notes: 'All units updated and field-tested.',
        milestones: [ms('Staging test', -20, true), ms('Rollout', -10, true)] })
    ];

    return {
      board: { id: uid('brd'), name: 'Broadcast & Digital — Projects' },
      people: people,
      groups: groups,
      projects: projects,
      settings: { atRiskDays: 3 },
      columns: defaultColumns(),
      milestonePresets: defaultPresets()
    };
  }

  // Manager-defined milestone templates. `offset` = days from the project start.
  function defaultPresets() {
    return [
      { id: uid('pst'), name: 'Kickoff', offset: 0 },
      { id: uid('pst'), name: 'Design approved', offset: 7 },
      { id: uid('pst'), name: 'First cut', offset: 14 },
      { id: uid('pst'), name: 'Client review', offset: 21 },
      { id: uid('pst'), name: 'Final delivery', offset: 30 }
    ];
  }

  // ---- Store ----------------------------------------------------------------

  var listeners = [];
  var state = load();

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        // Non-destructive palette migration: keep avatar colors in sync with
        // the current (muted) palette without disturbing any user data.
        if (saved && saved.people) {
          saved.people.forEach(function (person, i) {
            person.color = AVATAR_COLORS[i % AVATAR_COLORS.length];
          });
        }
        // Migrate single-owner projects to the multi-assignee model, and give
        // every project its own color if it doesn't have one yet.
        if (saved && saved.projects) {
          saved.projects.forEach(function (p, i) {
            if (!p.assigneeIds || !p.assigneeIds.length) p.assigneeIds = [p.ownerId];
            if (p.assigneeIds.indexOf(p.ownerId) === -1) p.ownerId = p.assigneeIds[0];
            if (!p.color) p.color = PROJECT_COLORS[i % PROJECT_COLORS.length];
          });
        }
        // Column configuration is a later addition — backfill and reconcile so
        // new columns (e.g. Priority) appear for users who saved before it.
        if (!saved.columns) saved.columns = defaultColumns();
        else {
          var defs = defaultColumns();
          defs.forEach(function (d) {
            var found = saved.columns.filter(function (c) { return c.key === d.key; })[0];
            if (!found) saved.columns.push(d);
            else { found.label = d.label; found.width = d.width; } // keep labels/widths current
          });
          saved.columns = saved.columns.filter(function (c) {
            return defs.some(function (d) { return d.key === c.key; });
          });
        }
        // Spelling migration: the name-style token 'colour' became 'color'.
        if (saved.settings && saved.settings.nameStyle === 'colour') saved.settings.nameStyle = 'color';
        // Milestone presets are a later addition.
        if (!saved.milestonePresets) saved.milestonePresets = defaultPresets();
        return saved;
      }
    } catch (e) { /* ignore */ }
    var s = seed();
    persist(s);
    return s;
  }

  function persist(s) {
    try { global.localStorage.setItem(KEY, JSON.stringify(s || state)); } catch (e) {}
  }

  function emit(meta) {
    persist();
    listeners.forEach(function (fn) { fn(state, meta || {}); });
  }

  // ---- Selectors ------------------------------------------------------------

  function personById(id) { return state.people.find(function (p) { return p.id === id; }); }
  function groupById(id) { return state.groups.find(function (g) { return g.id === id; }); }
  function projectById(id) { return state.projects.find(function (p) { return p.id === id; }); }
  function statusMeta(id) { return STATUSES.find(function (s) { return s.id === id; }) || STATUSES[0]; }
  function priorityMeta(id) { return PRIORITIES.find(function (p) { return p.id === id; }) || PRIORITIES[0]; }

  function projectsInGroup(groupId) {
    return state.projects.filter(function (p) { return p.groupId === groupId; });
  }

  // Milestone health for a project.
  function projectHealth(p) {
    var today = todayISO();
    if (p.status === 'done') return { level: 'done', label: 'Complete' };
    var due = p.dueDate;
    if (due && daysBetween(today, due) < 0) return { level: 'overdue', label: 'Overdue' };
    if (p.status === 'stuck') return { level: 'overdue', label: 'Blocked' };
    if (due && daysBetween(today, due) <= (state.settings.atRiskDays || 3)) return { level: 'risk', label: 'Due soon' };
    return { level: 'ok', label: 'On track' };
  }

  function nextMilestone(p) {
    var pending = (p.milestones || []).filter(function (m) { return !m.done; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return pending[0] || null;
  }

  // All milestones across projects, flattened with project context.
  function allMilestones() {
    var out = [];
    state.projects.forEach(function (p) {
      (p.milestones || []).forEach(function (m) {
        out.push({ project: p, milestone: m });
      });
    });
    return out;
  }

  function workloadFor(personId) {
    var mine = state.projects.filter(function (p) {
      return (p.assigneeIds || [p.ownerId]).indexOf(personId) !== -1;
    });
    var active = mine.filter(function (p) { return p.status !== 'done'; });
    var overdue = mine.filter(function (p) { return projectHealth(p).level === 'overdue'; });
    var avg = active.length ? Math.round(active.reduce(function (s, p) { return s + p.progress; }, 0) / active.length) : 0;
    return { total: mine.length, active: active.length, overdue: overdue.length, avgProgress: avg, projects: mine };
  }

  function stats() {
    var byStatus = {};
    STATUSES.forEach(function (s) { byStatus[s.id] = 0; });
    var overdue = 0, atRisk = 0, done = 0;
    state.projects.forEach(function (p) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      var h = projectHealth(p);
      if (h.level === 'overdue') overdue++;
      else if (h.level === 'risk') atRisk++;
      if (p.status === 'done') done++;
    });
    var total = state.projects.length;
    var avgProgress = total ? Math.round(state.projects.reduce(function (s, p) { return s + p.progress; }, 0) / total) : 0;
    return { total: total, byStatus: byStatus, overdue: overdue, atRisk: atRisk, done: done, avgProgress: avgProgress };
  }

  // Upcoming milestones (not done), sorted by date, within `days`.
  function upcomingMilestones(days) {
    var today = todayISO();
    return allMilestones()
      .filter(function (x) { return !x.milestone.done; })
      .map(function (x) { return { project: x.project, milestone: x.milestone, inDays: daysBetween(today, x.milestone.date) }; })
      .filter(function (x) { return days == null || x.inDays <= days; })
      .sort(function (a, b) { return a.inDays - b.inDays; });
  }

  // ---- Mutations ------------------------------------------------------------

  var Store = {
    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    AVATAR_COLORS: AVATAR_COLORS,
    PROJECT_COLORS: PROJECT_COLORS,

    get state() { return state; },
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (l) { return l !== fn; }); }; },

    // selectors
    personById: personById,
    groupById: groupById,
    projectById: projectById,
    statusMeta: statusMeta,
    priorityMeta: priorityMeta,
    projectsInGroup: projectsInGroup,
    projectHealth: projectHealth,
    nextMilestone: nextMilestone,
    allMilestones: allMilestones,
    workloadFor: workloadFor,
    stats: stats,
    upcomingMilestones: upcomingMilestones,
    todayISO: todayISO,
    addDays: addDays,
    daysBetween: daysBetween,
    initials: initials,

    addProject: function (data) {
      var t = todayISO();
      var ids = (data.assigneeIds && data.assigneeIds.length)
        ? data.assigneeIds
        : [data.ownerId || (state.people[0] && state.people[0].id)];
      var p = {
        id: uid('prj'),
        name: data.name || 'Untitled project',
        groupId: data.groupId || state.groups[0].id,
        ownerId: ids[0],
        assigneeIds: ids,
        status: data.status || 'not_started',
        priority: data.priority || 'medium',
        startDate: data.startDate || t,
        dueDate: data.dueDate || addDays(t, 14),
        progress: data.progress != null ? data.progress : 0,
        notes: data.notes || '',
        color: data.color || nextProjectColor(state.projects),
        milestones: data.milestones || [],
        createdAt: t
      };
      state.projects.unshift(p);
      emit({ type: 'add', id: p.id });
      return p;
    },

    updateProject: function (id, patch, meta) {
      var p = projectById(id);
      if (!p) return;
      Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
      // Keep owner (the lead) as the first assignee.
      if (patch.assigneeIds) {
        if (!p.assigneeIds.length) p.assigneeIds = [p.ownerId];
        p.ownerId = p.assigneeIds[0];
      }
      if (p.status === 'done') p.progress = 100;
      emit(Object.assign({ type: 'update', id: id }, meta || {}));
      return p;
    },

    // Change status, optionally recording a timestamped "why" note. Notes are
    // kept as a log; the most recent is surfaced on the board.
    changeStatus: function (id, status, note) {
      var p = projectById(id);
      if (!p) return;
      var from = p.status;
      p.status = status;
      if (status === 'done') p.progress = 100;
      if (note && note.trim()) {
        if (!p.statusLog) p.statusLog = [];
        p.statusLog.push({ status: status, note: note.trim(), at: new Date().toISOString(), from: from });
      }
      emit({ type: 'update', id: id, field: 'status' });
      return p;
    },

    latestStatusNote: function (p) {
      var l = p && p.statusLog;
      return (l && l.length) ? l[l.length - 1] : null;
    },

    deleteProject: function (id) {
      state.projects = state.projects.filter(function (p) { return p.id !== id; });
      emit({ type: 'delete', id: id });
    },

    // Reorder the projects within one category. `orderedIds` is the new order
    // of that group's projects; every other project keeps its slot.
    reorderProjects: function (groupId, orderedIds) {
      var queue = orderedIds.slice(), qi = 0;
      var next = state.projects.map(function (p) { return p.groupId === groupId ? null : p; });
      for (var i = 0; i < next.length; i++) {
        if (next[i] === null) { next[i] = projectById(queue[qi++]) || null; }
      }
      next = next.filter(Boolean);
      // Safety: append any group projects that weren't in orderedIds.
      state.projects.forEach(function (p) { if (next.indexOf(p) === -1) next.push(p); });
      state.projects = next;
      emit({ type: 'projects-reorder' });
    },

    // Reorder the phase categories on the board. `orderedIds` is the new full
    // order; any group missing from it is appended (safety).
    reorderGroups: function (orderedIds) {
      var map = {};
      state.groups.forEach(function (g) { map[g.id] = g; });
      var next = [];
      orderedIds.forEach(function (id) { if (map[id] && next.indexOf(map[id]) === -1) next.push(map[id]); });
      state.groups.forEach(function (g) { if (next.indexOf(g) === -1) next.push(g); });
      state.groups = next;
      emit({ type: 'groups-reorder' });
    },

    moveProjectToGroup: function (id, groupId) {
      var p = projectById(id);
      if (p) { p.groupId = groupId; emit({ type: 'move', id: id }); }
    },

    toggleMilestone: function (projectId, milestoneId) {
      var p = projectById(projectId);
      if (!p) return;
      var m = p.milestones.find(function (x) { return x.id === milestoneId; });
      if (!m) return;
      m.done = !m.done;
      // Auto-progress from milestone completion.
      if (p.milestones.length) {
        var doneCount = p.milestones.filter(function (x) { return x.done; }).length;
        p.progress = Math.round((doneCount / p.milestones.length) * 100);
        if (p.progress === 100) p.status = 'done';
        else if (p.status === 'done') p.status = 'working';
      }
      emit({ type: 'milestone', id: projectId, milestoneDone: m.done });
      return m;
    },

    addMilestone: function (projectId, name, date) {
      var p = projectById(projectId);
      if (!p) return;
      var m = { id: uid('ms'), name: name || 'New milestone', date: date || todayISO(), done: false };
      p.milestones.push(m);
      emit({ type: 'milestone-add', id: projectId });
      return m;
    },

    removeMilestone: function (projectId, milestoneId) {
      var p = projectById(projectId);
      if (!p) return;
      p.milestones = p.milestones.filter(function (m) { return m.id !== milestoneId; });
      emit({ type: 'milestone-remove', id: projectId });
    },

    addPerson: function (name, role) {
      var person = {
        id: uid('emp'), name: name, role: role || 'Team member',
        color: AVATAR_COLORS[state.people.length % AVATAR_COLORS.length],
        initials: initials(name)
      };
      state.people.push(person);
      emit({ type: 'person-add', id: person.id });
      return person;
    },

    updatePerson: function (id, patch) {
      var person = personById(id);
      if (!person) return;
      if (patch.name != null) { person.name = patch.name; person.initials = initials(patch.name); }
      if (patch.role != null) person.role = patch.role;
      emit({ type: 'person-update', id: id });
      return person;
    },

    // Remove a person and cleanly unassign them everywhere: drop them from every
    // project's assignees (a project left with none becomes unassigned) and clear
    // any milestones they owned.
    removePerson: function (id) {
      state.people = state.people.filter(function (p) { return p.id !== id; });
      state.projects.forEach(function (p) {
        if (p.assigneeIds) p.assigneeIds = p.assigneeIds.filter(function (a) { return a !== id; });
        if (!p.assigneeIds) p.assigneeIds = [];
        p.ownerId = p.assigneeIds[0] || null;
        (p.milestones || []).forEach(function (m) { if (m.assigneeId === id) m.assigneeId = null; });
      });
      emit({ type: 'person-remove', id: id });
    },

    setProjectColor: function (id, color) {
      var p = projectById(id);
      if (!p) return;
      p.color = color;
      emit({ type: 'update', id: id, field: 'color' });
    },

    // Board column config (show/hide + greyscale).
    toggleColumn: function (key) {
      var c = (state.columns || []).filter(function (x) { return x.key === key; })[0];
      if (!c) return;
      c.visible = !c.visible;
      emit({ type: 'columns' });
    },

    toggleColumnGreyscale: function (key) {
      var c = (state.columns || []).filter(function (x) { return x.key === key; })[0];
      if (!c) return;
      c.greyscale = !c.greyscale;
      emit({ type: 'columns' });
    },

    visibleColumns: function () {
      return (state.columns || []).filter(function (c) { return c.visible; });
    },

    // Reorder the visible columns. `orderedVisibleKeys` is the new order of the
    // currently-visible columns; hidden columns keep their existing slots.
    reorderColumns: function (orderedVisibleKeys) {
      var byKey = {};
      state.columns.forEach(function (c) { byKey[c.key] = c; });
      var queue = orderedVisibleKeys.slice(), qi = 0;
      var next = state.columns.map(function (c) { return c.visible ? null : c; });
      for (var i = 0; i < next.length; i++) {
        if (next[i] === null) { var k = queue[qi++]; next[i] = byKey[k] || null; }
      }
      // Safety: drop any nulls (shouldn't happen) and append any missing columns.
      next = next.filter(Boolean);
      state.columns.forEach(function (c) { if (next.indexOf(c) === -1) next.push(c); });
      state.columns = next;
      emit({ type: 'columns' });
    },

    columnByKey: function (key) {
      return (state.columns || []).filter(function (c) { return c.key === key; })[0];
    },

    // Editor layout preference ('stack' | 'wide'). Persist quietly — no need to
    // re-render the board when the modal's own layout changes.
    setEditorLayout: function (layout) {
      state.settings.editorLayout = layout;
      persist();
    },

    // Project-name appearance on the board: 'color' (project color) | 'grey' |
    // 'dark' (dark greyscale).
    setNameStyle: function (style) {
      state.settings.nameStyle = style;
      emit({ type: 'settings' });
    },

    renameBoard: function (name) { state.board.name = name; emit({ type: 'board' }); },

    setAtRiskDays: function (n) {
      n = parseInt(n, 10);
      if (isNaN(n) || n < 0) return;
      state.settings.atRiskDays = n;
      emit({ type: 'settings' });
    },

    // ---- Milestone presets ----
    addPreset: function (name, offset) {
      var pst = { id: uid('pst'), name: name || 'New preset', offset: parseInt(offset, 10) || 0 };
      state.milestonePresets.push(pst);
      emit({ type: 'presets' });
      return pst;
    },
    updatePreset: function (id, patch) {
      var pst = (state.milestonePresets || []).filter(function (x) { return x.id === id; })[0];
      if (!pst) return;
      if (patch.name != null) pst.name = patch.name;
      if (patch.offset != null) { var o = parseInt(patch.offset, 10); pst.offset = isNaN(o) ? 0 : o; }
      emit({ type: 'presets' });
    },
    removePreset: function (id) {
      state.milestonePresets = (state.milestonePresets || []).filter(function (x) { return x.id !== id; });
      emit({ type: 'presets' });
    },

    // Remove all completed (done) projects. Export first — this can't be undone.
    completedProjects: function () { return state.projects.filter(function (p) { return p.status === 'done'; }); },
    clearCompleted: function () {
      var removed = state.projects.filter(function (p) { return p.status === 'done'; }).length;
      state.projects = state.projects.filter(function (p) { return p.status !== 'done'; });
      emit({ type: 'clear-completed' });
      return removed;
    },

    resetDemo: function () {
      state = seed();
      persist();
      emit({ type: 'reset' });
    }
  };

  global.Store = Store;
})(window);
