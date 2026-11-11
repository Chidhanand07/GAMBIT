// Frame drawing for components/ui/KnightBackground.tsx (canvas 2D, called once per animation frame).

const ACCENT_R = 196,
    ACCENT_G = 150,
    ACCENT_B = 90;
const KNIGHT_GLYPH = '♞';
const TRAIL_STEPS = 12;
const FLOATER_COUNT = 8;

export interface FloatingKnight {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    rotation: number; // subtle tilt (-0.15 to 0.15 radians)
    rotSpeed: number; // very slow rotation drift
}

export interface CanvasSize {
    cw: number;
    ch: number;
}

function makeFloatingKnight(cw: number, ch: number): FloatingKnight {
    const speed = 0.3 + Math.random() * 0.4; // px per frame, very slow
    const angle = Math.random() * Math.PI * 2;
    return {
        x: Math.random() * cw,
        y: Math.random() * ch,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.min(cw, ch) * (0.09 + Math.random() * 0.05),
        alpha: 0.07 + Math.random() * 0.06,
        rotation: (Math.random() - 0.5) * 0.3,
        rotSpeed: (Math.random() - 0.5) * 0.0003,
    };
}

/** The lobby's drifting knights (none for the landing page). */
export function makeFloaters(mode: 'landing' | 'lobby', { cw, ch }: CanvasSize): FloatingKnight[] {
    return mode === 'lobby' ? Array.from({ length: FLOATER_COUNT }, () => makeFloatingKnight(cw, ch)) : [];
}

interface OrbitDef {
    a: number;
    b: number;
    tilt: number;
    speed: number;
    r: number;
}

function drawOrbit(ctx: CanvasRenderingContext2D, orb: OrbitDef, angle: number, { cw, ch }: CanvasSize) {
    const cx = cw / 2,
        cy = ch / 2;
    const a = angle * orb.speed;
    // Trail
    for (let ti = 0; ti < TRAIL_STEPS; ti++) {
        const ta = a - ti * 0.03 * orb.speed;
        const ex2 = Math.cos(ta) * orb.a;
        const ey2 = Math.sin(ta) * orb.b;
        const tx2 = cx + ex2 * Math.cos(orb.tilt) - ey2 * Math.sin(orb.tilt);
        const ty2 = cy + ex2 * Math.sin(orb.tilt) + ey2 * Math.cos(orb.tilt);
        const fade = (1 - ti / TRAIL_STEPS) * 0.25;
        ctx.beginPath();
        ctx.arc(tx2, ty2, orb.r * (1 - ti / TRAIL_STEPS), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${fade})`;
        ctx.fill();
    }
    // Head
    const ex = Math.cos(a) * orb.a;
    const ey = Math.sin(a) * orb.b;
    const px = cx + ex * Math.cos(orb.tilt) - ey * Math.sin(orb.tilt);
    const py = cy + ex * Math.sin(orb.tilt) + ey * Math.cos(orb.tilt);
    ctx.beginPath();
    ctx.arc(px, py, orb.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,220,150,0.7)';
    ctx.fill();
}

/** Landing: faint knight watermark with parallax plus three orbiting particles. */
export function drawLandingFrame(ctx: CanvasRenderingContext2D, size: CanvasSize, angle: number) {
    const { cw, ch } = size;
    // Faint knight watermark with parallax
    ctx.save();
    ctx.translate(cw / 2 + Math.sin(angle * 0.5) * 8, ch / 2 + Math.cos(angle * 0.4) * 5);
    const glyphSize = Math.min(cw, ch) * 0.55;
    ctx.font = `bold ${Math.round(glyphSize * 0.82)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},0.04)`;
    ctx.fillText(KNIGHT_GLYPH, 0, 0);
    ctx.restore();

    // 3 orbital particles
    const orbDefs: OrbitDef[] = [
        { a: Math.min(cw, ch) * 0.32, b: Math.min(cw, ch) * 0.18, tilt: 0, speed: 1.0, r: 2.5 },
        { a: Math.min(cw, ch) * 0.4, b: Math.min(cw, ch) * 0.22, tilt: Math.PI / 3, speed: 0.7, r: 1.8 },
        { a: Math.min(cw, ch) * 0.28, b: Math.min(cw, ch) * 0.14, tilt: -Math.PI / 4, speed: 1.3, r: 1.5 },
    ];
    orbDefs.forEach((orb) => drawOrbit(ctx, orb, angle, size));
}

function stepFloater(k: FloatingKnight, { cw, ch }: CanvasSize) {
    // Move
    k.x += k.vx;
    k.y += k.vy;
    k.rotation += k.rotSpeed;

    // Soft wrap-around at edges (with margin so they don't pop in)
    const margin = k.size;
    if (k.x < -margin) k.x = cw + margin;
    if (k.x > cw + margin) k.x = -margin;
    if (k.y < -margin) k.y = ch + margin;
    if (k.y > ch + margin) k.y = -margin;
}

/** Lobby: knights float freely in space. */
export function drawLobbyFrame(ctx: CanvasRenderingContext2D, floaters: FloatingKnight[], size: CanvasSize) {
    floaters.forEach((k) => {
        stepFloater(k, size);

        // Draw knight glyph
        ctx.save();
        ctx.translate(k.x, k.y);
        ctx.rotate(k.rotation);
        ctx.font = `bold ${Math.round(k.size)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(${ACCENT_R},${ACCENT_G},${ACCENT_B},${k.alpha})`;
        ctx.fillText(KNIGHT_GLYPH, 0, 0);
        ctx.restore();
    });
}
