import { render } from '@testing-library/react'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { isOptimizableImageUrl } from '@/lib/imageHosts'

describe('isOptimizableImageUrl', () => {
    test.each([
        ['https://abc.supabase.co/storage/v1/object/public/avatars/u/avatar.png', true],
        ['https://lh3.googleusercontent.com/a/xyz', true],
        ['http://abc.supabase.co/a.png', false], // wrong protocol
        ['https://supabase.co/a.png', false], // the wildcard needs a subdomain
        ['https://evil.example/abc.supabase.co.png', false],
        ['https://abc.supabase.co.evil.example/a.png', false],
        ['/local.png', false],
        ['not a url', false],
    ])('%s → %s', (src, expected) => {
        expect(isOptimizableImageUrl(src)).toBe(expected)
    })

    test('the host list is the one next.config passes to images.remotePatterns', () => {
        const nextConfig = require('../../next.config.js')
        expect(nextConfig.images.remotePatterns).toEqual(require('../../lib/imageHosts.json'))
    })
})

describe('AvatarImage', () => {
    test('a configured host goes through the optimizer at the box size', () => {
        const { container } = render(<AvatarImage src="https://abc.supabase.co/a.png" size={36} />)
        const img = container.querySelector('img')!
        expect(img.getAttribute('src')).toMatch(/^\/_next\/image\?url=https%3A%2F%2Fabc\.supabase\.co%2Fa\.png&w=\d+/)
        expect(img).toHaveAttribute('width', '36')
        expect(img).toHaveAttribute('sizes', '36px')
    })

    test('any other host is rendered unoptimized, exactly as given (next/image would throw on it)', () => {
        const { container } = render(<AvatarImage src="https://img.test/a.png?t=1" size={88} />)
        expect(container.querySelector('img')).toHaveAttribute('src', 'https://img.test/a.png?t=1')
    })
})
