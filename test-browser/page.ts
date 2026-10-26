// Runs in a real browser. Results land in window.__result as a list of named checks.
import { StyleBinding, StyleSchema } from '../src/index.js';
import type { PropertySpec, PropertyValue } from '../src/index.js';

interface Check {
    name: string;
    ok: boolean;
    detail: string;
}

const frames = (n: number) =>
    new Promise<void>((resolve) => {
        const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
    });

function specs(prefix: string, register: boolean): PropertySpec[] {
    return [
        { name: `--${prefix}-len`, syntax: { type: 'length' }, initial: '-1px', inherits: false, register },
        { name: `--${prefix}-lp`, syntax: { type: 'length-percentage' }, initial: '0px', inherits: false, register },
        { name: `--${prefix}-num`, syntax: { type: 'number' }, initial: '0.5', inherits: false, register },
        { name: `--${prefix}-color`, syntax: { type: 'color' }, initial: 'rgb(0, 0, 0)', inherits: true, register },
        { name: `--${prefix}-kw`, syntax: { type: 'keyword', values: ['round', 'bevel', 'scoop', 'notch', 'auto'] }, initial: 'auto', inherits: false, register },
    ];
}

const same = (a: PropertyValue, b: PropertyValue): boolean => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.01;
    if (Array.isArray(a) && Array.isArray(b)) return a.every((x, i) => Math.abs(x - b[i]) < 0.01);
    if (a && b && typeof a === 'object' && typeof b === 'object' && 'px' in a && 'px' in b) {
        return Math.abs(a.px - b.px) < 0.01 && Math.abs(a.percent - b.percent) < 0.01;
    }
    return a === b;
};

let hostId = 0;
function makeHost(): { host: HTMLElement; root: ShadowRoot } {
    const host = document.createElement('div');
    host.id = `h${hostId++}`;
    host.style.fontSize = '10px';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<slot></slot>';
    document.body.appendChild(host);
    return { host, root };
}

async function suite(prefix: string, register: boolean, checks: Check[]) {
    const schema = new StyleSchema(specs(prefix, register));
    const { host, root } = makeHost();
    const binding = new StyleBinding(schema, host, root);
    const label = register ? 'registered' : 'unregistered';
    const expectRead = (title: string, prop: string, text: string | null, expected: PropertyValue, slow?: number) => {
        if (text === null) host.style.removeProperty(`--${prefix}-${prop}`);
        else host.style.setProperty(`--${prefix}-${prop}`, text);
        binding.read();
        const got = binding.get(`--${prefix}-${prop}`);
        const slowOk = slow === undefined || binding.stats.slow === slow;
        checks.push({ name: `${label} read ${title}`, ok: same(got, expected) && slowOk, detail: `${JSON.stringify(got)} slow=${binding.stats.slow}` });
    };
    expectRead('unset length', 'len', null, -1);
    expectRead('length px', 'len', '4px', 4);
    expectRead('length em', 'len', '1.5em', 15);
    expectRead('lp percent', 'lp', '50%', { px: 0, percent: 50 });
    expectRead('lp calc', 'lp', 'calc(4px + 50%)', { px: 4, percent: 50 });
    expectRead('lp calc em', 'lp', 'calc(1em + 2px + 10%)', { px: 12, percent: 10 });
    expectRead('number', 'num', '0.375', 0.375);
    expectRead('number calc', 'num', 'calc(1 / 4)', 0.25);
    expectRead('color hex', 'color', '#003366', [0, 51, 102, 1]);
    expectRead('color named', 'color', 'red', [255, 0, 0, 1]);
    expectRead('color alpha', 'color', 'rgb(0 60 200 / 50%)', [0, 60, 200, 0.5]);
    expectRead('color invalid', 'color', 'bogus', [0, 0, 0, 1]);
    expectRead('keyword', 'kw', 'scoop', 'scoop');
    expectRead('keyword invalid', 'kw', 'squircle', 'auto');
    expectRead('keyword unset', 'kw', null, 'auto');

    // Detection.
    let changes = 0;
    const child = document.createElement('span');
    host.appendChild(child);
    binding.observe(() => changes++);
    await frames(3);
    const leaked = getComputedStyle(child).getPropertyValue('--ax-typed-om-m0').trim();
    checks.push({ name: `${label} mirrors stay out of slotted content`, ok: leaked === '', detail: JSON.stringify(leaked) });
    const expectChange = async (title: string, act: () => void, min: number, max = Infinity) => {
        changes = 0;
        act();
        await frames(3);
        checks.push({ name: `${label} detect ${title}`, ok: changes >= min && changes <= max, detail: `changes=${changes}` });
    };
    await expectChange('length', () => host.style.setProperty(`--${prefix}-len`, '7px'), 1);
    await expectChange('percent', () => host.style.setProperty(`--${prefix}-lp`, '20%'), 1);
    await expectChange('number', () => host.style.setProperty(`--${prefix}-num`, '0.9'), 1);
    await expectChange('color', () => host.style.setProperty(`--${prefix}-color`, 'rgb(9, 9, 9)'), 1);
    await expectChange('keyword', () => host.style.setProperty(`--${prefix}-kw`, 'bevel'), 1);
    await expectChange('keyword back to initial', () => host.style.setProperty(`--${prefix}-kw`, 'auto'), 1);
    await expectChange('ancestor token', () => {
        document.body.style.setProperty(`--${prefix}-tok`, '3px');
        host.style.setProperty(`--${prefix}-len`, `var(--${prefix}-tok)`);
    }, 1);
    await expectChange('ancestor token again', () => document.body.style.setProperty(`--${prefix}-tok`, '5px'), 1);
    await expectChange('same value', () => host.style.setProperty(`--${prefix}-num`, '0.9'), 0, 0);
    await expectChange('idle', () => {}, 0, 0);
    binding.unobserve();
    await expectChange('after unobserve', () => host.style.setProperty(`--${prefix}-len`, '11px'), 0, 0);
    checks.push({ name: `${label} detector removed`, ok: root.querySelector('style') === null, detail: '' });
}

async function skipSuite(checks: Check[]) {
    const schema = new StyleSchema([
        { name: '--s-kind', syntax: { type: 'keyword', values: ['flat', 'arc'] }, initial: 'flat', inherits: false },
        { name: '--s-depth', syntax: { type: 'length' }, initial: '0px', inherits: false, skipWhen: { property: '--s-kind', values: ['flat'] } },
    ]);
    const { host, root } = makeHost();
    const binding = new StyleBinding(schema, host, root);
    host.style.setProperty('--s-depth', '5px');
    binding.read();
    checks.push({ name: 'skipWhen keeps the initial value', ok: binding.get('--s-depth') === 0, detail: String(binding.get('--s-depth')) });
    host.style.setProperty('--s-kind', 'arc');
    binding.read();
    checks.push({ name: 'skipWhen reads once the gate opens', ok: binding.get('--s-depth') === 5, detail: String(binding.get('--s-depth')) });
}

async function keywordUnionSuite(checks: Check[]) {
    // A numeric spec that may hold `auto` must not poison the numeric hash: the registered
    // mirror rejects the keyword and falls back to zero, so the hash declaration stays legal
    // and numeric changes (including value<->auto jumps) still fire onChange.
    const schema = new StyleSchema([
        { name: '--ku-len', syntax: { type: 'length', keywords: ['auto'] }, initial: 'auto', inherits: false, register: true },
        { name: '--ku-num', syntax: { type: 'number' }, initial: '0', inherits: false, register: true },
    ]);
    const { host, root } = makeHost();
    const binding = new StyleBinding(schema, host, root);
    let changes = 0;
    binding.observe(() => changes++);
    await frames(3);

    const detector = root.querySelector('.ax-typed-om-d0') as HTMLElement;
    const origin = getComputedStyle(detector).transformOrigin;
    checks.push({ name: 'keyword-union hash stays legal', ok: origin !== '0.5px 0.5px', detail: origin });

    const expectChange = async (title: string, act: () => void) => {
        changes = 0;
        act();
        await frames(3);
        checks.push({ name: `keyword-union detect ${title}`, ok: changes >= 1, detail: `changes=${changes}` });
    };
    await expectChange('numeric', () => host.style.setProperty('--ku-len', '18px'));
    await expectChange('value to auto', () => host.style.setProperty('--ku-len', 'auto'));
    await expectChange('auto to value', () => host.style.setProperty('--ku-len', '9px'));
    binding.unobserve();
}

async function timeSuite(register: boolean, checks: Check[]) {
    const prefix = register ? 'tr' : 'tu';
    const name = `--${prefix}-time`;
    const label = register ? 'registered' : 'unregistered';
    const schema = new StyleSchema([{ name, syntax: { type: 'time' }, initial: '50ms', inherits: true, register }]);
    const { host, root } = makeHost();
    const binding = new StyleBinding(schema, host, root);
    const expectRead = (title: string, text: string | null, expected: number) => {
        if (text === null) host.style.removeProperty(name);
        else host.style.setProperty(name, text);
        binding.read();
        const got = binding.get(name);
        checks.push({ name: `${label} read time ${title}`, ok: same(got, expected), detail: `${JSON.stringify(got)} slow=${binding.stats.slow}` });
    };
    expectRead('unset', null, 50);
    expectRead('seconds', '0.2s', 200);
    expectRead('milliseconds', '150ms', 150);
    expectRead('zero', '0s', 0);
    expectRead('calc', 'calc(100ms + 0.1s)', 200);
    expectRead('invalid', 'bogus', 50);
    expectRead('bare number', '200', 50);

    // Observed through the registered time mirror, where registration exists.
    let changes = 0;
    binding.observe(() => changes++);
    await frames(3);
    changes = 0;
    host.style.setProperty(name, '300ms');
    await frames(3);
    const observable = typeof CSS !== 'undefined' && 'registerProperty' in CSS;
    checks.push({ name: `${label} detect time`, ok: observable ? changes >= 1 : true, detail: `changes=${changes}` });
    changes = 0;
    host.style.setProperty(name, '0.3s');
    await frames(3);
    checks.push({ name: `${label} detect same time`, ok: changes === 0, detail: `changes=${changes}` });
    binding.unobserve();
}

async function run() {
    const checks: Check[] = [];
    await skipSuite(checks);
    await suite('t', false, checks);
    await suite('r', true, checks);
    await keywordUnionSuite(checks);
    await timeSuite(false, checks);
    await timeSuite(true, checks);
    return { userAgent: navigator.userAgent, canRegister: typeof CSS !== 'undefined' && 'registerProperty' in CSS, checks };
}

declare global {
    interface Window {
        __result?: unknown;
    }
}
run().then(
    (r) => (window.__result = r),
    (e) => (window.__result = { error: String((e && e.stack) || e) })
);
