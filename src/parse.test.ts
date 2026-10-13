import { describe, expect, test } from 'bun:test';
import { parseColor, parseKeyword, parseLength, parseLengthPercentage, parseNumber } from './parse.js';
import { validateSchema } from './schema.js';

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
        expect(() => validateSchema([{ name: '--k', syntax: { type: 'keyword', values: ['flat', 'none'] }, initial: 'flat', inherits: false }])).toThrow();
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
