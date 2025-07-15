'use client'
import { TideCloakProvider } from "@tidecloak/nextjs";
import tcConfig from '../tidecloak.json';

export function Provider({ children }) {
    return (
        <TideCloakProvider config={tcConfig}>
            {children}
        </TideCloakProvider>
    );
}