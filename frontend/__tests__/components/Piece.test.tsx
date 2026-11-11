import { render, screen } from '@testing-library/react'
import Piece from '@/components/ui/Piece'

test.each([
    ['w', 'K', '/pieces/classic/wk.png'],
    ['b', 'q', '/pieces/classic/bq.png'],
    ['w', 'N', '/pieces/classic/wn.png'],
    ['b', 'p', '/pieces/classic/bp.png'],
] as const)('%s%s renders %s', (color, type, src) => {
    render(<Piece color={color} type={type} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', src)
    expect(img).toHaveAttribute('draggable', 'false')
})

test('every piece image the board can ask for exists in /public', () => {
    const fs = require('fs')
    const path = require('path')
    for (const c of ['w', 'b']) {
        for (const t of ['k', 'q', 'r', 'b', 'n', 'p']) {
            expect(fs.existsSync(path.join(__dirname, '../../public/pieces/classic', `${c}${t}.png`))).toBe(true)
        }
    }
})
