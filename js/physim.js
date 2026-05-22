'use strict';

/* =========================================================
   physim.js  --  2-D particle-based statistical-mechanics
   ========================================================= */

const BODY_COLORS = [
    '#8be9fd', '#50fa7b', '#ff79c6', '#f1fa8c',
    '#bd93f9', '#ffb86c', '#ff5555', '#6272a4'
];

/* ---------------------------------------------------------
   Particle
   --------------------------------------------------------- */
class Particle {
    constructor(x, y, mass, fixed = false) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.fx = 0;
        this.fy = 0;
        this.mass = mass;
        this.fixed = fixed;
        this.radius = 5;
    }
}

/* ---------------------------------------------------------
   Spring
   --------------------------------------------------------- */
class Spring {
    constructor(p1, p2, stiffness, damping) {
        this.p1 = p1;
        this.p2 = p2;
        this.restLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        this.stiffness = stiffness;
        this.damping = damping;
    }

    applyForce() {
        const dx = this.p2.x - this.p1.x;
        const dy = this.p2.y - this.p1.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-9) return;

        let force = this.stiffness * (dist - this.restLength);

        if (this.damping > 0) {
            const dvx = this.p2.vx - this.p1.vx;
            const dvy = this.p2.vy - this.p1.vy;
            force += (dvx * dx / dist + dvy * dy / dist) * this.damping;
        }

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        this.p1.fx += fx;  this.p1.fy += fy;
        this.p2.fx -= fx;  this.p2.fy -= fy;
    }
}

/* ---------------------------------------------------------
   Body  --  connected set of particles
   --------------------------------------------------------- */
class Body {
    constructor(name, color) {
        this.name  = name  || 'Body';
        this.color = color || BODY_COLORS[0];
        this.particles = [];
        this.springs   = [];
        this.contactPE = 0;
    }

    /* Macroscopic energies.
       pe        = M * g * (canvasH - y_cm)
       keCM      = 0.5 * M * |v_cm|^2
       rotE      = 0.5 * I * omega^2   (proper rigid-body formula)
       intE      = relative KE - rotE
       springPE  = sum  0.5 k (x - L0)^2 over internal springs   */
    calcEnergies(gravity, canvasH) {
        const n = this.particles.length;
        if (n === 0) return Body._zero();

        let M = 0, cx = 0, cy = 0, vcx = 0, vcy = 0;
        for (const p of this.particles) {
            M   += p.mass;
            cx  += p.x  * p.mass;
            cy  += p.y  * p.mass;
            vcx += p.vx * p.mass;
            vcy += p.vy * p.mass;
        }
        cx /= M; cy /= M; vcx /= M; vcy /= M;

        const pe   = M * gravity * (canvasH - cy);
        const keCM = 0.5 * M * (vcx * vcx + vcy * vcy);

        let relKE = 0, L = 0, I = 0;
        for (const p of this.particles) {
            const vrx = p.vx - vcx, vry = p.vy - vcy;
            const rx  = p.x  - cx,  ry  = p.y  - cy;
            relKE += 0.5 * p.mass * (vrx * vrx + vry * vry);
            L += p.mass * (rx * vry - ry * vrx);
            I += p.mass * (rx * rx  + ry * ry);
        }

        const omega = I > 1e-12 ? L / I : 0;
        const rotE  = 0.5 * I * omega * omega;
        const intE  = relKE - rotE;

        let springPE = 0;
        for (const s of this.springs) {
            const d = Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y);
            const stretch = d - s.restLength;
            springPE += 0.5 * s.stiffness * stretch * stretch;
        }

        const sum = pe + keCM + rotE + intE + springPE + this.contactPE;
        return { mass: M, cmx: cx, cmy: cy,
                 pe, keCM, rotE, intE, springPE,
                 contactPE: this.contactPE, sum };
    }

    static _zero() {
        return { mass: 0, cmx: 0, cmy: 0,
                 pe: 0, keCM: 0, rotE: 0, intE: 0,
                 springPE: 0, contactPE: 0, sum: 0 };
    }
}

/* ---------------------------------------------------------
   createBall
   layers=0 : single point
   layers=1 : centre + hexagon (7 particles)
   layers=k : centre + concentric hex rings  (1+3k(k+1))
   --------------------------------------------------------- */
function createBall(cx, cy, radius, mass, numLayers, springK, springD) {
    const body = new Body();

    if (numLayers === 0) {
        const p = new Particle(cx, cy, mass);
        p.radius = Math.max(radius, 4);
        body.particles.push(p);
        return body;
    }

    const spacing = radius / numLayers;
    const layers  = [];

    /* layer 0 -- centre */
    const centre = new Particle(cx, cy, 0);
    body.particles.push(centre);
    layers[0] = [centre];

    /* layers 1..numLayers */
    for (let k = 1; k <= numLayers; k++) {
        const R = k * spacing;
        const count = 6 * k;
        const ring  = [];

        for (let i = 0; i < count; i++) {
            const side = Math.floor(i / k);
            const t    = (i % k) / k;
            const a1   = side       * Math.PI / 3;
            const a2   = (side + 1) * Math.PI / 3;
            const px   = cx + R * ((1 - t) * Math.cos(a1) + t * Math.cos(a2));
            const py   = cy + R * ((1 - t) * Math.sin(a1) + t * Math.sin(a2));
            const p    = new Particle(px, py, 0);
            body.particles.push(p);
            ring.push(p);
        }
        layers[k] = ring;

        /* surface neighbours (ring) */
        for (let i = 0; i < count; i++) {
            body.springs.push(
                new Spring(ring[i], ring[(i + 1) % count], springK, springD));
        }

        /* radial connections to inner layer (nearest + threshold) */
        const inner     = layers[k - 1];
        const threshold = spacing * 1.2;
        const seen      = new Set();

        for (const op of ring) {
            let bestD = Infinity, bestP = null;
            for (const ip of inner) {
                const d = Math.hypot(op.x - ip.x, op.y - ip.y);
                if (d < bestD) { bestD = d; bestP = ip; }
            }
            if (bestP) _addUnique(body, op, bestP, springK, springD, seen);

            for (const ip of inner) {
                if (ip === bestP) continue;
                if (Math.hypot(op.x - ip.x, op.y - ip.y) < threshold)
                    _addUnique(body, op, ip, springK, springD, seen);
            }
        }
    }

    /* distribute mass, set radius */
    const mPer = mass / body.particles.length;
    const rVis = Math.min(spacing * 0.38, 7);
    for (const p of body.particles) { p.mass = mPer; p.radius = rVis; }

    return body;
}

function _addUnique(body, a, b, k, d, seen) {
    const key = a === body.particles[body.particles.indexOf(a)]
        ? body.particles.indexOf(a) + ':' + body.particles.indexOf(b)
        : body.particles.indexOf(b) + ':' + body.particles.indexOf(a);
    const ka = Math.min(body.particles.indexOf(a), body.particles.indexOf(b))
             + ':' + Math.max(body.particles.indexOf(a), body.particles.indexOf(b));
    if (seen.has(ka)) return;
    seen.add(ka);
    body.springs.push(new Spring(a, b, k, d));
}

/* ---------------------------------------------------------
   createBox
   lower-left (x1,y1), lower-right (x2,y2), height h upward.
   numCols = particles along the base.
   --------------------------------------------------------- */
function createBox(x1, y1, x2, y2, height, mass, numCols, springK, springD,
                   fixedBottom) {
    const body = new Body();
    const dx   = x2 - x1, dy = y2 - y1;
    const wid  = Math.hypot(dx, dy);
    if (wid < 1e-6 || numCols < 2) return body;

    const bx = dx / wid, by = dy / wid;   // base direction
    const ux = by,        uy = -bx;        // up direction (screen-up)

    const sp      = wid / (numCols - 1);
    const numRows = Math.max(Math.round(height / sp) + 1, 2);
    const mPer    = mass / (numCols * numRows);
    const rVis    = Math.min(sp * 0.35, 7);

    const grid = [];
    for (let r = 0; r < numRows; r++) {
        grid[r] = [];
        for (let c = 0; c < numCols; c++) {
            const px = x1 + c * sp * bx + r * sp * ux;
            const py = y1 + c * sp * by + r * sp * uy;
            const p  = new Particle(px, py, mPer, fixedBottom && r === 0);
            p.radius = rVis;
            body.particles.push(p);
            grid[r][c] = p;
        }
    }

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            if (c < numCols - 1)
                body.springs.push(new Spring(grid[r][c], grid[r][c + 1], springK, springD));
            if (r < numRows - 1)
                body.springs.push(new Spring(grid[r][c], grid[r + 1][c], springK, springD));
            if (r < numRows - 1 && c < numCols - 1) {
                body.springs.push(new Spring(grid[r][c], grid[r + 1][c + 1], springK, springD));
                body.springs.push(new Spring(grid[r + 1][c], grid[r][c + 1], springK, springD));
            }
        }
    }
    return body;
}

/* ---------------------------------------------------------
   Simulation
   --------------------------------------------------------- */
class Simulation {
    constructor(canvasW, canvasH) {
        this.bodies      = [];
        this.gravity     = 196;       // 9.8 * 20
        this.collisionK  = 15000;
        this.subSteps    = 20;
        this.canvasW     = canvasW;
        this.canvasH     = canvasH;
        this.paused      = false;
    }

    addBody(body) {
        if (!body.color || body.color === BODY_COLORS[0]) {
            body.color = BODY_COLORS[this.bodies.length % BODY_COLORS.length];
        }
        this.bodies.push(body);
    }

    removeBody(body) {
        const idx = this.bodies.indexOf(body);
        if (idx >= 0) this.bodies.splice(idx, 1);
    }

    step(dt) {
        if (this.paused) return;
        const subDt = dt / this.subSteps;

        for (let s = 0; s < this.subSteps; s++) {
            /* clear forces, apply gravity */
            for (const b of this.bodies)
                for (const p of b.particles) {
                    p.fx = 0;
                    p.fy = p.mass * this.gravity;
                }

            /* spring forces */
            for (const b of this.bodies)
                for (const sp of b.springs) sp.applyForce();

            /* inter-body collisions */
            this._resolveCollisions();

            /* integrate (symplectic Euler) */
            for (const b of this.bodies)
                for (const p of b.particles) {
                    if (p.fixed) continue;
                    p.vx += (p.fx / p.mass) * subDt;
                    p.vy += (p.fy / p.mass) * subDt;
                    p.x  += p.vx * subDt;
                    p.y  += p.vy * subDt;

                    /* walls */
                    if (p.x < p.radius) { p.x = p.radius; p.vx *= -1; }
                    if (p.x > this.canvasW - p.radius) {
                        p.x = this.canvasW - p.radius; p.vx *= -1;
                    }
                }
        }
    }

    _resolveCollisions() {
        /* reset contact PE */
        for (const b of this.bodies) b.contactPE = 0;

        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const ba = this.bodies[i], bb = this.bodies[j];
                for (const pa of ba.particles) {
                    for (const pb of bb.particles) {
                        const dx   = pa.x - pb.x;
                        const dy   = pa.y - pb.y;
                        const dist = Math.hypot(dx, dy);
                        const minD = pa.radius + pb.radius;
                        if (dist >= minD || dist < 1e-6) continue;

                        const overlap = minD - dist;
                        const force   = this.collisionK * overlap;
                        const fx      = (dx / dist) * force;
                        const fy      = (dy / dist) * force;

                        pa.fx += fx; pa.fy += fy;
                        if (!pb.fixed) { pb.fx -= fx; pb.fy -= fy; }

                        const pe = 0.5 * this.collisionK * overlap * overlap;
                        ba.contactPE += pe * 0.5;
                        bb.contactPE += pe * 0.5;
                    }
                }
            }
        }
    }

    allEnergies() {
        const rows = this.bodies.map(b => b.calcEnergies(this.gravity, this.canvasH));
        const tot  = Body._zero();
        for (const r of rows) {
            tot.pe        += r.pe;
            tot.keCM      += r.keCM;
            tot.rotE      += r.rotE;
            tot.intE      += r.intE;
            tot.springPE  += r.springPE;
            tot.contactPE += r.contactPE;
            tot.sum       += r.sum;
        }
        return { rows, tot };
    }
}

/* ---------------------------------------------------------
   Renderer
   --------------------------------------------------------- */
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
    }

    draw(sim) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (const body of sim.bodies) {
            /* springs */
            ctx.strokeStyle = body.color;
            ctx.lineWidth   = 1.5;
            ctx.beginPath();
            for (const s of body.springs) {
                ctx.moveTo(s.p1.x, s.p1.y);
                ctx.lineTo(s.p2.x, s.p2.y);
            }
            ctx.stroke();

            /* particles */
            for (const p of body.particles) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.fixed ? '#6272a4' : '#f1fa8c';
                ctx.fill();
                ctx.lineWidth   = 1.2;
                ctx.strokeStyle = '#121216';
                ctx.stroke();
            }
        }

        /* drag indicator */
        if (this._dragTarget) {
            ctx.beginPath();
            ctx.arc(this._dragTarget.x, this._dragTarget.y,
                    this._dragTarget.radius + 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff79c6';
            ctx.lineWidth   = 2;
            ctx.stroke();
        }
    }

    set dragTarget(p) { this._dragTarget = p; }
}

/* ---------------------------------------------------------
   PhysimApp  --  UI controller
   --------------------------------------------------------- */
class PhysimApp {
    constructor() {
        this.canvas   = document.getElementById('simCanvas');
        this.renderer = new Renderer(this.canvas);
        this.sim      = null;
        this.mode     = 'interact';   // interact | place_ball | place_box_1 | place_box_2
        this.boxFirstCorner = null;
        this._bodyCounter   = 0;
        this._lastTime      = 0;
        this._dragging      = null;
        this._animId        = null;
    }

    /* ---------- bootstrap ---------- */
    init() {
        this._resizeCanvas();
        window.addEventListener('resize', () => this._resizeCanvas());

        this.sim = new Simulation(this.canvas.width, this.canvas.height);
        this._buildDefaultScene();
        this._bindControls();
        this._bindMouse();
        this._updateBodyList();
        this._loop(performance.now());
    }

    /* ---------- default scene ---------- */
    _buildDefaultScene() {
        const W = this.canvas.width, H = this.canvas.height;

        /* floor box */
        const floorK = _val('kFloor'), floorD = _val('dFloor');
        const floorCols = 25, floorSpacing = 30;
        const floorW = (floorCols - 1) * floorSpacing;
        const x1 = (W - floorW) / 2, y1 = H - 40;
        const floor = createBox(x1, y1, x1 + floorW, y1, 30, 250,
                                floorCols, floorK, floorD, true);
        floor.name  = 'Floor';
        floor.color = '#50fa7b';
        this.sim.addBody(floor);

        /* ball */
        this._spawnBall();
    }

    _spawnBall() {
        const W = this.canvas.width, H = this.canvas.height;
        const h     = _val('ballHeight');
        const r     = _val('ballRadius');
        const m     = _val('ballMass');
        const lay   = Math.round(_val('ballLayers'));
        const k     = _val('kBall');
        const d     = _val('dBall');
        const rot   = _val('ballRot');
        const vy0   = _val('ballVy');
        const intE  = _val('ballIntE');

        const cx = W * 0.3;
        const cy = H - h;

        const ball  = createBall(cx, cy, r, m, lay, k, d);
        ball.name   = 'Ball ' + (++this._bodyCounter);
        ball.color  = BODY_COLORS[(this.sim.bodies.length + 1) % BODY_COLORS.length];

        /* initial velocities */
        const cmx = cx, cmy = cy;   // approximate CM = centre
        for (const p of ball.particles) {
            p.vy += vy0;
            /* rigid-body rotation */
            const rx = p.x - cmx, ry = p.y - cmy;
            p.vx += -rot * ry;
            p.vy +=  rot * rx;
            /* internal energy as random perturbation */
            p.vx += (Math.random() - 0.5) * intE;
            p.vy += (Math.random() - 0.5) * intE;
        }

        this.sim.addBody(ball);
    }

    /* ---------- canvas size ---------- */
    _resizeCanvas() {
        const c = this.canvas.parentElement;
        const w = c.clientWidth  - 20;
        const h = c.clientHeight - 20;
        this.canvas.width  = Math.max(w, 400);
        this.canvas.height = Math.max(h, 300);
        if (this.sim) {
            this.sim.canvasW = this.canvas.width;
            this.sim.canvasH = this.canvas.height;
        }
    }

    /* ---------- control bindings ---------- */
    _bindControls() {
        /* sliders with live labels */
        const sliders = [
            'ballHeight', 'ballRadius', 'ballMass', 'ballLayers',
            'ballRot', 'ballVy', 'ballIntE',
            'kBall', 'dBall', 'kFloor', 'dFloor',
            'gravity', 'collisionK', 'subSteps',
            'boxHeight', 'boxCols', 'boxMass'
        ];
        for (const id of sliders) {
            const inp = document.getElementById('param_' + id);
            const lbl = document.getElementById('val_' + id);
            if (!inp || !lbl) continue;
            inp.addEventListener('input', () => {
                lbl.textContent = inp.value;
                this._onParamChange(id, parseFloat(inp.value));
            });
        }

        /* buttons */
        _on('btnReset',     () => this._reset());
        _on('btnPause',     () => this._togglePause());
        _on('btnAddBall',   () => this._enterMode('place_ball'));
        _on('btnAddBox',    () => this._enterMode('place_box_1'));
        _on('btnClearAll',  () => { this.sim.bodies.length = 0; this._updateBodyList(); });
    }

    _onParamChange(id, v) {
        /* live-update spring constants on existing bodies */
        if (id === 'kBall' || id === 'dBall') {
            const prop = id === 'kBall' ? 'stiffness' : 'damping';
            for (const b of this.sim.bodies) {
                if (b.name.startsWith('Ball'))
                    for (const s of b.springs) s[prop] = v;
            }
        }
        if (id === 'kFloor' || id === 'dFloor') {
            const prop = id === 'kFloor' ? 'stiffness' : 'damping';
            for (const b of this.sim.bodies) {
                if (b.name === 'Floor')
                    for (const s of b.springs) s[prop] = v;
            }
        }
        if (id === 'gravity')     this.sim.gravity    = v;
        if (id === 'collisionK')  this.sim.collisionK = v;
        if (id === 'subSteps')    this.sim.subSteps   = Math.round(v);
    }

    /* ---------- mode switching ---------- */
    _enterMode(m) {
        this.mode = m;
        const ind = document.getElementById('mode-indicator');
        if (m === 'place_ball') {
            ind.textContent = 'Click canvas to place ball';
            ind.style.display = 'block';
        } else if (m === 'place_box_1') {
            ind.textContent = 'Click lower-left corner of box';
            ind.style.display = 'block';
        } else if (m === 'place_box_2') {
            ind.textContent = 'Click lower-right corner of box';
            ind.style.display = 'block';
        } else {
            ind.style.display = 'none';
        }
    }

    /* ---------- mouse ---------- */
    _bindMouse() {
        const c = this.canvas;

        c.addEventListener('mousedown', (e) => {
            const {x, y} = this._canvasXY(e);

            if (this.mode === 'place_ball') {
                this._placeBallAt(x, y);
                this._enterMode('interact');
                return;
            }
            if (this.mode === 'place_box_1') {
                this.boxFirstCorner = { x, y };
                this._enterMode('place_box_2');
                return;
            }
            if (this.mode === 'place_box_2') {
                this._placeBoxAt(this.boxFirstCorner.x, this.boxFirstCorner.y, x, y);
                this.boxFirstCorner = null;
                this._enterMode('interact');
                return;
            }

            /* interact -- grab nearest particle */
            const p = this._nearestParticle(x, y, 30);
            if (p && !p.fixed) {
                this._dragging = p;
                this._dragging._wasMass = p.mass;
                c.classList.add('dragging');
                this.renderer.dragTarget = p;
            }
        });

        c.addEventListener('mousemove', (e) => {
            if (!this._dragging) return;
            const {x, y} = this._canvasXY(e);
            this._dragging.x  = x;
            this._dragging.y  = y;
            this._dragging.vx = 0;
            this._dragging.vy = 0;
        });

        const release = () => {
            if (this._dragging) {
                this._dragging = null;
                this.canvas.classList.remove('dragging');
                this.renderer.dragTarget = null;
            }
        };
        c.addEventListener('mouseup', release);
        c.addEventListener('mouseleave', release);

        /* touch support */
        c.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            c.dispatchEvent(new MouseEvent('mousedown',
                { clientX: t.clientX, clientY: t.clientY }));
        }, { passive: false });
        c.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            c.dispatchEvent(new MouseEvent('mousemove',
                { clientX: t.clientX, clientY: t.clientY }));
        }, { passive: false });
        c.addEventListener('touchend', () => {
            c.dispatchEvent(new MouseEvent('mouseup'));
        });
    }

    _canvasXY(e) {
        const r = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (this.canvas.width  / r.width),
            y: (e.clientY - r.top)  * (this.canvas.height / r.height)
        };
    }

    _nearestParticle(x, y, maxDist) {
        let best = null, bestD = maxDist;
        for (const b of this.sim.bodies)
            for (const p of b.particles) {
                const d = Math.hypot(p.x - x, p.y - y);
                if (d < bestD) { bestD = d; best = p; }
            }
        return best;
    }

    /* ---------- place helpers ---------- */
    _placeBallAt(cx, cy) {
        const r   = _val('ballRadius');
        const m   = _val('ballMass');
        const lay = Math.round(_val('ballLayers'));
        const k   = _val('kBall');
        const d   = _val('dBall');
        const rot = _val('ballRot');
        const vy0 = _val('ballVy');
        const intE= _val('ballIntE');

        const ball  = createBall(cx, cy, r, m, lay, k, d);
        ball.name   = 'Ball ' + (++this._bodyCounter);
        ball.color  = BODY_COLORS[(this.sim.bodies.length + 1) % BODY_COLORS.length];

        for (const p of ball.particles) {
            p.vy += vy0;
            const rx = p.x - cx, ry = p.y - cy;
            p.vx += -rot * ry;
            p.vy +=  rot * rx;
            p.vx += (Math.random() - 0.5) * intE;
            p.vy += (Math.random() - 0.5) * intE;
        }

        this.sim.addBody(ball);
        this._updateBodyList();
    }

    _placeBoxAt(x1, y1, x2, y2) {
        const h    = _val('boxHeight');
        const m    = _val('boxMass');
        const cols = Math.round(_val('boxCols'));
        const k    = _val('kBall');
        const d    = _val('dBall');
        const fix  = document.getElementById('param_boxFixed').checked;

        const box  = createBox(x1, y1, x2, y2, h, m, cols, k, d, fix);
        box.name   = 'Box ' + (++this._bodyCounter);
        box.color  = BODY_COLORS[this.sim.bodies.length % BODY_COLORS.length];

        this.sim.addBody(box);
        this._updateBodyList();
    }

    /* ---------- body list ---------- */
    _updateBodyList() {
        const ul = document.getElementById('bodyList');
        if (!ul) return;
        ul.innerHTML = '';
        for (const b of this.sim.bodies) {
            const li = document.createElement('li');
            li.innerHTML =
                `<span><span class="swatch" style="background:${b.color}"></span>${b.name}`
                + ` <small>(${b.particles.length}p)</small></span>`;
            const btn = document.createElement('button');
            btn.className = 'remove-btn';
            btn.textContent = '\u00d7';
            btn.onclick = () => { this.sim.removeBody(b); this._updateBodyList(); };
            li.appendChild(btn);
            ul.appendChild(li);
        }
    }

    /* ---------- sim control ---------- */
    _reset() {
        this.sim.bodies.length = 0;
        this._bodyCounter = 0;
        this._buildDefaultScene();
        this._updateBodyList();
    }

    _togglePause() {
        this.sim.paused = !this.sim.paused;
        const btn = document.getElementById('btnPause');
        if (btn) btn.textContent = this.sim.paused ? 'Resume' : 'Pause';
    }

    /* ---------- energy display ---------- */
    _updateEnergyTable() {
        const { rows, tot } = this.sim.allEnergies();
        const fmt = v => (v / 1000).toFixed(0) + ' k';

        /* rebuild header if body count changed */
        const table = document.getElementById('energyTable');
        if (!table) return;

        const numCols = rows.length;
        const thead   = table.querySelector('thead');
        const tbody   = table.querySelector('tbody');

        /* header row */
        let hdr = '<th>Type</th>';
        for (let i = 0; i < numCols; i++)
            hdr += `<th style="color:${this.sim.bodies[i].color}">${this.sim.bodies[i].name}</th>`;
        hdr += '<th class="tot-col">Total</th>';
        thead.innerHTML = '<tr>' + hdr + '</tr>';

        /* data rows */
        const fields = [
            ['Potential (mgh)', 'pe'],
            ['Kinetic (CM)',    'keCM'],
            ['Rotational',      'rotE'],
            ['Internal',        'intE'],
            ['Spring PE',       'springPE'],
            ['Contact PE',      'contactPE']
        ];

        let html = '';
        for (const [label, key] of fields) {
            html += '<tr><td>' + label + '</td>';
            for (let i = 0; i < numCols; i++) html += '<td>' + fmt(rows[i][key]) + '</td>';
            html += '<td class="tot-col">' + fmt(tot[key]) + '</td></tr>';
        }

        /* sum row */
        html += '<tr class="sum-row"><td>Body Sum</td>';
        for (let i = 0; i < numCols; i++) html += '<td>' + fmt(rows[i].sum) + '</td>';
        html += '<td class="tot-col">' + fmt(tot.sum) + '</td></tr>';

        tbody.innerHTML = html;
    }

    /* ---------- main loop ---------- */
    _loop(ts) {
        let dt = (ts - this._lastTime) / 1000;
        if (dt > 0.05) dt = 0.05;
        this._lastTime = ts;

        this.sim.step(dt);
        this.renderer.draw(this.sim);
        this._updateEnergyTable();

        this._animId = requestAnimationFrame(t => this._loop(t));
    }
}

/* ---------- helpers ---------- */
function _val(id) { return parseFloat(document.getElementById('param_' + id).value); }
function _on(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => new PhysimApp().init());
