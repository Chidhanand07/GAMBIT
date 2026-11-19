// Who is looking at a public page, resolved on the server from the verified session (NX-07,
// NX-10). A minimal DTO for Client Components (NX-04): only what the header and the landing need.

/** The signed-in viewer's own profile fields the header shows. */
export interface ViewerProfile {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    rating_rapid: number | null;
}

/**
 * `guest`: no verified session. `signed-in`: verified, with the profile. `unknown`: the session
 * verified but the profile could not be read; the client resolves it (ProfileProvider).
 */
export type Viewer = { status: 'guest' } | { status: 'signed-in'; profile: ViewerProfile } | { status: 'unknown' };
