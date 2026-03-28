const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const distanceDisplay = document.getElementById('distance-display');
const scaledDistanceInput = document.getElementById('scaled-distance-input');
const angleDisplay = document.getElementById('angle-display');
const statusIndicator = document.getElementById('status-indicator');
const welcomeMsg = document.getElementById('welcome-msg');
const measurementsDiv = document.getElementById('measurements');

// --- Drawing ---
let isDrawing = false;

measurementsDiv.classList.add('hidden');

let state = {
    image: null,
    scale: 1, // units per pixel
    isScaled: false,
    transform: {
        x: 0,
        y: 0,
        zoom: 1
    },
    measuring: true, // Always show distance from some point if image exists
    panning: false,
    startPoint: null, // {x, y} in image coordinates
    currentPoint: null, // {x, y} in image coordinates
    lastDistancePx: 0,
    lastPanPos: { x: 0, y: 0 }
};

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    requestDraw();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- Clipboard & Image Loading ---
function handleImageBlob(blob) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
        if (state.image && state.image.src) {
            URL.revokeObjectURL(state.image.src); // Free up previous blob URL memory
        }
        state.image = img;
        // Center image initially
        state.transform.zoom = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
        state.transform.x = (canvas.width - img.width * state.transform.zoom) / 2;
        state.transform.y = (canvas.height - img.height * state.transform.zoom) / 2;

        statusIndicator.innerText = `Image: ${img.width}x${img.height}px`;
        welcomeMsg.classList.add('hidden');
        requestDraw();
    };
    img.src = url;
}

window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            handleImageBlob(item.getAsFile());
            break;
        }
    }
});

const uploadBtn = document.getElementById('upload-btn');
const imageInput = document.getElementById('image-input');

if (uploadBtn && imageInput) {
    uploadBtn.addEventListener('click', () => {
        imageInput.click();
    });

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageBlob(file);
        }
    });
}

// --- Coordinate Conversion ---
/**
 * Converts screen viewport coordinates to intrinsic image coordinates based on pan/zoom state.
 * @param {number} screenX - X coordinate on the screen.
 * @param {number} screenY - Y coordinate on the screen.
 * @returns {{x: number, y: number}} The corresponding natural coordinate on the image.
 */
function screenToImage(screenX, screenY) {
    return {
        x: (screenX - state.transform.x) / state.transform.zoom,
        y: (screenY - state.transform.y) / state.transform.zoom
    };
}

/**
 * Converts intrinsic image coordinates back to screen viewport coordinates.
 * @param {number} imageX - X natural coordinate on the image.
 * @param {number} imageY - Y natural coordinate on the image.
 * @returns {{x: number, y: number}} The corresponding coordinate on the screen.
 */
function imageToScreen(imageX, imageY) {
    return {
        x: imageX * state.transform.zoom + state.transform.x,
        y: imageY * state.transform.zoom + state.transform.y
    };
}

/**
 * Queues a rendering pass synced with the browser's display refresh rate to avoid jank.
 */
function requestDraw() {
    if (!isDrawing) {
        isDrawing = true;

        requestAnimationFrame(() => {
            draw();
            isDrawing = false;
        });
    }
}

/**
 * Updates the global transform state (pan offset and zoom level) based on user interaction.
 * @param {number} dx - Pixel delta X for panning.
 * @param {number} dy - Pixel delta Y for panning.
 * @param {number} factor - Zoom multiplier (1 for identity/no zoom).
 * @param {number} [focalX] - Viewport X coordinate of the cursor/pinch center during a zoom event.
 * @param {number} [focalY] - Viewport Y coordinate of the cursor/pinch center during a zoom event.
 */
function updateTransform(dx, dy, factor, focalX, focalY) {
    if (!state.image) return;

    if (factor !== 1) {
        // Zoom around focal point
        const focalImgPos = screenToImage(focalX, focalY);
        state.transform.zoom *= factor;
        const newFocalScreenPos = imageToScreen(focalImgPos.x, focalImgPos.y);

        state.transform.x += (focalX - newFocalScreenPos.x);
        state.transform.y += (focalY - newFocalScreenPos.y);
    }

    state.transform.x += dx;
    state.transform.y += dy;

    requestDraw();
}

/**
 * Primary rendering function. Clears the canvas, applies state transformations,
 * draws the active image, and overlays the user's measurement indicator lines.
 */
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.image) {
        ctx.save();
        ctx.translate(state.transform.x, state.transform.y);
        ctx.scale(state.transform.zoom, state.transform.zoom);
        ctx.drawImage(state.image, 0, 0);
        ctx.restore();

        // Draw measurement line
        if (state.startPoint && state.currentPoint) {
            const p1 = imageToScreen(state.startPoint.x, state.startPoint.y);
            const p2 = imageToScreen(state.currentPoint.x, state.currentPoint.y);

            // Drop shadow for visibility
            ctx.shadowBlur = 4;
            ctx.shadowColor = "rgba(0,0,0,0.8)";

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Vertex marker
            ctx.beginPath();
            ctx.arc(p1.x, p1.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();

            // Current point marker
            ctx.beginPath();
            ctx.arc(p2.x, p2.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();

            ctx.shadowBlur = 0;
        }
    }
}

// --- Interaction ---
canvas.addEventListener('mousedown', (e) => {
    if (!state.image) return;

    if (e.ctrlKey) {
        state.panning = true;
        state.lastPanPos = { x: e.clientX, y: e.clientY };
    } else {
        // Click for new starting point
        state.startPoint = screenToImage(e.clientX, e.clientY);
        state.currentPoint = state.startPoint;
        welcomeMsg.classList.add('hidden');
        measurementsDiv.classList.remove('hidden');
        updateMeasurements();
        requestDraw();
    }
});

window.addEventListener('mousemove', (e) => {
    if (state.panning) {
        const dx = e.clientX - state.lastPanPos.x;
        const dy = e.clientY - state.lastPanPos.y;
        updateTransform(dx, dy, 1);
        state.lastPanPos = { x: e.clientX, y: e.clientY };
    } else {
        // Always update current point if not panning
        state.currentPoint = screenToImage(e.clientX, e.clientY);
        if (state.startPoint) {
            measurementsDiv.classList.remove('hidden');
            updateMeasurements();
        }
        requestDraw();
    }
});

window.addEventListener('mouseup', () => {
    state.panning = false;
});

canvas.addEventListener('wheel', (e) => {
    if (!state.image || !e.ctrlKey) return;
    e.preventDefault();

    const factor = Math.pow(1.1, -e.deltaY / 100);
    updateTransform(0, 0, factor, e.clientX, e.clientY);
}, { passive: false });

let lastTouches = [];

canvas.addEventListener('touchstart', (e) => {
    if (!state.image) return;
    e.preventDefault();
    const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));

    if (touches.length === 1) {
        // Single-finger: Start measurement
        state.startPoint = screenToImage(touches[0].x, touches[0].y);
        state.currentPoint = state.startPoint;
        welcomeMsg.classList.add('hidden');
        measurementsDiv.classList.remove('hidden');
        updateMeasurements();
        requestDraw();
    }
    lastTouches = touches;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (!state.image) return;
    e.preventDefault();
    const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));

    if (touches.length === 1 && lastTouches.length === 1) {
        // Single-finger: update current point for measurement
        state.currentPoint = screenToImage(touches[0].x, touches[0].y);
        if (state.startPoint) {
            measurementsDiv.classList.remove('hidden');
            updateMeasurements();
        }
        requestDraw();
    } else if (touches.length >= 2 && lastTouches.length >= 2) {
        // Two-finger pinch-to-zoom and panning
        const getDist = (t1, t2) => Math.hypot(t1.x - t2.x, t1.y - t2.y);
        const getMid = (t1, t2) => ({ x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 });

        const lastDist = getDist(lastTouches[0], lastTouches[1]);
        const currentDist = getDist(touches[0], touches[1]);

        const lastMid = getMid(lastTouches[0], lastTouches[1]);
        const currentMid = getMid(touches[0], touches[1]);

        const factor = lastDist > 0 ? currentDist / lastDist : 1;
        const dx = currentMid.x - lastMid.x;
        const dy = currentMid.y - lastMid.y;

        updateTransform(dx, dy, factor, currentMid.x, currentMid.y);
    }

    lastTouches = touches;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    lastTouches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    lastTouches = [];
}, { passive: false });

// --- Measurement Logic ---
function updateMeasurements() {
    if (!state.startPoint || !state.currentPoint) return;

    const dx = state.currentPoint.x - state.startPoint.x;
    const dy = state.currentPoint.y - state.startPoint.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    state.lastDistancePx = distPx;

    // Angle from positive X axis
    // Math.atan2 returns angle in radians from (-PI, PI]
    // We want 0-360 starting from right
    let angleRad = Math.atan2(dy, dx);
    let angleDeg = angleRad * (180 / Math.PI);
    if (angleDeg < 0) angleDeg += 360;

    distanceDisplay.innerText = `${distPx.toFixed(2)} px`;
    angleDisplay.innerText = `${angleDeg.toFixed(1)}°`;

    if (state.isScaled) {
        const scaledDist = distPx * state.scale;
        if (document.activeElement !== scaledDistanceInput) {
            scaledDistanceInput.value = scaledDist.toFixed(4);
        }
    }
}

scaledDistanceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const val = parseFloat(scaledDistanceInput.value);
        if (!isNaN(val) && state.lastDistancePx > 0) {
            state.scale = val / state.lastDistancePx;
            state.isScaled = true;
            updateMeasurements();
            scaledDistanceInput.blur();
        }
    }
});

// --- Global Shortcuts ---
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        state.startPoint = null;
        state.currentPoint = null;
        measurementsDiv.classList.add('hidden');
        welcomeMsg.classList.remove('hidden');
        requestDraw();
        return;
    }

    // Ignore if already focused or if a modifier key is held
    if (document.activeElement === scaledDistanceInput || e.ctrlKey || e.altKey || e.metaKey) {
        return;
    }

    // Detect number keys, minus, or decimal point
    if (/^[0-9\.\-]$/.test(e.key)) {
        scaledDistanceInput.focus();
        // Optionally clear previous value if starting fresh
        scaledDistanceInput.value = '';
    }
});
