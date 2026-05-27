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

    // Connect dot (right side)
    const connectDot = container.querySelector('.node-connect-dot');
    connectDot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        startConnection(container, e);
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
    connectLabel.textContent = 'Connect';
    toggleLineBtn.classList.remove('active');
    document.body.classList.remove('drawing-mode');
    statusHint.textContent = 'Drag handles to move · Connect nodes with Connect mode';
    statusHint.classList.remove('alert');
    if (activeLine) { activeLine.remove(); activeLine = null; }
    if (startContainer) {
        startContainer.classList.remove('connect-source');
        startContainer = null;
    }
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
function startConnection(container, e) {
    if (!isDrawingMode) return;
    startContainer = container;
    container.classList.add('connect-source');

    const start = getConnectPoint(startContainer);
    activeLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    activeLine.setAttribute("class", "preview-path");
    svgCanvas.appendChild(activeLine);
    updateLinePath(activeLine, start.x, start.y, e.clientX + window.scrollX, e.clientY + window.scrollY);
}

// ---- Coordinate helpers ----------------------------------
function getConnectPoint(container) {
    const dot = container.querySelector('.node-connect-dot');
    const rect = dot ? dot.getBoundingClientRect() : container.getBoundingClientRect();
    if (dot) {
        return {
            x: rect.left + rect.width / 2 + window.scrollX,
            y: rect.top  + rect.height / 2 + window.scrollY
        };
    }
    return {
        x: rect.right + window.scrollX,
        y: rect.top + rect.height / 2 + window.scrollY
    };
}

function getNodeCenter(container) {
    const rect = container.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top  + rect.height / 2 + window.scrollY
    };
}

// ---- Curved path between two points ----------------------
function updateLinePath(lineEl, x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1) * 0.55;
    const cx1 = x1 + dx;
    const cx2 = x2 - dx;
    lineEl.setAttribute("d", `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`);
}

// ---- Update all rendered connections ----------------------
function updateAllConnections() {
    connections.forEach(conn => {
        const s = getConnectPoint(conn.from);
        const e = getConnectPoint(conn.to);
        updateLinePath(conn.path, s.x, s.y, e.x, e.y);

        // Move delete button to midpoint
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

    const conn = { from: fromContainer, to: toContainer, path, deleteBtn: g };
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
    // Update preview connection line
    if (isDrawingMode && activeLine && startContainer) {
        const start = getConnectPoint(startContainer);
        updateLinePath(activeLine, start.x, start.y,
            e.clientX + window.scrollX, e.clientY + window.scrollY);

        // Highlight potential target on hover
        document.querySelectorAll('.draggable-container').forEach(el => {
            el.classList.remove('connect-target-hover');
        });
        const target = e.target.closest('.draggable-container');
        if (target && target !== startContainer) {
            target.classList.add('connect-target-hover');
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
    // Finalize connection drawing
    if (isDrawingMode && startContainer) {
        const target = e.target.closest('.draggable-container');
        if (target && target !== startContainer) {
            finalizeConnection(startContainer, target);
        }
        if (activeLine) { activeLine.remove(); activeLine = null; }
        startContainer.classList.remove('connect-source');
        document.querySelectorAll('.connect-target-hover').forEach(el =>
            el.classList.remove('connect-target-hover'));
        startContainer = null;
        resetDrawingState();
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
        <div class="node-connect-dot" title="Connect to another node"></div>
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