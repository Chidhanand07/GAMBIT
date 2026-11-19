import { SPEED_BUCKET_LABELS, TIME_CONTROL_PRESETS, timeControlOf } from '@/lib/chess/timeControl';
import type { NotificationPrefs } from '@/types/preferences';
import type { SpeedBucket } from '@/types/timeControl';
import type { BrowserPermission } from '../hooks/useBrowserNotifications';
import { PreviewCard } from './PreviewCard';

interface Toast {
    title: string;
    body: string;
}

const MINUTES_LABEL = (bucket: SpeedBucket) => `${timeControlOf(TIME_CONTROL_PRESETS[bucket]).minutes} min`;

/**
 * What each switch lets through, in the order of Settings.dc.html. The copy describes the kind
 * of notification; it names no players (the mockup's sample names are not real data).
 */
function toastsFor(prefs: NotificationPrefs, timeControl: SpeedBucket, permission: BrowserPermission): Toast[] {
    const toasts: Toast[] = [];
    if (prefs.challenges)
        toasts.push({
            title: 'A friend challenged you',
            body: `${SPEED_BUCKET_LABELS[timeControl]} · ${MINUTES_LABEL(timeControl)}`,
        });
    if (prefs.friendRequests) toasts.push({ title: 'New friend request', body: 'Accept to play together' });
    if (prefs.gameResults) toasts.push({ title: 'Game over', body: 'Your result and rating change' });
    if (prefs.yourTurn) toasts.push({ title: 'Your move', body: 'Daily game · 1 day per move' });
    if (prefs.emailDigest) toasts.push({ title: 'Weekly digest', body: 'Your best game of the week' });
    if (prefs.browser) toasts.push(browserToast(permission));
    return toasts;
}

function browserToast(permission: BrowserPermission): Toast {
    if (permission === 'denied')
        return { title: 'Browser alerts blocked', body: 'Allow notifications for this site in your browser' };
    if (permission === 'unsupported')
        return { title: 'Browser alerts unavailable', body: 'This browser cannot show notifications' };
    return { title: 'Browser alerts allowed', body: 'Gambit can notify you in the background' };
}

interface Props {
    prefs: NotificationPrefs;
    timeControl: SpeedBucket;
    permission: BrowserPermission;
}

/** The notifications the draft lets through, as the bell would list them. */
export function NotificationsPreview({ prefs, timeControl, permission }: Props) {
    const toasts = toastsFor(prefs, timeControl, permission);
    return (
        <PreviewCard>
            <div className="flex flex-col gap-2">
                {toasts.map((t) => (
                    <div
                        key={t.title}
                        className="flex items-start gap-[10px] rounded-14 border-1 border-line bg-bg-base p-3"
                    >
                        <span aria-hidden="true" className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-accent" />
                        <span className="flex flex-col">
                            <span className="text-[14px] font-semibold">{t.title}</span>
                            <span className="text-[13px] text-ink-muted">{t.body}</span>
                        </span>
                    </div>
                ))}
            </div>
            {toasts.length === 0 && (
                <span className="text-[14px] text-ink-muted">You won&apos;t be notified about anything.</span>
            )}
        </PreviewCard>
    );
}
