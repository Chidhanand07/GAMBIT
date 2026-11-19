import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { DeleteAccountState } from '../hooks/useDeleteAccount';
import { INPUT } from './styles';

/** Lucide "trash-2". */
const TRASH = 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6';
const FIELD = 'flex flex-col gap-2 text-left';

function DeleteDialog({ del, username }: { del: DeleteAccountState; username: string }) {
    return (
        <Dialog
            open={del.open}
            onClose={del.close}
            role="alertdialog"
            tone="danger"
            iconPath={TRASH}
            title="Delete account"
            description="This permanently deletes your profile, ratings, friends and notifications. Your finished games stay in your opponents' history without your name. This cannot be undone."
        >
            <label className={FIELD}>
                <span className="font-semibold">Type your username to confirm</span>
                <input
                    type="text"
                    autoComplete="off"
                    placeholder={username}
                    value={del.typed}
                    onChange={(e) => del.setTyped(e.target.value)}
                    className={`${INPUT} min-h-[48px]`}
                />
            </label>
            {del.needsPassword && (
                <label className={FIELD}>
                    <span className="font-semibold">Password</span>
                    <input
                        type="password"
                        autoComplete="current-password"
                        value={del.password}
                        onChange={(e) => del.setPassword(e.target.value)}
                        className={`${INPUT} min-h-[48px]`}
                    />
                </label>
            )}
            {del.error && (
                <span role="alert" className="text-[14px] font-semibold text-danger">
                    {del.error}
                </span>
            )}
            <Button variant="danger-solid" size="lg" onClick={del.submit} disabled={!del.canSubmit}>
                {del.busy ? 'Deleting…' : 'Delete my account'}
            </Button>
            <Button variant="ghost" size="lg" onClick={del.close}>
                Cancel
            </Button>
        </Dialog>
    );
}

/** The red "Delete account" box of Settings.dc.html's Account card, and its confirmation. */
export function DeleteAccountZone({ del, username }: { del: DeleteAccountState; username: string }) {
    return (
        <div className="mx-7 mb-7 mt-[18px] flex flex-wrap items-center gap-4 rounded-16 border-1 border-danger-zone-line bg-danger-zone-bg px-5 py-[18px]">
            <span className="flex flex-[1_1_220px] flex-col gap-[2px]">
                <span className="font-semibold text-danger">Delete account</span>
                <span className="text-[14px] text-ink-muted">Permanently removes your profile, games and ratings.</span>
            </span>
            <button
                type="button"
                onClick={del.start}
                className="min-h-[44px] rounded-pill border-1.5 border-danger bg-transparent px-5 text-[15px] font-semibold text-danger"
            >
                Delete account
            </button>
            <DeleteDialog del={del} username={username} />
        </div>
    );
}
