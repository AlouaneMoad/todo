;(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const els = {
    list: $('#list'),
    template: $('#itemTemplate'),
    search: $('#search'),
    newTask: $('#newTask'),
    newTag: $('#newTag'),
    newDue: $('#newDue'),
    addBtn: $('#addBtn'),
    filterRadios: $$('input[name="filter"]'),
    count: $('#count'),
    exportLink: $('#exportLink'),
  };

  const KEY = 'prism_todos_v1';
  /** @type {Array<{id:string,title:string,done:boolean,tag?:string,due?:string,created:number,order:number}>} */
  let todos = load();

  const state = { filter: 'active', query: '' };

  function uid() { return Math.random().toString(36).slice(2, 9) }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        // Seed with some playful tasks on first run
        
        localStorage.setItem(KEY, JSON.stringify(seed));
        return seed;
      }
      const arr = JSON.parse(raw);
      // Ensure order property exists
      return arr.map((t, i) => ({ order: i, ...t }));
    } catch (e) { return [] }
  }

  function save() { localStorage.setItem(KEY, JSON.stringify(todos)) }

  function next(days) {
    const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
  }

  function render() {
    els.list.innerHTML = '';
    els.filterRadios.forEach(input => { input.checked = input.value === state.filter; });
    const filtered = todos
      .filter(t => state.filter === 'all' || (state.filter === 'done' ? t.done : !t.done))
      .filter(t => {
        if (!state.query) return true;
        const q = state.query.toLowerCase();
        return t.title.toLowerCase().includes(q) || (t.tag || '').toLowerCase().includes(q);
      })
      .sort((a, b) => a.order - b.order);

    els.count.textContent = filtered.length;

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = 'Nothing here yet. Add a task above, or try <strong>All / Active / Completed</strong> filters.'
      els.list.appendChild(empty);
      return;
    }

    for (const t of filtered) {
      const node = els.template.content.firstElementChild.cloneNode(true);
      node.dataset.id = t.id;

      // *** UPDATED RENDER LOGIC ***
      const inputEl = node.querySelector('.task-check-input');
      const titleEl = node.querySelector('.task-title');

      // Set checked state
      inputEl.checked = t.done;

      // Set title and data-text for glitch effect
      titleEl.textContent = t.title;
      titleEl.dataset.text = t.title;

      // Set meta info
      node.querySelector('.tag').textContent = t.tag || '';
      node.querySelector('.due').textContent = t.due ? `Due ${prettyDate(t.due)}` : '';
      
      // Hide empty meta elements
      if (!t.tag) node.querySelector('.tag').style.display = 'none';
      if (!t.due) node.querySelector('.due').style.display = 'none';

      // toggle (use 'change' event for checkboxes)
      inputEl.addEventListener('change', () => toggle(t.id));

      // inline edit
      titleEl.setAttribute('contenteditable', 'true');
      titleEl.setAttribute('spellcheck', 'false');
      titleEl.addEventListener('keydown', e => { 
        if (e.key === 'Enter') { 
          e.preventDefault(); 
          titleEl.blur(); 
        } 
      });
      titleEl.addEventListener('blur', () => {
        const newTitle = titleEl.textContent.trim();
        titleEl.dataset.text = newTitle; // Update data-text!
        edit(t.id, { title: newTitle });
      });

      // actions
      node.querySelector('[data-action="delete"]').addEventListener('click', () => remove(t.id));
      node.querySelector('[data-action="edit"]').addEventListener('click', () => {
        titleEl.focus();
        // Move cursor to end
        document.execCommand('selectAll', false, null);
        document.getSelection().collapseToEnd();
      });

      // drag
      node.addEventListener('dragstart', dragStart);
      node.addEventListener('dragend', dragEnd);
      node.addEventListener('dragover', dragOver);

      els.list.appendChild(node);
    }
  }

  function prettyDate(iso) {
    // Make date relative to today, not just a plain date
    const d = new Date(iso);
    const dUTC = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const today = new Date();
    const todayUTC = new Date(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

    const delta = (dUTC - todayUTC) / 86400000;
    
    if (delta === 0) return 'today';
    if (delta === 1) return 'tomorrow';
    if (delta === -1) return 'yesterday';
    
    const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    return dUTC.toLocaleDateString(undefined, opts);
  }

  // CRUD
  function add() {
    const title = els.newTask.value.trim();
    if (!title) return;
    const t = {
      id: uid(),
      title,
      done: false,
      tag: (els.newTag.value.trim() || '').replace(/\s+/g, '').replace(/#+/, '#'),
      due: els.newDue.value || undefined,
      created: Date.now(),
      order: todos.length ? Math.max(...todos.map(x => x.order)) + 1 : 0,
    };
    todos.push(t); save();
    els.newTask.value = ''; els.newTag.value = ''; els.newDue.value = '';
    render();
  }

  function toggle(id) {
    const t = todos.find(x => x.id === id); if (!t) return; t.done = !t.done; save(); render();
  }

  function edit(id, patch) {
    const i = todos.findIndex(x => x.id === id); if (i < 0) return; 
    // Only update if title is not empty
    if (patch.title === "") {
      render(); // Re-render to restore old title
      return;
    }
    todos[i] = { ...todos[i], ...patch }; 
    save(); 
    render();
  }

  function remove(id) {
    todos = todos.filter(x => x.id !== id); save(); render();
  }

  // Drag & drop ordering
  let dragId = null;
  function dragStart(e) {
    dragId = e.currentTarget.dataset.id; e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }
  function dragEnd(e) { e.currentTarget.classList.remove('dragging'); dragId = null; save(); render(); }
  function dragOver(e) {
    e.preventDefault(); const over = e.currentTarget; if (!dragId || over.dataset.id === dragId) return;
    const a = todos.find(t => t.id === dragId); const b = todos.find(t => t.id === over.dataset.id);
    if (!a || !b) return; const ao = a.order, bo = b.order; a.order = bo; b.order = ao; save(); render();
  }

  // Filters
  els.filterRadios.forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    state.filter = input.value;
    render();
  }));

  // Search
  els.search.addEventListener('input', () => { state.query = els.search.value.trim(); render(); });

  // Custom alert/confirm modal
  function showModal(message, isConfirm = false) {
    // This is a simple, non-blocking alert.
    // In a real app, you'd build a proper modal dialog.
    // For this example, we'll revert to confirm/alert
    // but with a console fallback for environments where it's blocked.
    try {
      if (isConfirm) {
        return confirm(message);
      } else {
        alert(message);
      }
    } catch (e) {
      console.warn("Modal blocked:", message);
      // If it was a confirm, default to 'false' (cancel)
      return isConfirm ? false : undefined;
    }
  }

  // Buttons / keyboard
  els.addBtn.addEventListener('click', add);
  els.newTask.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  window.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== els.search && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { 
      e.preventDefault(); 
      els.search.focus(); 
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      showModal(`Shortcuts:\n/ focus search\nEnter add task\nDrag to reorder\nEsc blur edits`);
    }
  });

  // Export
  els.exportLink.addEventListener('click', (e) => {
    e.preventDefault();
    const blob = new Blob([JSON.stringify(todos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'prism-todos.json'; a.click(); URL.revokeObjectURL(url);
  });

  // Init
  render();
})();
