import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/components/LoginForm';

// Next fails the production build when a statically rendered page reads useSearchParams()
// outside a Suspense boundary; the form is the part that reads them.
export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginForm />
        </Suspense>
    );
}
