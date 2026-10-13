import type { PropertySpec } from './schema.js';

// Change detection without @property, built from events that exist since about 2015:
//  - numeric values: groups of properties folded into one weighted calc() in transform-origin
//    (never triggers layout) with a 1ms transition;
//  - colors: one real color property each, with a 1ms transition;
//  - keywords: an animation-name list with shadow-scoped empty @keyframes per allowed value.
// Any transition or animation start marks the host as changed.

const NUMERIC_GROUP = 8;
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
// does not reach the detector elements inside the shadow root, so the host mirrors it into an
// unregistered (inherited) property. The slot resets the mirrors so author content does not
// inherit them.
export function buildDetector(schema: PropertySpec[], registered: Set<string> = new Set()): DetectorTemplate {
    const rules: string[] = [];
    let element = 0;
    const mirrors: string[] = [];
    const source = (spec: PropertySpec) => {
        if (!registered.has(spec.name) || spec.inherits) return spec.name;
        const mirror = `--${PREFIX}-m${mirrors.length}`;
        mirrors.push(`${mirror}: var(${spec.name});`);
        return mirror;
    };

    const numeric = schema.filter((s) => s.syntax.type === 'length' || s.syntax.type === 'length-percentage' || s.syntax.type === 'number');
    for (const group of chunk(numeric, NUMERIC_GROUP)) {
        const terms = group.map((spec, i) => {
            const v = `var(${source(spec)}, ${spec.initial})`;
            return spec.syntax.type === 'number' ? `${v} * ${weight(i)}px` : `${v} * ${weight(i)}`;
        });
        rules.push(`.${PREFIX}-d${element} { transform-origin: calc(${terms.join(' + ')}) 0; transition: transform-origin 1ms; }`);
        element++;
    }

    const colors = schema.filter((s) => s.syntax.type === 'color');
    for (const group of chunk(colors, COLOR_PROPERTIES.length)) {
        const decls = group.map((spec, i) => `${COLOR_PROPERTIES[i]}: var(${source(spec)}, ${spec.initial});`);
        const transitions = group.map((_, i) => `${COLOR_PROPERTIES[i]} 1ms`);
        rules.push(`.${PREFIX}-d${element} { border-style: solid; border-width: 0; outline-style: solid; outline-width: 0; column-rule-style: solid; column-rule-width: 0; ${decls.join(' ')} transition: ${transitions.join(', ')}; }`);
        element++;
    }

    const keywords = schema.filter((s) => s.syntax.type === 'keyword');
    if (keywords.length) {
        const names = new Set<string>();
        for (const spec of keywords) if (spec.syntax.type === 'keyword') for (const v of spec.syntax.values) names.add(v);
        names.add(KEYFRAMES_UNSET);
        names.forEach((n) => rules.push(`@keyframes ${n} {}`));
        const list = keywords.map((spec) => `var(${source(spec)}, ${KEYFRAMES_UNSET})`);
        rules.push(`.${PREFIX}-d${element} { animation-name: ${list.join(', ')}; animation-duration: 1ms; }`);
        element++;
    }

    if (mirrors.length) {
        rules.push(`:host { ${mirrors.join(' ')} }`);
        rules.push(`slot { ${mirrors.map((m) => `${m.slice(0, m.indexOf(':'))}: initial;`).join(' ')} }`);
    }
    rules.push(
        `.${PREFIX}-c { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: hidden; visibility: hidden; pointer-events: none; contain: strict; }`,
        `.${PREFIX}-c > div { position: absolute; left: 0; top: 0; width: 1px; height: 1px; }`
    );
    return { css: rules.join('\n'), elementCount: element };
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
