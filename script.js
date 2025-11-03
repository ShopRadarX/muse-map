// script.js — MuseMap core functionality (commit 2)
// Features: generate nodes from seed, render, drag, edit
(() => {
  // DOM refs
  const seedInput = document.getElementById('seedInput');
  const generateBtn = document.getElementById('generateBtn');
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const nodeCount = document.getElementById('nodeCount');
  const lastSaved = document.getElementById('lastSaved');

  const canvas = document.getElementById('mapCanvas');
  const ctx = canvas.getContext('2d');

  // Scale canvas for crispness
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const DPR = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * DPR);
    canvas.height = Math.round(rect.height * DPR);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Node model
  class Node {
    constructor(id, text, x, y, color) {
      this.id = id;
      this.text = text;
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.r = Math.max(36, 10 + text.length * 6);
      this.color = color;
    }
  }

  let nodes = [];
  let links = [];
  let dragging = null;
  let offset = { x: 0, y: 0 };
  let hoverNode = null;

  // Utilities
  const COLORS = ['#7c5cff', '#4ce0c4', '#ff9aa2', '#ffd97a', '#6be7ff'];
  const rand = (a, b) => a + Math.random() * (b - a);

  function randomColor(i = 0) {
    return COLORS[i % COLORS.length];
  }

  function clear() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    // draw links
    ctx.lineWidth = 2;
    links.forEach(l => {
      const a = nodes.find(n => n.id === l[0]);
      const b = nodes.find(n => n.id === l[1]);
      if (!a || !b) return;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    // draw nodes
    nodes.forEach(n => {
      // shadow
      ctx.beginPath();
      ctx.fillStyle = 'rgba(2,6,23,0.6)';
      ctx.arc(n.x + 2, n.y + 6, n.r + 8, 0, Math.PI * 2);
      ctx.fill();

      // main circle
      ctx.beginPath();
      ctx.fillStyle = n.color;
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();

      // text
      ctx.fillStyle = '#02121a';
      ctx.font = '600 14px Inter, system-ui, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrapText(n.text, n.r * 1.6, ctx);
      const lineHeight = 16;
      const startY = n.y - (lines.length - 1) * (lineHeight / 2);
      ctx.fillStyle = '#02121a';
      lines.forEach((ln, i) => {
        ctx.fillText(ln, n.x, startY + i * lineHeight);
      });
    });

    // hover highlight
    if (hoverNode) {
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.arc(hoverNode.x, hoverNode.y, hoverNode.r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function wrapText(text, maxWidth, ctxRef) {
    const words = text.split(/\s+/);
    const lines = [];
    let cur = '';
    for (let w of words) {
      const test = cur ? cur + ' ' + w : w;
      const width = ctxRef.measureText(test).width;
      if (width > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3); // max 3 lines
  }

  // Basic physics / easing to relax positions slightly
  function tick() {
    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        const minDist = a.r + b.r + 20;
        if (d2 < 1) d2 = 1;
        const dist = Math.sqrt(d2);
        if (dist < minDist) {
          const push = (minDist - dist) * 0.02;
          const nx = (dx / dist) * push;
          const ny = (dy / dist) * push;
          a.x -= nx;
          a.y -= ny;
          b.x += nx;
          b.y += ny;
        }
      }
    }

    // spring links
    links.forEach(([idA, idB]) => {
      const a = nodes.find(n => n.id === idA);
      const b = nodes.find(n => n.id === idB);
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const target = Math.max(120, a.r + b.r + 30);
      const force = (dist - target) * 0.002;
      a.x += dx * force;
      a.y += dy * force;
      b.x -= dx * force;
      b.y -= dy * force;
    });

    // damping & constraints
    const rect = canvas.getBoundingClientRect();
    nodes.forEach(n => {
      // simple easing to center if not dragging
      n.x += (Math.max(60, rect.width / 2) - n.x) * 0.002; // subtle
      n.y += (Math.max(60, rect.height / 2) - n.y) * 0.002;
      // clamp
      n.x = Math.max(n.r + 6, Math.min(rect.width - n.r - 6, n.x));
      n.y = Math.max(n.r + 6, Math.min(rect.height - n.r - 6, n.y));
    });
  }

  function loop() {
    tick();
    draw();
    requestAnimationFrame(loop);
  }

  // Interaction
  function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left),
      y: (evt.clientY - rect.top)
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    const pos = getMousePos(e);
    dragging = nodes.find(n => {
      const dx = pos.x - n.x, dy = pos.y - n.y;
      return dx * dx + dy * dy < n.r * n.r;
    }) || null;
    if (dragging) {
      offset.x = pos.x - dragging.x;
      offset.y = pos.y - dragging.y;
    }
  });

  window.addEventListener('mousemove', (e) => {
    const pos = getMousePos(e);
    hoverNode = nodes.find(n => {
      const dx = pos.x - n.x, dy = pos.y - n.y;
      return dx * dx + dy * dy < (n.r + 6) * (n.r + 6);
    }) || null;

    if (dragging) {
      dragging.x = pos.x - offset.x;
      dragging.y = pos.y - offset.y;
    }
  });

  window.addEventListener('mouseup', () => {
    dragging = null;
  });

  canvas.addEventListener('dblclick', (e) => {
    // edit node text (prompt for simplicity)
    const pos = getMousePos(e);
    const target = nodes.find(n => {
      const dx = pos.x - n.x, dy = pos.y - n.y;
      return dx * dx + dy * dy < n.r * n.r;
    });
    if (target) {
      const newText = prompt('Edit node text:', target.text);
      if (newText !== null) {
        target.text = newText.trim() || target.text;
        updateCounts();
      }
    }
  });

  // Generation logic (procedural approach)
  function generateFromSeed(seed) {
    nodes = [];
    links = [];
    const base = seed.toLowerCase();
    const root = new Node(`n0`, base, 0, 0, randomColor(0));
    nodes.push(root);

    // produce 6-9 child nodes by mixing affixes, synonyms-like tokens, adjectives
    const suffixes = ['Lab', 'Flow', 'Map', 'Drop', 'Seed', 'Spark', 'Scope', 'Nest', 'Wave'];
    const verbs = ['plan', 'find', 'build', 'dream', 'sketch', 'shape', 'grow', 'trace'];
    const adjectives = ['bright', 'calm', 'wild', 'tiny', 'bold', 'clear', 'urban'];

    const pool = [];
    // mix strategies
    for (let i = 0; i < suffixes.length; i++) pool.push(`${capitalize(base)} ${suffixes[i]}`);
    for (let v of verbs) pool.push(`${v} ${base}`);
    for (let a of adjectives) pool.push(`${capitalize(a)} ${base}`);
    // add some fragmentations
    const fragments = base.match(/.{1,4}/g) || [base];
    fragments.forEach((f, i) => pool.push(`${f}${i}`));

    // unique selection
    const count = Math.min(9, Math.max(5, Math.floor(rand(5, 9))));
    const chosen = shuffle(pool).slice(0, count);

    // position nodes around center
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    root.x = cx;
    root.y = cy;

    chosen.forEach((txt, idx) => {
      const ang = (idx / chosen.length) * Math.PI * 2 + rand(-0.3, 0.3);
      const radius = rand(110, 220);
      const x = cx + Math.cos(ang) * radius;
      const y = cy + Math.sin(ang) * radius;
      nodes.push(new Node(`n${idx + 1}`, txt, x, y, randomColor(idx + 1)));
      links.push([root.id, `n${idx + 1}`]);
    });

    updateCounts();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function updateCounts() {
    nodeCount.textContent = nodes.length;
  }

  // wire generate button
  generateBtn.addEventListener('click', () => {
    const seed = seedInput.value.trim();
    if (!seed) {
      alert('Type a seed word and try again.');
      return;
    }
    generateFromSeed(seed);
  });

  // minimal export / import helpers (real saving added in next commit)
  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify({ nodes, links }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muse-map-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.nodes && parsed.links) {
          nodes = parsed.nodes.map(n => new Node(n.id, n.text, n.x, n.y, n.color || randomColor()));
          links = parsed.links.slice();
          updateCounts();
        } else {
          alert('Invalid file.');
        }
      } catch (err) {
        alert('Could not parse file.');
      }
    };
    reader.readAsText(file);
    ev.target.value = '';
  });

  // placeholders for save/load buttons (persistence implemented next commit)
  saveBtn.addEventListener('click', () => {
    alert('Save to localStorage will be implemented in the next commit.');
  });
  loadBtn.addEventListener('click', () => {
    alert('Load from localStorage will be implemented in the next commit.');
  });

  // start loop
  loop();
})();
