import '@testing-library/jest-dom';

// Fixed, fake Supabase settings so code that reads them at import time works.
// The project ref ("testref") determines the auth cookie name: sb-testref-auth-token.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://testref.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.GAMBIT_ENGINE_URL = 'http://engine.test';
// Shared secret the server-side engine client sends as X-Engine-Key (never NEXT_PUBLIC_).
process.env.ENGINE_SHARED_SECRET = 'test-engine-secret';
