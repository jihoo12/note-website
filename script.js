/* ============================================================
   TeX Board — script.js
   ============================================================ */

const workspace     = document.getElementById("workspace");
const addBtn        = document.getElementById("addTextareaBtn");
const toggleLineBtn = document.getElementById("toggleLineBtn");
const connectLabel  = document.getElementById("connectLabel");
const clearBtn      = document.getElementById("clearLinesBtn");
const svgCanvas     = document.getElementById("svg-canvas");
const statusHint    = document.getElementById("statusHint");
const toast         = document.getElementById("toast");

let nodeCounter = 3;
let currentDraggable = null;
let offsetX = 0, offsetY = 0;

let isDrawingMode = false;
let connections = [];       // { from, to, path, deleteBtn }
let activeLine  = null;
let startContainer = null;

// ---- Utility: Toast notification --------------------------
let toastTimer;
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ---- Utility: unique ID -----------------------------------
function generateId() {
    return 'node_' + Math.random().toString(36).substr(2, 9);
}

// ---- MathJax Rendering ------------------------------------
function renderMath(container) {
    const textarea = container.querySelector('textarea');
    const preview  = container.querySelector('.tex-preview');
    const raw = textarea.value;

    if (!raw.trim()) {
        preview.innerHTML = `<span style="color:var(--text-dim); font-size:12px;">${textarea.placeholder}</span>`;
        return;
    }

    preview.innerHTML = raw.replace(/\n/g, '<br>');

    if (window.MathJax && window.MathJax.typesetPromise) {
        MathJax.typesetPromise([preview]).then(() => {
            updateAllConnections();
        });
    }
}

// ---- Sync preview size to textarea (for resize handle) ----
function syncPreviewSize(container) {
    const textarea = container.querySelector('textarea');
    const preview  = container.querySelector('.tex-preview');
    const wrapper  = container.querySelector('.editor-wrapper');

    // textarea reports its rendered size via offsetWidth/Height
    const w = textarea.offsetWidth;
    const h = textarea.offsetHeight;
    if (w > 0 && h > 0) {
        wrapper.style.width  = w + 'px';
        wrapper.style.height = h + 'px';
        preview.style.width  = w + 'px';
        preview.style.height = h + 'px';
    }
}

// ---- Attach editor events to a node container -------------
function attachEditorEvents(container) {
    container.id = generateId();
    const textarea = container.querySelector('textarea');
    const preview  = container.querySelector('.tex-preview');

    textarea.addEventListener('focus', () => {
        container.classList.add('editing');
    });

    textarea.addEventListener('blur', () => {
        container.classList.remove('editing');
        renderMath(container);
    });

    preview.addEventListener('click', () => {
        if (isDrawingMode) return;
        container.classList.add('editing');
        textarea.focus();
    });

    // Resize observer to keep things in sync
    const resizeObserver = new ResizeObserver(() => {
        syncPreviewSize(container);
        updateAllConnections();
    });
    resizeObserver.observe(textarea);

    // Delete button
    const deleteBtn = container.querySelector('.node-delete');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNode(container);
    });

    // Node title — prevent drag when typing
    const titleInput = container.querySelector('.node-title');
    titleInput.addEventListener('mousedown', e => e.stopPropagation());

    // Connect dots (4 directions) — drag-to-connect, always active
    container.querySelectorAll('.node-connect-dot').forEach(dot => {
        dot.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const dir = dot.dataset.dir;
            startConnection(container, e, dir);
        });
    });

    renderMath(container);
}

// ---- Delete a node and its connections --------------------
function deleteNode(container) {
    // Remove all connections involving this node
    connections = connections.filter(conn => {
        if (conn.from === container || conn.to === container) {
            conn.path.remove();
            if (conn.deleteBtn) conn.deleteBtn.remove();
            return false;
        }
        return true;
    });

    container.style.transition = 'opacity 0.2s, transform 0.2s';
    container.style.opacity = '0';
    container.style.transform = 'scale(0.9)';
    setTimeout(() => container.remove(), 200);
    showToast('Node deleted');
}

// Initialize default containers
document.querySelectorAll('.draggable-container').forEach(el => attachEditorEvents(el));

// ---- Toggle Connect Mode ----------------------------------
toggleLineBtn.addEventListener("click", () => {
    isDrawingMode = !isDrawingMode;
    if (isDrawingMode) {
        connectLabel.textContent = 'Cancel';
        toggleLineBtn.classList.add('active');
        document.body.classList.add('drawing-mode');
        statusHint.textContent = 'Click a nodes dot to start · Click another to connect';
        statusHint.classList.add('alert');
    } else {
        resetDrawingState();
    }
});

function resetDrawingState() {
    isDrawingMode = false;
    isDraggingConnection = false;
    connectLabel.textContent = 'Connect';
    toggleLineBtn.classList.remove('active');
    document.body.classList.remove('drawing-mode');
    statusHint.textContent = 'Drag handles to move · Drag dots to connect nodes';
    statusHint.classList.remove('alert');
    if (activeLine) { activeLine.remove(); activeLine = null; }
    startDir = null;
    if (startContainer) {
        startContainer.classList.remove('connect-source');
        startContainer = null;
    }
    // Clear all target highlights
    document.querySelectorAll('.connect-target-hover, .dot-target-hover').forEach(el =>
        el.classList.remove('connect-target-hover', 'dot-target-hover'));
}

// ---- Clear all connections --------------------------------
clearBtn.addEventListener('click', () => {
    connections.forEach(c => {
        c.path.remove();
        if (c.deleteBtn) c.deleteBtn.remove();
    });
    connections = [];
    showToast('All connections cleared');
});

// ---- Start drawing a connection line ---------------------
let startDir = null;
let isDraggingConnection = false;

function startConnection(container, e, dir) {
    // Works with OR without connect mode — drag-to-connect is always available
    startContainer = container;
    startDir = dir;
    isDraggingConnection = true;
    container.classList.add('connect-source');
    document.body.classList.add('drawing-mode');

    const start = getDotPoint(startContainer, dir);
    activeLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    activeLine.setAttribute("class", "preview-path");
    svgCanvas.appendChild(activeLine);
    updateLinePath(activeLine, start.x, start.y, e.clientX + window.scrollX, e.clientY + window.scrollY, dir, null);
}

// ---- Get exact pixel center of a specific direction dot ---
function getDotPoint(container, dir) {
    const dot = container.querySelector(`.node-connect-dot[data-dir="${dir}"]`);
    if (!dot) return getNodeCenter(container);
    const r = dot.getBoundingClientRect();
    return {
        x: r.left + r.width  / 2 + window.scrollX,
        y: r.top  + r.height / 2 + window.scrollY
    };
}

// ---- Find the best (closest) dot pair between two nodes ---
function getBestDotPair(fromContainer, toContainer) {
    const dirs = ['top', 'right', 'bottom', 'left'];
    let best = null, bestDist = Infinity;
    for (const fd of dirs) {
        for (const td of dirs) {
            const fp = getDotPoint(fromContainer, fd);
            const tp = getDotPoint(toContainer, td);
            const dist = Math.hypot(fp.x - tp.x, fp.y - tp.y);
            if (dist < bestDist) { bestDist = dist; best = { fromDir: fd, toDir: td }; }
        }
    }
    return best;
}

// ---- Get center of a dot by stored direction --------------
function getConnectPoint(container, dir) {
    if (dir) return getDotPoint(container, dir);
    // Fallback: use right dot
    return getDotPoint(container, 'right');
}

function getNodeCenter(container) {
    const rect = container.getBoundingClientRect();
    return {
        x: rect.left + rect.width  / 2 + window.scrollX,
        y: rect.top  + rect.height / 2 + window.scrollY
    };
}

// ---- Curved path with direction-aware control points -----
function updateLinePath(lineEl, x1, y1, x2, y2, fromDir, toDir) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const tension = Math.max(40, dist * 0.45);

    const offset = (dir, t) => {
        if (dir === 'right')  return { cx: x1 + t, cy: y1 };
        if (dir === 'left')   return { cx: x1 - t, cy: y1 };
        if (dir === 'bottom') return { cx: x1,     cy: y1 + t };
        if (dir === 'top')    return { cx: x1,     cy: y1 - t };
        // fallback: horizontal
        return { cx: x1 + (x2 > x1 ? t : -t), cy: y1 };
    };
    const offset2 = (dir, t) => {
        if (dir === 'right')  return { cx: x2 + t, cy: y2 };
        if (dir === 'left')   return { cx: x2 - t, cy: y2 };
        if (dir === 'bottom') return { cx: x2,     cy: y2 + t };
        if (dir === 'top')    return { cx: x2,     cy: y2 - t };
        return { cx: x2 - (x2 > x1 ? t : -t), cy: y2 };
    };

    const c1 = fromDir ? offset(fromDir,   tension) : { cx: x1 + tension, cy: y1 };
    const c2 = toDir   ? offset2(toDir,   tension) : { cx: x2 - tension, cy: y2 };

    lineEl.setAttribute("d", `M ${x1} ${y1} C ${c1.cx} ${c1.cy}, ${c2.cx} ${c2.cy}, ${x2} ${y2}`);
}

// ---- Update all rendered connections ----------------------
function updateAllConnections() {
    connections.forEach(conn => {
        // Re-evaluate best dot pair every move (nodes may have repositioned)
        const best = getBestDotPair(conn.from, conn.to);
        conn.fromDir = best.fromDir;
        conn.toDir   = best.toDir;

        const s = getDotPoint(conn.from, conn.fromDir);
        const e = getDotPoint(conn.to,   conn.toDir);
        updateLinePath(conn.path, s.x, s.y, e.x, e.y, conn.fromDir, conn.toDir);

        if (conn.deleteBtn) {
            const mx = (s.x + e.x) / 2;
            const my = (s.y + e.y) / 2;
            conn.deleteBtn.setAttribute('transform', `translate(${mx}, ${my})`);
        }
    });
}

// ---- Create permanent connection with delete button -------
function finalizeConnection(fromContainer, toContainer) {
    // Prevent duplicate connections
    const exists = connections.some(c =>
        (c.from === fromContainer && c.to === toContainer) ||
        (c.from === toContainer   && c.to === fromContainer)
    );
    if (exists) {
        showToast('Connection already exists');
        return;
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "connection-path");
    svgCanvas.appendChild(path);

    // Delete button (SVG group)
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "conn-delete-btn");
    g.style.pointerEvents = 'all';
    g.innerHTML = `
        <circle r="9" cx="0" cy="0" />
        <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke-width="1.5" stroke-linecap="round"/>
    `;
    g.addEventListener('click', () => {
        const idx = connections.findIndex(c => c.path === path);
        if (idx !== -1) {
            connections[idx].path.remove();
            connections[idx].deleteBtn.remove();
            connections.splice(idx, 1);
            showToast('Connection removed');
        }
    });
    svgCanvas.appendChild(g);

    const best = getBestDotPair(fromContainer, toContainer);
    const conn = { from: fromContainer, to: toContainer, path, deleteBtn: g,
                   fromDir: best.fromDir, toDir: best.toDir };
    connections.push(conn);
    updateAllConnections();
    showToast('Nodes connected');
}

// ---- Mouse / Pointer Events ------------------------------
document.addEventListener("mousedown", (e) => {
    // Dragging — only from drag-handle
    if (e.target.closest('.drag-handle') && !isDrawingMode) {
        const container = e.target.closest('.draggable-container');
        if (!container) return;
        currentDraggable = container;
        const rect = container.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        container.classList.add('is-dragging');
        document.querySelectorAll('.draggable-container').forEach(el => el.style.zIndex = '2');
        container.style.zIndex = '100';
        e.preventDefault();
        return;
    }
});

document.addEventListener("mousemove", (e) => {
    // Handle drag-to-connect (works always) AND click-mode connect
    if ((isDraggingConnection || isDrawingMode) && activeLine && startContainer) {
        const start = getDotPoint(startContainer, startDir);
        updateLinePath(activeLine, start.x, start.y,
            e.clientX + window.scrollX, e.clientY + window.scrollY, startDir, null);

        // Highlight target node and nearest dot
        document.querySelectorAll('.connect-target-hover').forEach(el => el.classList.remove('connect-target-hover'));
        document.querySelectorAll('.dot-target-hover').forEach(el => el.classList.remove('dot-target-hover'));

        const targetDot = e.target.closest('.node-connect-dot');
        const targetNode = e.target.closest('.draggable-container');

        if (targetDot && targetDot.closest('.draggable-container') !== startContainer) {
            // Hovering directly over a dot — highlight that dot specifically
            targetDot.classList.add('dot-target-hover');
        } else if (targetNode && targetNode !== startContainer) {
            // Hovering over another node body — highlight the node
            targetNode.classList.add('connect-target-hover');
        }
        return;
    }

    if (!currentDraggable) return;

    const workspaceRect = workspace.getBoundingClientRect();
    let x = e.clientX - workspaceRect.left - offsetX + workspace.scrollLeft;
    let y = e.clientY - workspaceRect.top  - offsetY + workspace.scrollTop;

    // Keep nodes below the fixed toolbar so they don't get stuck behind it
    const toolbar = document.querySelector('.toolbar');
    const toolbarBottom = toolbar
        ? toolbar.getBoundingClientRect().bottom - workspaceRect.top + 10
        : 0;

    const maxX = workspaceRect.width  - currentDraggable.offsetWidth;
    const maxY = workspaceRect.height - currentDraggable.offsetHeight;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(toolbarBottom, Math.min(y, maxY));

    currentDraggable.style.left = `${x}px`;
    currentDraggable.style.top  = `${y}px`;
    updateAllConnections();
});

document.addEventListener("mouseup", (e) => {
    // Finalize connection — works for both drag-to-connect and click-mode
    if ((isDraggingConnection || isDrawingMode) && startContainer) {
        // Check if released on a specific dot first (snap to that direction)
        const targetDot  = e.target.closest('.node-connect-dot');
        const targetNode = targetDot
            ? targetDot.closest('.draggable-container')
            : e.target.closest('.draggable-container');

        if (targetNode && targetNode !== startContainer) {
            finalizeConnection(startContainer, targetNode);
        }

        if (activeLine) { activeLine.remove(); activeLine = null; }
        startContainer.classList.remove('connect-source');
        document.querySelectorAll('.connect-target-hover, .dot-target-hover').forEach(el =>
            el.classList.remove('connect-target-hover', 'dot-target-hover'));
        startContainer = null;
        startDir = null;
        isDraggingConnection = false;

        // Only fully reset toolbar state if in click-mode; drag-mode doesn't change toolbar
        if (isDrawingMode) resetDrawingState();
        else document.body.classList.remove('drawing-mode');
        return;
    }

    if (currentDraggable) {
        currentDraggable.classList.remove('is-dragging');
        currentDraggable = null;
    }
});

// ---- Add New Node ----------------------------------------
addBtn.addEventListener("click", () => {
    const container = document.createElement("div");
    container.className = "draggable-container";

    const top  = Math.floor(Math.random() * 35) + 20;
    const left = Math.floor(Math.random() * 40) + 20;
    container.style.top  = `${top}%`;
    container.style.left = `${left}%`;

    const label = `Node ${String.fromCharCode(64 + nodeCounter++)}`;

    container.innerHTML = `
        <div class="node-header">
            <div class="drag-handle">
                <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                    <path d="M0 1h12M0 4h12M0 7h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
            </div>
            <input class="node-title" type="text" value="${label}" placeholder="Label…" spellcheck="false">
            <button class="node-delete" title="Delete node">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
        <div class="editor-wrapper">
            <textarea placeholder="Type TeX here…"></textarea>
            <div class="tex-preview"></div>
        </div>
        <div class="node-connect-dot" data-dir="top"></div>
        <div class="node-connect-dot" data-dir="right"></div>
        <div class="node-connect-dot" data-dir="bottom"></div>
        <div class="node-connect-dot" data-dir="left"></div>
    `;

    workspace.appendChild(container);
    container.classList.add('node-enter');
    setTimeout(() => container.classList.remove('node-enter'), 300);

    attachEditorEvents(container);

    // Auto-focus new textarea
    setTimeout(() => {
        container.classList.add('editing');
        container.querySelector('textarea').focus();
    }, 50);
});

// ---- Keyboard shortcuts ----------------------------------
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'n' || e.key === 'N') addBtn.click();
    if (e.key === 'c' || e.key === 'C') toggleLineBtn.click();
    if (e.key === 'Escape') resetDrawingState();
});

// ---- Resize / scroll update ------------------------------
window.addEventListener('resize', updateAllConnections);
workspace.addEventListener('scroll', updateAllConnections);