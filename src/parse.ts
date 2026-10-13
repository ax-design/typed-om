import type { LengthPercentage, Rgba } from './schema.js';

// Fast-path parsers for the computed value strings engines produce. They return null when the
// text is not in one of the expected forms; the caller then resolves it through a probe.

const NUMBER = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?';
const PLAIN_NUMBER = new RegExp(`^${NUMBER}$`);
const LENGTH = new RegExp(`^(${NUMBER})(px|%)$`);
// Canonical calc() of a registered <length-percentage>, e.g. "calc(50% + 4px)" or
// "calc(50% - 4px)". Every engine tested serializes percentage first.
const CALC = new RegExp(`^calc\\(\\s*(${NUMBER})%\\s*([-+])\\s*(${NUMBER})px\\s*\\)$`);

export function parseNumber(text: string): number | null {
    return PLAIN_NUMBER.test(text) ? parseFloat(text) : null;
}

export function parseLengthPercentage(text: string): LengthPercentage | null {
    if (text === '0') return { px: 0, percent: 0 };
    const m = LENGTH.exec(text);
    if (m) {
        const v = parseFloat(m[1]);
        return m[2] === 'px' ? { px: v, percent: 0 } : { px: 0, percent: v };
    }
    const c = CALC.exec(text);
    if (c) {
        const px = parseFloat(c[3]);
        return { percent: parseFloat(c[1]), px: c[2] === '-' ? -px : px };
    }
    return null;
}

export function parseLength(text: string): number | null {
    if (text === '0') return 0;
    const m = LENGTH.exec(text);
    return m && m[2] === 'px' ? parseFloat(m[1]) : null;
}

export function parseKeyword(text: string, values: string[]): string | null {
    return values.indexOf(text) >= 0 ? text : null;
}

const RGB = new RegExp(`^rgba?\\(\\s*(${NUMBER})[,\\s]+(${NUMBER})[,\\s]+(${NUMBER})(?:\\s*[,/]\\s*(${NUMBER})(%?))?\\s*\\)$`);
const HEX = /^#([0-9a-fA-F]{3,8})$/;

// rgb()/rgba() as engines serialize computed colors, plus hex as authors write it on engines
// that return unregistered values verbatim. Named colors and other spaces go to the probe.
export function parseColor(text: string): Rgba | null {
    const m = RGB.exec(text);
    if (m) {
        let alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (m[5] === '%') alpha /= 100;
        return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), alpha];
    }
    const h = HEX.exec(text);
    if (!h) return null;
    let hex = h[1];
    if (hex.length === 3 || hex.length === 4) hex = hex.replace(/./g, (c) => c + c);
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
}
