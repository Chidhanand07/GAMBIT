/** Round avatar photo filling its container (plain <img>, as the page always rendered it). */
export function AvatarImg({ src }: { src: string }) {
    return <img src={src} alt="" className="w-full h-full object-cover" />;
}
