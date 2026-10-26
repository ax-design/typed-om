import { describe, expect, test } from 'bun:test';
import { parseColor, parseKeyword, parseLength, parseLengthPercentage, parseNumber, parseTime } from './parse.js';
import { cssSyntax, validateSchema } from './schema.js';
import { StyleReader } from './reader.js';

describe('parseLengthPercentage', () => {
    test('canonical forms', () => {
        expect(parseLengthPercentage('10px')).toEqual({ px: 10, percent: 0 });
        expect(parseLengthPercentage('-3.5px')).toEqual({ px: -3.5, percent: 0 });
        expect(parseLengthPercentage('50%')).toEqual({ px: 0, percent: 50 });
        expect(parseLengthPercentage('33.333332%')).toEqual({ px: 0, percent: 33.333332 });
        expect(parseLengthPercentage('0')).toEqual({ px: 0, percent: 0 });
        expect(parseLengthPercentage('calc(50% + 4px)')).toEqual({ px: 4, percent: 50 });
        expect(parseLengthPercentage('calc(10% - 2.5px)')).toEqual({ px: -2.5, percent: 10 });
        expect(parseLengthPercentage('1e2px')).toEqual({ px: 100, percent: 0 });
    });

    test('everything else goes to the probe', () => {
        for (const text of ['2em', 'calc(1em + 2px)', 'calc(4px + 50%)', 'auto', '10', 'var(--x)', '']) {
            expect(parseLengthPercentage(text)).toBeNull();
        }
    });
});

describe('parseLength', () => {
    test('px only', () => {
        expect(parseLength('-1px')).toBe(-1);
        expect(parseLength('0')).toBe(0);
        expect(parseLength('50%')).toBeNull();
        expect(parseLength('1rem')).toBeNull();
    });
});

describe('parseNumber', () => {
    test('plain numbers', () => {
        expect(parseNumber('0.375')).toBe(0.375);
        expect(parseNumber('-2.5')).toBe(-2.5);
        expect(parseNumber('.5')).toBe(0.5);
        expect(parseNumber('1px')).toBeNull();
        expect(parseNumber('calc(1 / 2)')).toBeNull();
    });
});

describe('parseTime', () => {
    test('seconds and milliseconds, in ms', () => {
        expect(parseTime('0.05s')).toBe(50);
        expect(parseTime('200ms')).toBe(200);
        expect(parseTime('3s')).toBe(3000);
        expect(parseTime('0s')).toBe(0);
        expect(parseTime('-1.5s')).toBe(-1500);
        expect(parseTime('.5s')).toBe(500);
    });

    test('everything else goes to the probe', () => {
        for (const text of ['0', '200', 'calc(1s + 2ms)', '1min', '2px', 'auto', '']) {
            expect(parseTime(text)).toBeNull();
        }
    });
});

describe('parseColor', () => {
    test('computed forms', () => {
        expect(parseColor('rgb(0, 60, 200)')).toEqual([0, 60, 200, 1]);
        expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3, 0.5]);
        expect(parseColor('rgb(1 2 3 / 50%)')).toEqual([1, 2, 3, 0.5]);
    });

    test('hex as written', () => {
        expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
        expect(parseColor('#00336680')).toEqual([0, 51, 102, 128 / 255]);
    });

    test('names and other spaces go to the probe', () => {
        expect(parseColor('red')).toBeNull();
        expect(parseColor('oklch(0.6 0.1 200)')).toBeNull();
    });
});

describe('keywords', () => {
    test('only allowed values', () => {
        expect(parseKeyword('scoop', ['round', 'scoop'])).toBe('scoop');
        expect(parseKeyword('squircle', ['round', 'scoop'])).toBeNull();
    });

    test('schema rejects keywords the detector cannot observe', () => {
        expect(() => validateSchema([{ name: '--k', syntax: { type: 'keyword', values: ['flat', 'inherit'] }, initial: 'flat', inherits: false }])).toThrow();
        expect(() => validateSchema([{ name: '--k', syntax: { type: 'keyword', values: ['flat', 'arc'] }, initial: 'flat', inherits: false }])).not.toThrow();
        expect(() => validateSchema([{ name: 'k', syntax: { type: 'number' }, initial: '0', inherits: false }])).toThrow();
    });
});

describe('skipWhen', () => {
    test('gate must come first', () => {
        expect(() =>
            validateSchema([
                { name: '--depth', syntax: { type: 'length' }, initial: '0px', inherits: false, skipWhen: { property: '--kind', values: ['flat'] } },
                { name: '--kind', syntax: { type: 'keyword', values: ['flat', 'arc'] }, initial: 'flat', inherits: false },
            ])
        ).toThrow();
    });
});

describe('numeric keywords (union)', () => {
    test('cssSyntax emits the union', () => {
        expect(cssSyntax({ type: 'length', keywords: ['auto'] })).toBe('<length> | auto');
        expect(cssSyntax({ type: 'length-percentage', keywords: ['auto', 'min-content'] })).toBe('<length-percentage> | auto | min-content');
        expect(cssSyntax({ type: 'number', keywords: ['none'] })).toBe('<number> | none');
        expect(cssSyntax({ type: 'length' })).toBe('<length>');
        expect(cssSyntax({ type: 'number', keywords: [] })).toBe('<number>');
        expect(cssSyntax({ type: 'time' })).toBe('<time>');
    });

    test('validateSchema rejects reserved and non-identifier keywords', () => {
        expect(() => validateSchema([{ name: '--w', syntax: { type: 'length', keywords: ['auto', 'inherit'] }, initial: '0px', inherits: false }])).toThrow();
        expect(() => validateSchema([{ name: '--w', syntax: { type: 'number', keywords: ['0'] }, initial: '0', inherits: false }])).toThrow();
        expect(() => validateSchema([{ name: '--w', syntax: { type: 'length', keywords: ['auto'] }, initial: '0px', inherits: false }])).not.toThrow();
        expect(() => validateSchema([{ name: '--w', syntax: { type: 'length-percentage', keywords: ['auto'] }, initial: '0px', inherits: false }])).not.toThrow();
    });

    test('reader returns a keyword verbatim and numbers still parse', () => {
        const schema = [
            { name: '--size', syntax: { type: 'length', keywords: ['auto'] }, initial: '0px', inherits: false },
            { name: '--gap', syntax: { type: 'length-percentage', keywords: ['auto'] }, initial: '0px', inherits: false },
            { name: '--opacity', syntax: { type: 'number' }, initial: '0', inherits: false },
        ];
        const reader = new StyleReader(schema);
        const g = globalThis as { getComputedStyle?: unknown };
        const original = g.getComputedStyle;
        g.getComputedStyle = () => ({
            getPropertyValue: (name: string) => (name === '--size' ? 'auto' : name === '--gap' ? '12px' : name === '--opacity' ? '0.5' : ''),
        });
        try {
            const out = reader.read({} as Element, {} as Node);
            expect(out[0]).toBe('auto');
            expect(out[1]).toEqual({ px: 12, percent: 0 });
            expect(out[2]).toBe(0.5);
        } finally {
            g.getComputedStyle = original;
        }
    });
});

describe('time', () => {
    test('reader returns ms and keeps the initial for an unknown value', () => {
        const reader = new StyleReader([
            { name: '--wait', syntax: { type: 'time' }, initial: '50ms', inherits: true },
            { name: '--pause', syntax: { type: 'time' }, initial: '1s', inherits: true },
        ]);
        const g = globalThis as { getComputedStyle?: unknown };
        const original = g.getComputedStyle;
        g.getComputedStyle = () => ({ getPropertyValue: (name: string) => (name === '--wait' ? '0.2s' : '') });
        try {
            const out = reader.read({} as Element, {} as Node);
            expect(out[0]).toBe(200);
            expect(out[1]).toBe(1000);
        } finally {
            g.getComputedStyle = original;
        }
    });
});
