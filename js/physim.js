// js/physim.js

const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

window.particles = [];
window.springs = [];
window.bodies = [];













// Physics parameters
let gravity = { x: 0, z: -196 }; // z is up, so gravity is negative
const SUBSTEPS = 20;
const COLLISION_STIFFNESS = 15000;

class Particle {
    constructor(x, z, mass, radius = 5, isFixed = false) {
        this.x = x;
        this.z = z;
        this.vx = 0;
        this.vz = 0;
        this.fx = 0;
        this.fz = 0;
        this.mass = mass;
        this.radius = radius;
        this.isFixed = isFixed;
        this.id = Math.random().toString(36).substr(2, 9);
    }
}

class Spring {
    constructor(p1, p2, stiffness, damping, tearRatio = 1.5) {
        this.p1 = p1;
        this.p2 = p2;
        this.stiffness = stiffness;
        this.damping = damping;
        this.restLength = Math.hypot(p1.x - p2.x, p1.z - p2.z);
        this.tearRatio = tearRatio;
        this.isTorn = false;
    }

    applyForce() {
        if (this.isTorn) return;

        const dx = this.p2.x - this.p1.x;
        const dz = this.p2.z - this.p1.z;
        const dist = Math.hypot(dx, dz);

        if (dist > this.restLength * this.tearRatio) {
            this.tear();
            return;
        }

        if (dist === 0) return;

        const stretch = dist - this.restLength;
        const forceMag = this.stiffness * stretch;

        // Damping
        const rvx = this.p2.vx - this.p1.vx;
        const rvz = this.p2.vz - this.p1.vz;
        const dampMag = (rvx * dx / dist + rvz * dz / dist) * this.damping;

        const totalForce = forceMag + dampMag;
        const fx = (dx / dist) * totalForce;
        const fz = (dz / dist) * totalForce;

        if (!this.p1.isFixed) {
            this.p1.fx += fx;
            this.p1.fz += fz;
        }
        if (!this.p2.isFixed) {
            this.p2.fx -= fx;
            this.p2.fz -= fz;
        }
    }

    tear() {
        this.isTorn = true;
        // Distribute potential energy back to particles
        const dx = this.p2.x - this.p1.x;
        const dz = this.p2.z - this.p1.z;
        const dist = Math.hypot(dx, dz);
        const stretch = dist - this.restLength;
        const pe = 0.5 * this.stiffness * stretch * stretch;

        // Conservation of energy and momentum
        // Impulse in direction of the spring
        const nx = dx / dist;
        const nz = dz / dist;

        // Each particle gets half PE if they have mass
        // v_new = v_old + impulse/m
        // 0.5 * m * (v_new^2 - v_old^2) = 0.5 * PE
        // This is complex for 2D. Let's simplify: give each particle an impulse
        // that adds kinetic energy equal to half the PE, directed along the spring.

        [this.p1, this.p2].forEach((p, idx) => {
            if (!p.isFixed) {
                const sign = (idx === 0) ? -1 : 1;
                // v_parallel component
                const vp = p.vx * nx + p.vz * nz;
                // We want: 0.5 * m * (vp + dv)^2 - 0.5 * m * vp^2 = 0.5 * PE
                // (vp + dv)^2 = vp^2 + PE/m
                // vp + dv = sqrt(vp^2 + PE/m)
                // dv = sqrt(vp^2 + PE/m) - vp
                const energyToGain = pe / 2;
                const dv = Math.sqrt(vp * vp + 2 * energyToGain / p.mass) - Math.abs(vp);
                // dv should be in the direction that pushes away from the other particle if compressed,
                // or towards if stretched? Actually when it tears, it's usually stretched.
                // If it tears while stretched (dist > rest), the particles should snap BACK.
                // p1 should move towards p2, p2 towards p1.
                const snapDir = (dist > this.restLength) ? 1 : -1;
                const finalSign = sign * snapDir;

                p.vx += nx * dv * finalSign;
                p.vz += nz * dv * finalSign;
            }
        });
    }
}

class Body {
    constructor(name, color = '#ff79c6') {
        this.name = name;
        this.color = color;
        this.particles = [];
        this.springs = [];
    }

    getMetrics() {
        let totalMass = 0;
        let cx = 0, cz = 0;
        let vx_cm = 0, vz_cm = 0;

        this.particles.forEach(p => {
            totalMass += p.mass;
            cx += p.x * p.mass;
            cz += p.z * p.mass;
            vx_cm += p.vx * p.mass;
            vz_cm += p.vz * p.mass;
        });

        if (totalMass === 0) return null;

        cx /= totalMass;
        cz /= totalMass;
        vx_cm /= totalMass;
        vz_cm /= totalMass;

        let ke_trans = 0.5 * totalMass * (vx_cm * vx_cm + vz_cm * vz_cm);
        let pe_grav = totalMass * -gravity.z * cz; // z is height

        let internal_ke = 0;
        let rot_inertia = 0;
        let ang_momentum = 0;

        this.particles.forEach(p => {
            const rx = p.x - cx;
            const rz = p.z - cz;
            const r_sq = rx * rx + rz * rz;

            const rel_vx = p.vx - vx_cm;
            const rel_vz = p.vz - vz_cm;

            internal_ke += 0.5 * p.mass * (rel_vx * rel_vx + rel_vz * rel_vz);

            rot_inertia += p.mass * r_sq;
            ang_momentum += p.mass * (rx * rel_vz - rz * rel_vx);
        });

        let omega = rot_inertia > 0 ? ang_momentum / rot_inertia : 0;
        let ke_rot = 0.5 * rot_inertia * omega * omega;

        let pe_spring = 0;
        this.springs.forEach(s => {
            if (!s.isTorn) {
                const dist = Math.hypot(s.p1.x - s.p2.x, s.p1.z - s.p2.z);
                const stretch = dist - s.restLength;
                pe_spring += 0.5 * s.stiffness * stretch * stretch;
            }
        });

        // Internal energy = internal kinetic (which includes rot) + spring potential
        // But the prompt says "internal energy (kinetic energy of all particles relative to the center of mass, minus rotational energy)"
        // And "Include spring energy into the internal energy."
        let thermal_ke = internal_ke - ke_rot;
        let internal_energy = thermal_ke + pe_spring;

        // Temperature proportional to thermal KE per particle
        let temp = this.particles.length > 1 ? thermal_ke / (this.particles.length) : 0;

        return {
            totalMass, cx, cz, ke_trans, ke_rot, thermal_ke, internal_energy, pe_grav, pe_spring, temp
        };
    }
}

function createBall(x, z, layers, radius, massPerParticle, stiffness, damping, isPinned, omega = 0) {
    const body = new Body(`Ball ${bodies.length + 1}`);
    const particlesInLayer = [1];
    const particleMap = new Map();

    // Center particle
    const center = new Particle(x, z, massPerParticle, 5, isPinned);
    body.particles.push(center);
    particles.push(center);
    particleMap.set("0,0", center);

    if (layers > 0) {
        const spacing = radius / layers;
        for (let l = 1; l <= layers; l++) {
            const numInLayer = l * 6;
            for (let i = 0; i < numInLayer; i++) {
                const angle = (i / numInLayer) * Math.PI * 2;
                const px = x + Math.cos(angle) * (l * spacing);
                const pz = z + Math.sin(angle) * (l * spacing);
                const p = new Particle(px, pz, massPerParticle, 5, false);
                body.particles.push(p);
                particles.push(p);
                particleMap.set(`${l},${i}`, p);

                // Connect to neighbors in same layer
                const prevIdx = (i - 1 + numInLayer) % numInLayer;
                const prevP = particleMap.get(`${l},${prevIdx}`);
                if (prevP) {
                    const s = new Spring(p, prevP, stiffness, damping);
                    body.springs.push(s);
                    springs.push(s);
                }

                // Connect to nearest in inner layer
                const innerLayer = l - 1;
                if (innerLayer === 0) {
                    const s = new Spring(p, center, stiffness, damping);
                    body.springs.push(s);
                    springs.push(s);
                } else {
                    const numInInner = innerLayer * 6;
                    const innerIdx = Math.round((i / numInLayer) * numInInner) % numInInner;
                    const innerP = particleMap.get(`${innerLayer},${innerIdx}`);
                    if (innerP) {
                        const s = new Spring(p, innerP, stiffness, damping);
                        body.springs.push(s);
                        springs.push(s);
                    }

                    // Cross bracing to neighbors of innerIdx
                    const innerIdxPrev = (innerIdx - 1 + numInInner) % numInInner;
                    const innerIdxNext = (innerIdx + 1) % numInInner;
                    [innerIdxPrev, innerIdxNext].forEach(idx => {
                        const braceP = particleMap.get(`${innerLayer},${idx}`);
                        if (braceP) {
                            const s = new Spring(p, braceP, stiffness, damping);
                            body.springs.push(s);
                            springs.push(s);
                        }
                    });
                }
            }
            // Close the loop for the layer
            const firstP = particleMap.get(`${l},0`);
            const lastP = particleMap.get(`${l},${numInLayer - 1}`);
            const s = new Spring(firstP, lastP, stiffness, damping);
            body.springs.push(s);
            springs.push(s);
        }
    }

    // Apply initial angular velocity
    if (omega !== 0) {
        body.particles.forEach(p => {
            const rx = p.x - x;
            const rz = p.z - z;
            p.vx = -omega * rz;
            p.vz = omega * rx;
        });
    }

    bodies.push(body);
    return body;
}

function createBox(x1, z1, x2, z2, height, massPerParticle, numX, stiffness, damping, pinType) {
    // pinType: 'none', 'bottom', 'left'
    const body = new Body(`Box ${bodies.length + 1}`);
    const dx = x2 - x1;
    const dz = z2 - z1;
    const width = Math.hypot(dx, dz);
    const nx = dx / width; // width direction
    const nz = dz / width;
    const ux = -nz; // height direction (perpendicular to width)
    const uz = nx;

    const spacing = numX > 1 ? width / (numX - 1) : width;
    const numZ = Math.max(1, Math.round(height / spacing));
    const grid = [];

    for (let i = 0; i < numX; i++) {
        grid[i] = [];
        for (let j = 0; j < numZ; j++) {
            const px = x1 + (i * spacing) * nx + (j * spacing) * ux;
            const pz = z1 + (i * spacing) * nz + (j * spacing) * uz;

            let isFixed = false;
            if (pinType === 'bottom' && j === 0) isFixed = true;
            if (pinType === 'left' && i === 0) isFixed = true;

            const p = new Particle(px, pz, massPerParticle, 5, isFixed);
            body.particles.push(p);
            particles.push(p);
            grid[i][j] = p;

            // Connect to neighbors
            if (i > 0) {
                const s = new Spring(p, grid[i-1][j], stiffness, damping);
                body.springs.push(s);
                springs.push(s);

                if (j > 0) {
                    // Diagonal
                    const s2 = new Spring(p, grid[i-1][j-1], stiffness, damping);
                    body.springs.push(s2);
                    springs.push(s2);
                }
            }
            if (j > 0) {
                const s = new Spring(p, grid[i][j-1], stiffness, damping);
                body.springs.push(s);
                springs.push(s);

                if (i < numX - 1 && grid[i+1] && grid[i+1][j-1]) {
                    // Other diagonal
                    const s2 = new Spring(p, grid[i+1][j-1], stiffness, damping);
                    body.springs.push(s2);
                    springs.push(s2);
                }
            }
        }
    }
    bodies.push(body);
    return body;
}

// Rendering helpers
function worldToCanvas(x, z) {
    // Mapping 800x600 world to actual canvas size
    const scaleX = canvas.width / 800;
    const scaleZ = canvas.height / 600;
    return {
        x: x * scaleX,
        y: canvas.height - (z * scaleZ)
    };
}

function canvasToWorld(x, y) {
    const scaleX = 800 / canvas.width;
    const scaleZ = 600 / canvas.height;
    return {
        x: x * scaleX,
        z: (canvas.height - y) * scaleZ
    };
}

function resolveCollisions() {
    const gridSize = 40; // Max particle diameter is usually less than this
    const grid = new Map();

    const getGridKey = (x, z) => `${Math.floor(x / gridSize)},${Math.floor(z / gridSize)}`;

    particles.forEach(p => {
        const key = getGridKey(p.x, p.z);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(p);
    });

    for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        const gx = Math.floor(p1.x / gridSize);
        const gz = Math.floor(p1.z / gridSize);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const key = `${gx + dx},${gz + dz}`;
                const neighbors = grid.get(key);
                if (!neighbors) continue;

                for (let p2 of neighbors) {
                    if (p1.id <= p2.id) continue; // Avoid double counting and self-collision
                    const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const dist = Math.hypot(dx, dz);
            const minDist = p1.radius + p2.radius;

            if (dist < minDist) {
                if (dist === 0) continue;
                // Collision normal
                const nx = dx / dist;
                const nz = dz / dist;

                // Relative velocity
                const rvx = p2.vx - p1.vx;
                const rvz = p2.vz - p1.vz;

                // Relative velocity along normal
                const velAlongNormal = rvx * nx + rvz * nz;

                // Do not resolve if velocities are separating
                if (velAlongNormal > 0) continue;

                // Elastic collision impulse
                // For particles, we use the standard 1D elastic collision formula along the normal
                let impulseMag;
                if (p1.isFixed && p2.isFixed) continue;

                if (p1.isFixed) {
                    impulseMag = 2 * p2.mass * (-velAlongNormal);
                    p2.vx += (impulseMag / p2.mass) * nx;
                    p2.vz += (impulseMag / p2.mass) * nz;
                } else if (p2.isFixed) {
                    impulseMag = 2 * p1.mass * (-velAlongNormal);
                    p1.vx -= (impulseMag / p1.mass) * nx;
                    p1.vz -= (impulseMag / p1.mass) * nz;
                } else {
                    impulseMag = (2 * (-velAlongNormal)) / (1 / p1.mass + 1 / p2.mass);
                    p1.vx -= (impulseMag / p1.mass) * nx;
                    p1.vz -= (impulseMag / p1.mass) * nz;
                    p2.vx += (impulseMag / p2.mass) * nx;
                    p2.vz += (impulseMag / p2.mass) * nz;
                }

                // Positional correction to prevent sinking
                const percent = 0.8; // penetration percentage to correct
                const slop = 0.01; // penetration allowance
                const correctionMag = Math.max(minDist - dist - slop, 0) / ( (p1.isFixed ? 0 : 1/p1.mass) + (p2.isFixed ? 0 : 1/p2.mass) ) * percent;
                const cx = correctionMag * nx;
                const cz = correctionMag * nz;
                if (!p1.isFixed) { p1.x -= cx / p1.mass; p1.z -= cz / p1.mass; }
                if (!p2.isFixed) { p2.x += cx / p2.mass; p2.z += cz / p2.mass; }
            }
        }

        }
    }

    for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        // Wall collisions
        if (!p1.isFixed) {
            if (p1.x < p1.radius) {
                p1.x = p1.radius;
                p1.vx = Math.abs(p1.vx);
            } else if (p1.x > 800 - p1.radius) {
                p1.x = 800 - p1.radius;
                p1.vx = -Math.abs(p1.vx);
            }
            if (p1.z < p1.radius) {
                p1.z = p1.radius;
                p1.vz = Math.abs(p1.vz);
            } else if (p1.z > 600 - p1.radius) {
                p1.z = 600 - p1.radius;
                p1.vz = -Math.abs(p1.vz);
            }
        }
    }
}

function updatePhysics(dt) {
    const subDt = dt / SUBSTEPS;

    for (let step = 0; step < SUBSTEPS; step++) {
        // Reset forces and apply gravity
        particles.forEach(p => {
            p.fx = 0;
            p.fz = p.isFixed ? 0 : p.mass * gravity.z;
        });

        // Apply spring forces
        springs.forEach(s => s.applyForce());

        // Integrate
        particles.forEach(p => {
            if (!p.isFixed) {
                p.vx += (p.fx / p.mass) * subDt;
                p.vz += (p.fz / p.mass) * subDt;
                p.x += p.vx * subDt;
                p.z += p.vz * subDt;
            }
        });

        // Resolve collisions
        resolveCollisions();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw springs
    ctx.lineWidth = 1;
    springs.forEach(s => {
        if (s.isTorn) return;
        const p1c = worldToCanvas(s.p1.x, s.p1.z);
        const p2c = worldToCanvas(s.p2.x, s.p2.z);
        ctx.strokeStyle = '#6272a4';
        ctx.beginPath();
        ctx.moveTo(p1c.x, p1c.y);
        ctx.lineTo(p2c.x, p2c.y);
        ctx.stroke();
    });

    // Draw particles
    particles.forEach(p => {
        const pc = worldToCanvas(p.x, p.z);
        ctx.fillStyle = p.isFixed ? '#ff5555' : '#f1fa8c';
        ctx.beginPath();
        ctx.arc(pc.x, pc.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#121216';
        ctx.stroke();
    });
}

let lastTime = 0;
let isPaused = false;

function loop(timestamp) {
    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.05) dt = 0.05;
    lastTime = timestamp;

    if (!isPaused) {
        updatePhysics(dt);
    }
    draw();
    if (!isPaused) {
        updateMetrics();
    }

    requestAnimationFrame(loop);
}

function updateMetrics() {
    const tbody = document.getElementById('metrics-body');
    tbody.innerHTML = '';
    bodies.forEach(b => {
        const m = b.getMetrics();
        if (!m) return;
        const row = document.createElement('tr');
        const etot = m.ke_trans + m.ke_rot + m.pe_grav + m.internal_energy;
        row.innerHTML = `
            <td>${b.name}</td>
            <td>${m.temp.toFixed(1)}</td>
            <td>${m.ke_trans.toFixed(0)}</td>
            <td>${m.ke_rot.toFixed(0)}</td>
            <td>${m.pe_grav.toFixed(0)}</td>
            <td>${m.pe_spring.toFixed(0)}</td>
            <td>${m.internal_energy.toFixed(0)}</td>
            <td>${etot.toFixed(0)}</td>
        `;
        tbody.appendChild(row);
    });
}

function saveState(name) {
    const state = {
        bodies: bodies.map(b => ({
            name: b.name,
            color: b.color,
            particles: b.particles.map(p => ({
                id: p.id, x: p.x, z: p.z, vx: p.vx, vz: p.vz, mass: p.mass, radius: p.radius, isFixed: p.isFixed
            })),
            springs: b.springs.map(s => ({
                p1Id: s.p1.id, p2Id: s.p2.id, stiffness: s.stiffness, damping: s.damping, restLength: s.restLength, tearRatio: s.tearRatio, isTorn: s.isTorn
            }))
        }))
    };
    if (name) {
        localStorage.setItem(`physim_state_${name}`, JSON.stringify(state));
        updateLoadSelect();
    }
    return JSON.stringify(state);
}

function loadState(stateObj) {
    particles = window.particles = [];
    springs = window.springs = [];
    bodies = window.bodies = [];

    stateObj.bodies.forEach(bData => {
        const body = new Body(bData.name, bData.color);
        const pMap = new Map();

        bData.particles.forEach(pData => {
            const p = new Particle(pData.x, pData.z, pData.mass, pData.radius, pData.isFixed);
            p.id = pData.id;
            p.vx = pData.vx;
            p.vz = pData.vz;
            body.particles.push(p);
            particles.push(p);
            pMap.set(p.id, p);
        });

        bData.springs.forEach(sData => {
            const p1 = pMap.get(sData.p1Id);
            const p2 = pMap.get(sData.p2Id);
            if (p1 && p2) {
                const s = new Spring(p1, p2, sData.stiffness, sData.damping, sData.tearRatio);
                s.isTorn = sData.isTorn;
                s.restLength = sData.restLength;
                body.springs.push(s);
                springs.push(s);
            }
        });

        bodies.push(body);
    });
}

function updateLoadSelect() {
    const select = document.getElementById('load-select');
    select.innerHTML = '<option value="">Select State...</option>';
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('physim_state_')) {
            const name = key.replace('physim_state_', '');
            const opt = document.createElement('option');
            opt.value = name;
            opt.innerText = name;
            select.appendChild(opt);
        }
    }
}

document.getElementById('btn-save').addEventListener('click', () => {
    const name = document.getElementById('save-name').value;
    if (name) saveState(name);
});

document.getElementById('btn-load').addEventListener('click', () => {
    const name = document.getElementById('load-select').value;
    if (name) {
        const stateStr = localStorage.getItem(`physim_state_${name}`);
        if (stateStr) loadState(JSON.parse(stateStr));
    }
});

document.getElementById('btn-export').addEventListener('click', () => {
    const stateStr = saveState();
    const blob = new Blob([stateStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'physim_state.json';
    a.click();
});

document.getElementById('btn-import').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            loadState(JSON.parse(event.target.result));
        };
        reader.readAsText(file);
    };
    input.click();
});

updateLoadSelect();

// UI Event Handlers
document.getElementById('param_gravity').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    gravity.z = -val;
    document.getElementById('val_gravity').innerText = val;
});

document.getElementById('btn-spawn-ball').addEventListener('click', () => {
    const radius = parseFloat(document.getElementById('ball-radius').value);
    const layers = parseInt(document.getElementById('ball-layers').value);
    const mass = parseFloat(document.getElementById('ball-mass').value);
    const k = parseFloat(document.getElementById('ball-k').value);
    const d = parseFloat(document.getElementById('ball-d').value);
    const omega = parseFloat(document.getElementById('ball-omega').value);
    const pinned = document.getElementById('ball-pin').checked;
    createBall(800 / 2, 600 / 2, layers, radius, mass, k, d, pinned, omega);
});

document.getElementById('btn-spawn-box').addEventListener('click', () => {
    const w = parseFloat(document.getElementById('box-w').value);
    const h = parseFloat(document.getElementById('box-h').value);
    const nx = parseInt(document.getElementById('box-nx').value);
    const mass = parseFloat(document.getElementById('box-mass').value);
    const k = parseFloat(document.getElementById('box-k').value);
    const d = parseFloat(document.getElementById('box-d').value);
    const pin = document.getElementById('box-pin').value;
    const x1 = (800 - w) / 2;
    const z1 = (600 - h) / 2;
    createBox(x1, z1, x1 + w, z1, h, mass, nx, k, d, pin);
});

document.getElementById('btn-pause').addEventListener('click', () => {
    isPaused = !isPaused;
    document.getElementById('btn-pause').innerText = isPaused ? 'Resume' : 'Pause';
});

document.getElementById('btn-reset').addEventListener('click', () => {
    particles = window.particles = [];
    springs = window.springs = [];
    bodies = window.bodies = [];
});

document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    resizeCanvas();
});

// Heating/Cooling brush
let isMouseDown = false;
canvas.addEventListener('mousedown', () => isMouseDown = true);
window.addEventListener('mouseup', () => isMouseDown = false);

canvas.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    const mode = document.getElementById('brush-mode').value;
    if (mode === 'none') return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const worldPos = canvasToWorld(mouseX, mouseY);

    const brushRadius = 50;
    const effectScale = mode === 'heat' ? 1.05 : 0.95;

    bodies.forEach(b => {
        let totalMass = 0;
        let cx = 0, cz = 0;
        let vx_cm = 0, vz_cm = 0;
        b.particles.forEach(p => {
            totalMass += p.mass;
            cx += p.x * p.mass; cz += p.z * p.mass;
            vx_cm += p.vx * p.mass; vz_cm += p.vz * p.mass;
        });
        cx /= totalMass; cz /= totalMass;
        vx_cm /= totalMass; vz_cm /= totalMass;

        let rot_inertia = 0, ang_momentum = 0;
        b.particles.forEach(p => {
            const rx = p.x - cx; const rz = p.z - cz;
            rot_inertia += p.mass * (rx*rx + rz*rz);
            ang_momentum += p.mass * (rx * (p.vz - vz_cm) - rz * (p.vx - vx_cm));
        });
        const omega = rot_inertia > 0 ? ang_momentum / rot_inertia : 0;

        b.particles.forEach(p => {
            const dx = p.x - worldPos.x;
            const dz = p.z - worldPos.z;
            if (dx*dx + dz*dz < brushRadius*brushRadius) {
                const rx = p.x - cx; const rz = p.z - cz;
                // v_rot = omega cross r -> (-omega*rz, omega*rx)
                const vrx = -omega * rz;
                const vrz = omega * rx;

                // v_thermal = v - v_cm - v_rot
                const vtx = p.vx - vx_cm - vrx;
                const vtz = p.vz - vz_cm - vrz;

                p.vx = vx_cm + vrx + vtx * effectScale;
                p.vz = vz_cm + vrz + vtz * effectScale;
            }
        });
    });
});

function isLocalStorageEmpty() {
    for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i).startsWith('physim_state_')) {
            return false;
        }
    }
    return true;
}

function preloadExample() {
    if (!isLocalStorageEmpty()) return;

    // Floor: 800px wide, 5 rows high
    const floorW = 800;
    const floorRows = 5;
    const spacing = 10;
    const floorNx = Math.floor(floorW / spacing) + 1;
    // For 5 rows, numZ should be 5. numZ = round(height / spacing)
    const floorHeight = (floorRows) * spacing; // 50

    // createBox(x1, z1, x2, z2, height, massPerParticle, numX, stiffness, damping, pinType)
    // z is up. Bottom at z=5 so particles (radius 5) touch the bottom wall.
    createBox(0, 5, floorW, 5, floorHeight, 10, floorNx, 5000, 5, 'bottom');

    // Ball: upper left, 3 layers, clockwise rotation
    const ballX = 150;
    const ballZ = 450;
    const ballLayers = 3;
    const ballRadius = 60;
    // 1 rotation per 3 seconds clockwise
    const ballOmega = -2 * Math.PI / 3;
    createBall(ballX, ballZ, ballLayers, ballRadius, 10, 5000, 5, false, ballOmega);
}

function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}

window.addEventListener('resize', resizeCanvas);

init();

function init() {
    resizeCanvas();
    preloadExample();
    requestAnimationFrame((ts) => {
        lastTime = ts;
        loop(ts);
    });
}

}
