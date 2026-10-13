import { parseColor, parseKeyword, parseLength, parseLengthPercentage, parseNumber } from './parse.js';
import { probeColor, probeLengthPercentage, probeNumber } from './probe.js';
import type { PropertySpec, PropertyValue } from './schema.js';

export interface ReadStats {
    // Properties that needed the probe in the last read.
    slow: number;
}

// Reads the computed values of a schema from one element. Fast path: literal parsing of
// getComputedStyle strings. Slow path: the shared probe, inserted into `probeParent`, which
// must be inside the element's shadow root (or otherwise inherit its custom properties).
export class StyleReader {
    readonly schema: PropertySpec[];
    private initials: PropertyValue[];
    // Index of the gate property and its skip values, per property.
    private gates: ({ index: number; values: string[] } | null)[];

    constructor(schema: PropertySpec[]) {
        this.schema = schema;
        this.initials = schema.map((spec) => parseFast(spec, spec.initial));
        const index: { [name: string]: number } = {};
        schema.forEach((spec, i) => (index[spec.name] = i));
        this.gates = schema.map((spec) => (spec.skipWhen ? { index: index[spec.skipWhen.property], values: spec.skipWhen.values } : null));
    }

    read(element: Element, probeParent: Node, out: PropertyValue[] = [], stats?: ReadStats): PropertyValue[] {
        const style = getComputedStyle(element);
        let slow = 0;
        for (let i = 0; i < this.schema.length; i++) {
            const spec = this.schema[i];
            const gate = this.gates[i];
            if (gate && gate.values.indexOf(out[gate.index] as string) >= 0) {
                out[i] = this.initials[i];
                continue;
            }
            const text = style.getPropertyValue(spec.name).trim();
            if (text === '') {
                out[i] = this.initials[i];
                continue;
            }
            let value = parseFast(spec, text);
            if (value === null) {
                value = parseSlow(spec, probeParent);
                slow++;
            }
            out[i] = value === null ? this.initials[i] : value;
        }
        if (stats) stats.slow = slow;
        return out;
    }
}

function parseFast(spec: PropertySpec, text: string): PropertyValue {
    switch (spec.syntax.type) {
        case 'length':
            return parseLength(text);
        case 'length-percentage':
            return parseLengthPercentage(text);
        case 'number':
            return parseNumber(text);
        case 'color':
            return parseColor(text);
        case 'keyword':
            return parseKeyword(text, spec.syntax.values);
    }
}

function parseSlow(spec: PropertySpec, parent: Node): PropertyValue {
    switch (spec.syntax.type) {
        case 'length':
            return probeLengthPercentage(parent, spec.name).px;
        case 'length-percentage':
            return probeLengthPercentage(parent, spec.name);
        case 'number':
            return probeNumber(parent, spec.name);
        case 'color':
            return probeColor(parent, spec.name);
        case 'keyword':
            // Keywords never need the probe: an unknown word is invalid.
            return null;
    }
}
