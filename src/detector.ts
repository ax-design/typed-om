import type { PropertySpec } from './schema.js';

// Change detection without @property, built from events that exist since about 2015. Each
// host gets one detector element (more only for schemas with many colors), because every extra
// element inherits all custom properties and costs style recalculation on every change:
//  - numeric values: folded into up to four weighted calc() hashes, placed in the x and y of
//    transform-origin and perspective-origin (neither triggers layout), 1ms transitions;
//  - colors: one real color property each, 1ms transitions;
//  - keywords: an animation-name list with shadow-scoped empty @keyframes per allowed value.
// Any transition or animation start marks the host as changed.

const HASH_SLOTS = 4;
const COLOR_PROPERTIES = [
    'color',
    'background-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'outline-color',
    'column-rule-color',
];
const KEYFRAMES_UNSET = 'ax-typed-om-unset';
// Class prefix inside the caller's shadow root.
const PREFIX = 'ax-typed-om';

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

// Weights far from simple ratios, so that unrelated changes do not cancel out.
function weight(i: number): string {
    return (1 + i * 0.0173).toFixed(4);
}

export interface DetectorTemplate {
    css: string;
    elementCount: number;
}

// `registered` lists the properties registered by name. A registered non-inherited property
// does not reach the detector element inside the shadow root, so the host mirrors it into an
// unregistered (inherited) property. The slot resets the mirrors so author content does not
// inherit them.
export function buildDetector(schema: PropertySpec[], registered: Set<string> = new Set()): DetectorTemplate {
    const mirrors: string[] = [];
    const source = (spec: PropertySpec) => {
        if (!registered.has(spec.name) || spec.inherits) return spec.name;
        const mirror = `--${PREFIX}-m${mirrors.length}`;
        mirrors.push(`${mirror}: var(${spec.name});`);
        return mirror;
    };

    // Declarations and transitions per detector element.
    const elements: { decls: string[]; transitions: string[] }[] = [{ decls: [], transitions: [] }];

    const numeric = schema.filter((s) => s.syntax.type === 'length' || s.syntax.type === 'length-percentage' || s.syntax.type === 'number');
    if (numeric.length) {
        // An invalid value in an unregistered property invalidates its whole group, so use as
        // many groups as there are slots.
        const groups = chunk(numeric, Math.ceil(numeric.length / HASH_SLOTS));
        const hashes = groups.map((group) =>
            `calc(${group
                .map((spec, i) => {
                    const v = `var(${source(spec)}, ${spec.initial})`;
                    return spec.syntax.type === 'number' ? `${v} * ${weight(i)}px` : `${v} * ${weight(i)}`;
                })
                .join(' + ')})`
        );
        const pair = (a: string | undefined, b: string | undefined) => `${a || '0px'} ${b || '0px'}`;
        elements[0].decls.push(`transform-origin: ${pair(hashes[0], hashes[1])};`);
        elements[0].transitions.push('transform-origin 1ms');
        if (hashes.length > 2) {
            elements[0].decls.push(`perspective-origin: ${pair(hashes[2], hashes[3])};`);
            elements[0].transitions.push('perspective-origin 1ms');
        }
    }

    const colors = schema.filter((s) => s.syntax.type === 'color');
    chunk(colors, COLOR_PROPERTIES.length).forEach((group, index) => {
        if (!elements[index]) elements[index] = { decls: [], transitions: [] };
        const e = elements[index];
        e.decls.push('border-style: solid; border-width: 0; outline-style: solid; outline-width: 0; column-rule-style: solid; column-rule-width: 0;');
        group.forEach((spec, i) => {
            e.decls.push(`${COLOR_PROPERTIES[i]}: var(${source(spec)}, ${spec.initial});`);
            e.transitions.push(`${COLOR_PROPERTIES[i]} 1ms`);
        });
    });

    const rules: string[] = [];
    const keywords = schema.filter((s) => s.syntax.type === 'keyword');
    if (keywords.length) {
        const names = new Set<string>();
        for (const spec of keywords) if (spec.syntax.type === 'keyword') for (const v of spec.syntax.values) names.add(v);
        names.add(KEYFRAMES_UNSET);
        // `none` cannot name keyframes; values switching to it are not observed (see schema.ts).
        names.delete('none');
        names.forEach((n) => rules.push(`@keyframes ${n} {}`));
        const list = keywords.map((spec) => `var(${source(spec)}, ${KEYFRAMES_UNSET})`);
        elements[0].decls.push(`animation-name: ${list.join(', ')}; animation-duration: 1ms;`);
    }

    elements.forEach((e, i) => {
        const transition = e.transitions.length ? ` transition: ${e.transitions.join(', ')};` : '';
        rules.push(`.${PREFIX}-d${i} { ${e.decls.join(' ')}${transition} }`);
    });
    if (mirrors.length) {
        rules.push(`:host { ${mirrors.join(' ')} }`);
        rules.push(`slot { ${mirrors.map((m) => `${m.slice(0, m.indexOf(':'))}: initial;`).join(' ')} }`);
    }
    rules.push(
        `.${PREFIX}-c { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: hidden; visibility: hidden; pointer-events: none; contain: strict; }`,
        `.${PREFIX}-c > div { position: absolute; left: 0; top: 0; width: 1px; height: 1px; }`
    );
    return { css: rules.join('\n'), elementCount: elements.length };
}

export interface DetectorHandle {
    detach(): void;
}

// Inserts the detector into a shadow root. `onChange` runs once right after attaching (the
// keyword animations start) and after every later change; callers coalesce it per frame.
export function attachDetector(root: ShadowRoot, template: DetectorTemplate, onChange: () => void): DetectorHandle {
    const style = document.createElement('style');
    style.textContent = template.css;
    const container = document.createElement('div');
    container.className = `${PREFIX}-c`;
    container.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < template.elementCount; i++) {
        const d = document.createElement('div');
        d.className = `${PREFIX}-d${i}`;
        container.appendChild(d);
    }
    const handler = (event: Event) => {
        if (event.target && container.contains(event.target as Node)) onChange();
    };
    root.appendChild(style);
    root.appendChild(container);
    // transitionrun is Safari 13.1+; transitionend covers older engines a frame later.
    root.addEventListener('transitionrun', handler);
    root.addEventListener('transitionend', handler);
    root.addEventListener('animationstart', handler);
    return {
        detach() {
            root.removeEventListener('transitionrun', handler);
            root.removeEventListener('transitionend', handler);
            root.removeEventListener('animationstart', handler);
            if (style.parentNode) style.parentNode.removeChild(style);
            if (container.parentNode) container.parentNode.removeChild(container);
        },
    };
}
