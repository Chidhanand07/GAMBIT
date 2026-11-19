import { clockPercent, formatClock, isClockLow, LOW_CLOCK_SECONDS } from '@/lib/chess/clock'

describe('formatClock', () => {
    test('m:ss under an hour, minutes unpadded (Game.dc.html)', () => {
        expect(formatClock(180)).toBe('3:00')
        expect(formatClock(600)).toBe('10:00')
        expect(formatClock(65)).toBe('1:05')
        expect(formatClock(7)).toBe('0:07')
        expect(formatClock(0)).toBe('0:00')
        expect(formatClock(3599)).toBe('59:59')
    })

    test('h:mm:ss from an hour, days for daily games', () => {
        expect(formatClock(3600)).toBe('1:00:00')
        expect(formatClock(5405)).toBe('1:30:05')
        expect(formatClock(86_400)).toBe('1 day')
        expect(formatClock(3 * 86_400 + 5)).toBe('3 days')
    })

    test('clamps negatives and floors fractions', () => {
        expect(formatClock(-4)).toBe('0:00')
        expect(formatClock(59.9)).toBe('0:59')
    })
})

describe('isClockLow / clockPercent', () => {
    test('low under 30 s, never in games longer than an hour', () => {
        expect(LOW_CLOCK_SECONDS).toBe(30)
        expect(isClockLow(29, 180)).toBe(true)
        expect(isClockLow(30, 180)).toBe(false)
        expect(isClockLow(10, 3600)).toBe(true)
        expect(isClockLow(10, 86_400)).toBe(false)
    })

    test('whole percentage of the starting time, clamped to 0–100', () => {
        expect(clockPercent(90, 180)).toBe(50)
        expect(clockPercent(1, 3)).toBe(33)
        expect(clockPercent(-5, 180)).toBe(0)
        expect(clockPercent(200, 180)).toBe(100)
        expect(clockPercent(5, 0)).toBe(0)
    })
})
