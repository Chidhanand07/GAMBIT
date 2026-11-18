import { rnd, splashParticle, splashParticles, SPLASH_PARTICLE_COUNT } from '@/lib/design/seededRandom';

describe('rnd (HANDOFF §4.3)', () => {
    test('is frac(sin(n*91.7+13.3)*43758.5453)', () => {
        expect(rnd(0)).toBeCloseTo(0.3987705902509333, 12);
        expect(rnd(1)).toBeCloseTo(0.7878300766315078, 12);
        expect(rnd(42)).toBeCloseTo(0.7174114920489956, 12);
    });

    test('is deterministic and stays in [0, 1)', () => {
        for (let n = -50; n < 1000; n++) {
            const value = rnd(n);
            expect(value).toBe(rnd(n));
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    test('never calls Math.random', () => {
        const spy = jest.spyOn(Math, 'random');
        splashParticles();
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe('splash particles', () => {
    test('90 particles, matching the values Home.dc.html computes', () => {
        const particles = splashParticles();
        expect(SPLASH_PARTICLE_COUNT).toBe(90);
        expect(particles).toHaveLength(90);
        expect(particles[0]).toEqual({ x: '-354px', y: '183px', s: '4.5px', d: '1.26s' });
        expect(particles[1]).toEqual({ x: '95px', y: '-275px', s: '3.5px', d: '0.39s' });
        expect(particles[89]).toEqual(splashParticle(89));
        expect(particles[89]).toEqual({ x: '286px', y: '309px', s: '4.9px', d: '1.15s' });
    });

    test('delays are staggered up to 1.4s and sizes stay within 2–5px', () => {
        for (const p of splashParticles()) {
            const delay = parseFloat(p.d);
            const size = parseFloat(p.s);
            expect(delay).toBeGreaterThanOrEqual(0);
            expect(delay).toBeLessThanOrEqual(1.4);
            expect(size).toBeGreaterThanOrEqual(2);
            expect(size).toBeLessThanOrEqual(5);
        }
    });
});
