/**
 * logo block — port of blocks/logo/logo.njk.
 * Emits `<span class=logo__logo></span>` (the logo is rendered via CSS).
 */
import type { BemNode } from 'nuckty';

/** The logo element node. */
export function logoNode(): BemNode {
    return { tag: 'span', block: 'logo', elem: 'logo' };
}

export function register(_env: unknown): void {
    // No xjst templates: the logo is a plain element built by the header layout.
}
