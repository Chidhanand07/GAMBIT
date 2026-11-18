import { Tile } from '@/components/ui/Tile';
import type { LobbyTimeControlId } from '@/types/timeControl';
import { TILE_COPY } from '../lobbyOptions';
import { BASE_TIME_CONTROLS } from '../timeControls';

const CLOCK_IDS: readonly LobbyTimeControlId[] = ['bullet', 'blitz', 'rapid', 'classical'];

interface TimeControlGridProps {
    selected: LobbyTimeControlId;
    onSelect: (id: LobbyTimeControlId) => void;
}

/** The four clock tiles, then Custom and Daily (Main.dc.html; motion from `.tile`). */
export function TimeControlGrid({ selected, onSelect }: TimeControlGridProps) {
    const clocks = BASE_TIME_CONTROLS.filter((tc) => CLOCK_IDS.includes(tc.id));
    const extras = BASE_TIME_CONTROLS.filter((tc) => !CLOCK_IDS.includes(tc.id));
    return (
        <>
            <div className="flex flex-wrap gap-3">
                {clocks.map((tc) => (
                    <Tile
                        key={tc.id}
                        iconPath={TILE_COPY[tc.id].icon}
                        title={tc.label}
                        blurb={TILE_COPY[tc.id].blurb}
                        value={String(tc.mins)}
                        unit="min"
                        badge={TILE_COPY[tc.id].popular ? 'Popular' : undefined}
                        selected={selected === tc.id}
                        onSelect={() => onSelect(tc.id)}
                    />
                ))}
            </div>
            <div className="flex flex-wrap gap-3">
                {extras.map((tc) => (
                    <Tile
                        key={tc.id}
                        variant="wide"
                        iconPath={TILE_COPY[tc.id].icon}
                        title={tc.label}
                        blurb={TILE_COPY[tc.id].blurb}
                        meta={tc.time}
                        selected={selected === tc.id}
                        onSelect={() => onSelect(tc.id)}
                    />
                ))}
            </div>
        </>
    );
}
