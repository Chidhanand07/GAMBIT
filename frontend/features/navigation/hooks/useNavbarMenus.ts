'use client';

import { useEffect, useRef, useState } from 'react';

/** Open state of the mobile menu, avatar dropdown and bell panel; a mousedown outside closes the latter two. */
export function useNavbarMenus() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const notifRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false);
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) setIsNotifOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return {
        isMenuOpen,
        setIsMenuOpen,
        isDropdownOpen,
        setIsDropdownOpen,
        isNotifOpen,
        setIsNotifOpen,
        dropdownRef,
        notifRef,
    };
}
