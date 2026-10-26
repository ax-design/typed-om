import { parseColor, parseTime } from './parse.js';
import type { LengthPercentage, Rgba } from './schema.js';

// Slow path for values the fast parsers cannot read (unregistered `calc(1em + 2px)`, named
// colors, other units). One probe per document is moved into the shadow root that needs it,
// so it inherits the host's custom properties, read, and removed again.
//
// Lengths use two containers 0px and 6400px wide: margin-left percentages resolve against the
// container width, so px = v0 and percent = (v6400 - v0) / 64. The probe must be rendered
// (visibility: hidden), otherwise getComputedStyle returns the computed `%` instead of px.

const WIDE = 6400;
const COLOR_SENTINEL = 'rgba(1, 2, 3, 0.5)';

interface Probe {
    root: HTMLElement;
    narrow: HTMLElement;
    wide: HTMLElement;
}

let probe: Probe | null = null;

function createProbe(): Probe {
    const root = document.createElement('div');
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText =
        'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;';
    root.style.color = COLOR_SENTINEL;
    const container = (width: number) => {
        const c = document.createElement('div');
        c.style.cssText = `position:absolute;left:0;top:0;height:0;width:${width}px;`;
        const target = document.createElement('div');
        target.style.cssText = 'height:0;';
        c.appendChild(target);
        root.appendChild(c);
        return target;
    };
    return { root, narrow: container(0), wide: container(WIDE) };
}

function withProbe<T>(parent: Node, read: (p: Probe) => T): T {
    if (!probe) probe = createProbe();
    parent.appendChild(probe.root);
    try {
        return read(probe);
    } finally {
        parent.removeChild(probe.root);
        probe.narrow.style.marginLeft = '';
        probe.wide.style.marginLeft = '';
        probe.narrow.style.color = '';
        probe.narrow.style.transitionDelay = '';
    }
}

export function probeLengthPercentage(parent: Node, name: string): LengthPercentage {
    return withProbe(parent, (p) => {
        p.narrow.style.marginLeft = `var(${name})`;
        p.wide.style.marginLeft = `var(${name})`;
        const v0 = parseFloat(getComputedStyle(p.narrow).marginLeft) || 0;
        const v1 = parseFloat(getComputedStyle(p.wide).marginLeft) || 0;
        return { px: v0, percent: ((v1 - v0) / WIDE) * 100 };
    });
}

export function probeNumber(parent: Node, name: string): number {
    return withProbe(parent, (p) => {
        p.narrow.style.marginLeft = `calc(var(${name}) * 1px)`;
        return parseFloat(getComputedStyle(p.narrow).marginLeft) || 0;
    });
}

// Returns null when the value is not a valid color (the probe then inherits the sentinel).
export function probeColor(parent: Node, name: string): Rgba | null {
    return withProbe(parent, (p) => {
        p.narrow.style.color = `var(${name})`;
        const text = getComputedStyle(p.narrow).color;
        const sentinel = getComputedStyle(p.root).color;
        return text === sentinel ? null : parseColor(text);
    });
}

// A time in ms, or null when the value is not a valid time. transition-delay is not inherited,
// so an invalid value would read as its initial 0s, the same as a real 0s. The second entry of
// the list tells them apart: an invalid var() invalidates the whole declaration, which leaves
// one entry instead of two. Negative delays are valid, so negative times read back too.
export function probeTime(parent: Node, name: string): number | null {
    return withProbe(parent, (p) => {
        p.narrow.style.transitionDelay = `var(${name}), 0s`;
        const list = getComputedStyle(p.narrow).transitionDelay.split(',');
        return list.length === 2 ? parseTime(list[0].trim()) : null;
    });
}
