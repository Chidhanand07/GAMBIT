import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

const WARNING_ICON = 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z';

interface ActiveGameWarningProps {
    open: boolean;
    onReturn: () => void;
    onStay: () => void;
}

/** Play Online while a game is still running. */
export function ActiveGameWarning({ open, onReturn, onStay }: ActiveGameWarningProps) {
    return (
        <Dialog
            open={open}
            onClose={onStay}
            role="alertdialog"
            title="Game already in progress"
            description="You have an active match running. Please finish or resign it before starting a new game."
            iconPath={WARNING_ICON}
        >
            <Button size="lg" onClick={onReturn}>
                Return to my game →
            </Button>
            <Button variant="outline" size="lg" onClick={onStay}>
                Stay here
            </Button>
        </Dialog>
    );
}
