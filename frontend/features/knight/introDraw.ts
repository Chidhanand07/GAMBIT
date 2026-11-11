// Per-frame drawing for components/ui/KnightIntro.tsx.
import {
    ACCENT_B,
    ACCENT_G,
    ACCENT_R,
    PHASE,
    clamp,
    easeInOut,
    easeOut,
    lerp,
    type AmbientParticle,
    type FormationParticle,
    type OrbitalParticle,
    type Point,
} from './introParticles';

const BACKGROUND = '#0F0D0B';
const ORBIT_STEP = 0.016;
const KNIGHT_GLYPH = '♞';
const TRACER_RADIUS = 10;

export interface IntroScene {
    cw: number;
    ch: number;
    formation: FormationParticle[];
    ambient: AmbientParticle[];
    orbitals: OrbitalParticle[];
}

export function clearToBackground(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, cw, ch);
}

function drawAmbient(ctx: CanvasRenderingContext2D, scene: IntroScene, t: number) {
    const { cw, ch } = scene;
    scene.ambient.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = cw;
        if (p.x > cw) p.x = 0;
        if (p.y < 0) p.y = ch;
        if (p.y > ch) p.y = 0;
        p.alpha = clamp(p.alpha + (t < 2 ? 0.005 : 0), 0, p.maxAlpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${p.alpha})`;
        ctx.fill();
    });
}

function drawOrbitalTrail(ctx: CanvasRenderingContext2D, orb: OrbitalParticle, center: Point) {
    const { x: cx, y: cy } = center;
    for (let ti = 0; ti < orb.trailLength; ti++) {
        const ta = orb.angle - ti * 0.04;
        const ex = Math.cos(ta) * orb.a;
        const ey = Math.sin(ta) * orb.b;
        const px = cx + ex * Math.cos(orb.tilt) - ey * Math.sin(orb.tilt);
        const py = cy + ex * Math.sin(orb.tilt) + ey * Math.cos(orb.tilt);
        const fade = (1 - ti / orb.trailLength) * 0.7;
        const r = orb.radius * (1 - ti / orb.trailLength);
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.1, r), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${fade})`;
        ctx.fill();
    }
}

/** Advances and draws the orbiting particles (trail + glowing head). Used in every phase. */
function drawOrbitals(ctx: CanvasRenderingContext2D, orbitals: OrbitalParticle[], cw: number, ch: number) {
    const cx = cw / 2,
        cy = ch / 2;
    orbitals.forEach((orb) => {
        orb.angle += orb.speed * ORBIT_STEP;
        drawOrbitalTrail(ctx, orb, { x: cx, y: cy });
        const hx =
            cx + Math.cos(orb.angle) * orb.a * Math.cos(orb.tilt) - Math.sin(orb.angle) * orb.b * Math.sin(orb.tilt);
        const hy =
            cy + Math.cos(orb.angle) * orb.a * Math.sin(orb.tilt) + Math.sin(orb.angle) * orb.b * Math.cos(orb.tilt);
        ctx.beginPath();
        ctx.arc(hx, hy, orb.radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,220,160,0.9)`;
        ctx.fill();
    });
}

function moveFormationParticle(p: FormationParticle, t: number) {
    if (t < PHASE.DRIFT_END) {
        p.x += p.vx;
        p.y += p.vy;
    } else if (t < PHASE.ATTRACT_END) {
        const attractT = t - PHASE.DRIFT_END;
        const myT = clamp((attractT - p.delay) / (PHASE.ATTRACT_END - PHASE.DRIFT_END - p.delay), 0, 1);
        const progress = easeInOut(myT);
        p.x = lerp(p.sx, p.tx, progress);
        p.y = lerp(p.sy, p.ty, progress);
    } else if (t < PHASE.LOCK_END) {
        const snapT = (t - PHASE.ATTRACT_END) / (PHASE.LOCK_END - PHASE.ATTRACT_END);
        const progress = easeOut(snapT);
        p.x = lerp(p.x, p.tx, progress * 0.15);
        p.y = lerp(p.y, p.ty, progress * 0.15);
    } else {
        p.x = p.tx;
        p.y = p.ty;
    }

    if (t >= PHASE.DRIFT_END && t < PHASE.DRIFT_END + 0.02) {
        p.sx = p.x;
        p.sy = p.y;
    }
}

function drawFormationParticle(ctx: CanvasRenderingContext2D, p: FormationParticle, t: number) {
    let bRadius = p.radius;
    if (t >= PHASE.LOCK_END) {
        bRadius += Math.sin(t * 2.5 + p.breathPhase) * 0.3;
    }

    let alpha = p.alpha;
    if (t >= PHASE.ATTRACT_END) {
        const lockT = clamp((t - PHASE.ATTRACT_END) / (PHASE.LOCK_END - PHASE.ATTRACT_END), 0, 1);
        alpha = lerp(p.alpha, 1.0, easeOut(lockT));
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.1, bRadius), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${alpha})`;
    ctx.fill();
}

function drawSolidKnight(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
    const glyphSize = Math.min(cw, ch) * 0.52;
    const fontSize = Math.round(glyphSize * 0.82);
    ctx.font = `bold ${fontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},0.85)`;
    ctx.fillText(KNIGHT_GLYPH, cw / 2, ch / 2 + glyphSize * 0.03);
}

/** Phases 1–4: drift, attract to the silhouette, lock and breathe, then a top-down solid sweep. */
export function drawPhase1to4(ctx: CanvasRenderingContext2D, scene: IntroScene, t: number) {
    const { cw, ch } = scene;
    clearToBackground(ctx, cw, ch);

    // Ambient particles
    drawAmbient(ctx, scene, t);

    // Orbital particles
    drawOrbitals(ctx, scene.orbitals, cw, ch);

    // Formation particles
    scene.formation.forEach((p) => {
        moveFormationParticle(p, t);
        drawFormationParticle(ctx, p, t);
    });

    // Phase 4: sweep solidification
    if (t >= PHASE.LOCK_END && t < PHASE.SOLIDIFY_END) {
        const sweepT = (t - PHASE.LOCK_END) / (PHASE.SOLIDIFY_END - PHASE.LOCK_END);
        const sweepProgress = easeInOut(sweepT);
        const scanY = ch * sweepProgress;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, cw, scanY);
        ctx.clip();
        // Draw knight glyph solid
        drawSolidKnight(ctx, cw, ch);
        ctx.restore();
    }
}

function drawTracerHead(ctx: CanvasRenderingContext2D, head: Point) {
    // Gold glow dot at tracer head
    const grd = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, TRACER_RADIUS);
    grd.addColorStop(0, 'rgba(255,240,200,1)');
    grd.addColorStop(0.4, `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},0.8)`);
    grd.addColorStop(1, 'rgba(196,150,90,0)');
    ctx.beginPath();
    ctx.arc(head.x, head.y, TRACER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Bright core
    ctx.beginPath();
    ctx.arc(head.x, head.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
}

/** Phases 5–7: solid knight, orbitals, and a glowing tracer running along the outline. */
export function drawPhase5to7(ctx: CanvasRenderingContext2D, scene: IntroScene, t: number, perimeterPoints: Point[]) {
    const { cw, ch } = scene;
    // Keep knight visible as solid glyph
    drawSolidKnight(ctx, cw, ch);

    // Continue orbital particles during title phase
    drawOrbitals(ctx, scene.orbitals, cw, ch);

    const total = perimeterPoints.length;
    if (total === 0) return;

    const traceElapsed = t - PHASE.SOLIDIFY_END;
    const traceDuration = PHASE.OUTLINE_END - PHASE.SOLIDIFY_END;
    const traceT = clamp(traceElapsed / traceDuration, 0, 1);
    const headIdx = Math.min(Math.floor(traceT * total), total - 1);

    if (headIdx >= 0 && headIdx < total) {
        drawTracerHead(ctx, perimeterPoints[headIdx]);
    }
}
