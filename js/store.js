/* store.js — state, persistence, and domain logic for Line Sweep Pro. */
(function (global) {
  'use strict';

  var KEY = 'line-sweep-pro:v1';

  // ---- Reference data -------------------------------------------------------

  var STATUSES = [
    { id: 'not_started', label: 'Not started', color: '#9aa3b4' },
    { id: 'working',     label: 'Working on it', color: '#c1934f' },
    { id: 'stuck',       label: 'Stuck',        color: '#bf6b78' },
    { id: 'on_hold',     label: 'On hold',      color: '#8f84b6' },
    { id: 'done',        label: 'Done',         color: '#6f9e86' }
  ];

  var PRIORITIES = [
    { id: 'low',      label: 'Low',      color: '#7f93c0' },
    { id: 'medium',   label: 'Medium',   color: '#6f79b8' },
    { id: 'high',     label: 'High',     color: '#bf6b78' },
    { id: 'critical', label: 'Critical', color: '#556074' }
  ];

  var AVATAR_COLORS = ['#6d8bba', '#6f9e86', '#8f84b6', '#bf6b78', '#c1934f',
    '#5f9e8f', '#c07a5a', '#8b78b8', '#6fa0b8', '#b06b86', '#8a8674'];

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
      { id: uid('grp'), name: 'In Production', color: '#6d8bba', collapsed: false },
      { id: uid('grp'), name: 'Upcoming', color: '#8f84b6', collapsed: false },
      { id: uid('grp'), name: 'Completed', color: '#6f9e86', collapsed: false }
    ];

    function proj(o) {
      return {
        id: uid('prj'),
        name: o.name,
        groupId: o.groupId,
        ownerId: o.ownerId,
        status: o.status,
        priority: o.priority,
        startDate: o.start,
        dueDate: o.due,
        progress: o.progress,
        notes: o.notes || '',
        milestones: o.milestones || [],
        createdAt: t
      };
    }

    var g0 = groups[0].id, g1 = groups[1].id, g2 = groups[2].id;

    var projects = [
      proj({ name: 'Opening Night Graphics Package', groupId: g0, ownerId: people[0].id,
        status: 'working', priority: 'high', start: addDays(t, -12), due: addDays(t, 8), progress: 65,
        notes: 'Full lower-thirds + intro sting refresh for season opener.',
        milestones: [ms('Design approved', -6, true), ms('Animation pass', 2), ms('Final render + QC', 7)] }),

      proj({ name: 'Playoff Push Promo', groupId: g0, ownerId: people[1].id,
        status: 'stuck', priority: 'critical', start: addDays(t, -8), due: addDays(t, -1), progress: 40,
        notes: 'Waiting on licensed music clearance — blocking final cut.',
        milestones: [ms('Script locked', -5, true), ms('Rough cut', -2, true), ms('Music cleared', -1), ms('Delivery', 1)] }),

      proj({ name: 'Studio Set LED Refresh', groupId: g0, ownerId: people[2].id,
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
      settings: { atRiskDays: 3 }
    };
  }

  // ---- Store ----------------------------------------------------------------

  var listeners = [];
  var state = load();

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        // Non-destructive palette migration: keep avatar colours in sync with
        // the current (muted) palette without disturbing any user data.
        if (saved && saved.people) {
          saved.people.forEach(function (person, i) {
            person.color = AVATAR_COLORS[i % AVATAR_COLORS.length];
          });
        }
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
    var mine = state.projects.filter(function (p) { return p.ownerId === personId; });
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
      var p = {
        id: uid('prj'),
        name: data.name || 'Untitled project',
        groupId: data.groupId || state.groups[0].id,
        ownerId: data.ownerId || (state.people[0] && state.people[0].id),
        status: data.status || 'not_started',
        priority: data.priority || 'medium',
        startDate: data.startDate || t,
        dueDate: data.dueDate || addDays(t, 14),
        progress: data.progress != null ? data.progress : 0,
        notes: data.notes || '',
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
      if (p.status === 'done') p.progress = 100;
      emit(Object.assign({ type: 'update', id: id }, meta || {}));
      return p;
    },

    deleteProject: function (id) {
      state.projects = state.projects.filter(function (p) { return p.id !== id; });
      emit({ type: 'delete', id: id });
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

    renameBoard: function (name) { state.board.name = name; emit({ type: 'board' }); },

    resetDemo: function () {
      state = seed();
      persist();
      emit({ type: 'reset' });
    }
  };

  global.Store = Store;
})(window);
