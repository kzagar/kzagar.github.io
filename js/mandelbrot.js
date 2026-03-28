const canvas = document.getElementById('mandelbrotCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const octx = overlayCanvas.getContext('2d');
const infoOverlay = document.getElementById('infoOverlay');
const whatIsThisLink = document.getElementById('whatIsThisLink');
const closeBtn = document.querySelector('.close-btn');

const avatarImg = new Image();
avatarImg.src = 'images/kzagar.png';
avatarImg.onload = () => requestRender();

let state = {
    maxIteration: 500,
    transform: {
        x: -0.75,
        y: 0,
        zoom: 1.2
    },
    avatar: {
        re: -1.3812,
        im: 0,
        size: 0.03 // in Mandelbrot units
    },
    panning: false,
    lastPanPos: { x: 0, y: 0 }
};

// --- WebGL Renderer ---

let gl, program, positionBuffer;
let uCenter, uZoom, uResolution, uMaxIteration;

const vsSource = `#version 300 es
    in vec4 a_position;
    void main() {
        gl_Position = a_position;
    }
`;

const fsSource = `#version 300 es
    precision highp float;
    
    uniform vec2 u_center;
    uniform float u_zoom;
    uniform vec2 u_resolution;
    uniform int u_maxIteration;
    
    out vec4 outColor;

    // Custom vibrant palette: Blue -> Green -> Orange -> Red
    vec3 colormap(float x) {
        vec3 c1 = vec3(0.0, 0.1, 0.5); // Deep Blue
        vec3 c2 = vec2(0.1, 0.8).xxy;  // Cyan/Blue
        vec3 c3 = vec3(0.0, 0.8, 0.2); // Green
        vec3 c4 = vec3(1.0, 0.6, 0.0); // Orange
        vec3 c5 = vec3(0.8, 0.0, 0.0); // Deep Red
        
        if (x < 0.25) return mix(c1, c2, x * 4.0);
        if (x < 0.5) return mix(c2, c3, (x - 0.25) * 4.0);
        if (x < 0.75) return mix(c3, c4, (x - 0.5) * 4.0);
        return mix(c4, c5, (x - 0.75) * 4.0);
    }

    void main() {
        float aspect = u_resolution.x / u_resolution.y;
        float spanY = 2.5 / u_zoom;
        float spanX = spanY * aspect;
        
        // Coordinate mapping (standard horizontal orientation)
        vec2 pNorm = (gl_FragCoord.xy / u_resolution) - 0.5;
        // Flip Y because WebGL 0 is bottom
        pNorm.y = -pNorm.y;
        
        vec2 c = u_center + pNorm * vec2(spanX, spanY);
        
        // Optimization: Cardioid and Period-2 Bulb Check
        float x = c.x, y = c.y;
        float y2 = y * y;
        float q = (x - 0.25) * (x - 0.25) + y2;
        if (q * (q + (x - 0.25)) < 0.25 * y2) { // Main cardioid
            outColor = vec4(0.0, 0.0, 0.0, 0.0);
            return;
        }
        if ((x + 1.0) * (x + 1.0) + y2 < 0.0625) { // Period-2 bulb
            outColor = vec4(0.0, 0.0, 0.0, 0.0);
            return;
        }

        // Mandelbrot Iteration
        vec2 z = vec2(0.0);
        vec2 z_old = vec2(0.0);
        int iteration = 0;
        float escapeRadiusSq = 16.0;
        bool inside = true;

        for (int i = 0; i < 2000; i++) { // Hard-coded limit for static loop
            if (i >= u_maxIteration) break;
            
            float zx2 = z.x * z.x;
            float zy2 = z.y * z.y;
            
            if (zx2 + zy2 > escapeRadiusSq) {
                inside = false;
                iteration = i;
                break;
            }
            
            z = vec2(zx2 - zy2, 2.0 * z.x * z.y) + c;
            
            // Periodicity Checking (Brent's Algorithm)
            if (length(z - z_old) < 1e-7) {
                inside = true;
                break;
            }
            if ((i & (i - 1)) == 0) z_old = z;
        }

        if (inside) {
            outColor = vec4(0.0, 0.0, 0.0, 0.0);
        } else {
            // Smooth Coloring
            float zMagSq = z.x * z.x + z.y * z.y;
            float mu = float(iteration) + 1.0 - log(log(zMagSq) / 2.0) / log(2.0);
            
            // Palette Mapping
            vec3 color = colormap(fract(mu / 60.0));
            outColor = vec4(color, 1.0);
        }
    }
`;

/**
 * Initializes the WebGL 2 contextual state, compiles shaders, 
 * and binds uniform variables.
 * @returns {boolean} True if WebGL initialized successfully, false otherwise.
 */
function initWebGL() {
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;

    function createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return false;
    }

    uCenter = gl.getUniformLocation(program, 'u_center');
    uZoom = gl.getUniformLocation(program, 'u_zoom');
    uResolution = gl.getUniformLocation(program, 'u_resolution');
    uMaxIteration = gl.getUniformLocation(program, 'u_maxIteration');

    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    return true;
}

let isRendering = false;
/**
 * Schedules a render cycle in alignment with the display refresh rate.
 */
function requestRender() {
    if (!isRendering) {
        isRendering = true;
        requestAnimationFrame(() => {
            render();
            isRendering = false;
        });
    }
}

/**
 * Executes the WebGL draw arrays call using updated pan/zoom uniforms.
 */
function render() {
    if (!gl) return; // Add fallback render() call here if needed

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(program);

    gl.uniform2f(uCenter, state.transform.x, state.transform.y);
    gl.uniform1f(uZoom, state.transform.zoom);
    gl.uniform2f(uResolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(uMaxIteration, state.maxIteration);

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    drawOverlay();
}

/**
 * Converts Mandelbrot coordinates to screen pixel coordinates.
 */
function mandelToScreen(re, im) {
    const aspect = window.innerWidth / window.innerHeight;
    const spanY = 2.5 / state.transform.zoom;
    const spanX = spanY * aspect;

    const normX = (re - state.transform.x) / spanX;
    const normY = (im - state.transform.y) / spanY;

    return {
        x: (normX + 0.5) * window.innerWidth,
        y: (normY + 0.5) * window.innerHeight
    };
}

/**
 * Renders the avatar overlay on the 2D canvas.
 */
function drawOverlay() {
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!avatarImg.complete) return;

    // Fade curve based on zoom: starts appearing at 100x zoom, fully visible at 1000x
    let opacity = 1;

    if (opacity <= 0) return;

    const pos = mandelToScreen(state.avatar.re, state.avatar.im);
    const pixelSize = (state.avatar.size / (2.5 / state.transform.zoom)) * window.innerHeight;

    octx.globalAlpha = opacity;
    octx.drawImage(
        avatarImg,
        pos.x - pixelSize / 2,
        pos.y - pixelSize / 2,
        pixelSize,
        pixelSize
    );
}

/**
 * Handles browser window resize events and adjusts canvas dimensions.
 */
function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
    requestRender();
}

// --- Interactions ---

/**
 * Updates the global transform state (pan offset and zoom level) based on user interaction.
 * @param {number} dx - Pixel delta X for panning.
 * @param {number} dy - Pixel delta Y for panning.
 * @param {number} factor - Zoom multiplier (1 for identity/no zoom).
 * @param {number} [mouseX] - Viewport X coordinate of the cursor during a zoom event.
 * @param {number} [mouseY] - Viewport Y coordinate of the cursor during a zoom event.
 */
function updateTransform(dx, dy, factor, mouseX, mouseY) {
    const aspect = window.innerWidth / window.innerHeight;
    const spanY = 2.5 / state.transform.zoom;
    const spanX = spanY * aspect;

    if (factor !== 1) { // Zooming
        const mouseXNorm = mouseX / window.innerWidth - 0.5;
        const mouseYNorm = mouseY / window.innerHeight - 0.5;

        const beforeX = mouseXNorm * spanX + state.transform.x;
        const beforeY = mouseYNorm * spanY + state.transform.y;

        state.transform.zoom *= factor;

        const spanYAfter = 2.5 / state.transform.zoom;
        const spanXAfter = spanYAfter * aspect;

        const afterX = mouseXNorm * spanXAfter + state.transform.x;
        const afterY = mouseYNorm * spanYAfter + state.transform.y;

        state.transform.x += (beforeX - afterX);
        state.transform.y += (beforeY - afterY);
    } else { // Panning
        state.transform.x -= (dx / window.innerWidth) * spanX;
        state.transform.y -= (dy / window.innerHeight) * spanY;
    }
    requestRender();
}

window.addEventListener('mousedown', (e) => {
    state.panning = true;
    state.lastPanPos = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mousemove', (e) => {
    if (state.panning) {
        const dx = e.clientX - state.lastPanPos.x;
        const dy = e.clientY - state.lastPanPos.y;
        updateTransform(dx, dy, 1);
        state.lastPanPos = { x: e.clientX, y: e.clientY };
    }
});

window.addEventListener('mouseup', () => state.panning = false);

window.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.pow(1.1, -e.deltaY / 100);
    updateTransform(0, 0, factor, e.clientX, e.clientY);
}, { passive: false });

let isAnimating = false;
window.addEventListener('dblclick', () => {
    if (isAnimating) return;
    isAnimating = true;

    const targetZoom = 20; // Deep enough to see the avatar clearly
    const targetX = state.avatar.re;
    const targetY = state.avatar.im;

    const startZoom = state.transform.zoom;
    const startX = state.transform.x;
    const startY = state.transform.y;

    const duration = 1000; // ms
    const startTime = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4); // ease-out quartic

        state.transform.zoom = startZoom + (targetZoom - startZoom) * progress;
        state.transform.x = startX + (targetX - startX) * ease;
        state.transform.y = startY + (targetY - startY) * ease;

        requestRender();

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            isAnimating = false;
        }
    }

    requestAnimationFrame(animate);
});

// --- UI Logic ---

whatIsThisLink.addEventListener('click', (e) => {
    e.preventDefault();
    infoOverlay.classList.remove('hidden');
});

closeBtn.addEventListener('click', () => {
    infoOverlay.classList.add('hidden');
});

infoOverlay.addEventListener('click', (e) => {
    if (e.target === infoOverlay) {
        infoOverlay.classList.add('hidden');
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !infoOverlay.classList.contains('hidden')) {
        infoOverlay.classList.add('hidden');
    }
});

// --- Startup ---

if (initWebGL()) {
    window.addEventListener('resize', resize);
    resize();
} else {
    // Basic fallback render if WebGL not supported
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.fillText("WebGL not supported, please use a modern browser.", 50, 50);
}
