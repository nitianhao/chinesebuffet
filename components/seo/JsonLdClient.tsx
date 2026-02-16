'use client';

import { useEffect, useRef } from 'react';

interface JsonLdClientProps {
    id: string;
    dataBase64: string;
}

export default function JsonLdClient({ id, dataBase64 }: JsonLdClientProps) {
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        // Check if script already exists
        if (document.getElementById(id)) return;

        try {
            const jsonString = atob(dataBase64);
            const script = document.createElement('script');
            script.id = id;
            script.type = 'application/ld+json';
            script.text = jsonString;
            document.head.appendChild(script);
        } catch (e) {
            console.error('Failed to inject JSON-LD', e);
        }

        // Cleanup on unmount
        return () => {
            const script = document.getElementById(id);
            if (script) {
                script.remove();
            }
        };
    }, [id, dataBase64]);

    return null;
}
