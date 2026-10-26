// Description of one custom property the caller wants to read and observe.
export type PropertySyntax =
    | { type: 'length'; keywords?: string[] }
    | { type: 'length-percentage'; keywords?: string[] }
    | { type: 'number'; keywords?: string[] }
    // A CSS <time>, read as a number of milliseconds ("0.2s" and "200ms" are both 200).
    | { type: 'time' }
    // `keywords`: extra identifiers the property may hold instead of a color (returned as strings).
    | { type: 'color'; keywords?: string[] }
    // Allowed values. CSS-wide keywords are rejected. `none` is allowed for existing APIs, but
    // the keyword detector maps values to animation names, where `none` means "no animation":
    // a change *to* `none` is not seen by the detector (callers with other triggers are fine).
    // New schemas should avoid it.
    | { type: 'keyword'; values: string[] };

export interface PropertySpec {
    name: string;
    syntax: PropertySyntax;
    // CSS text of the initial value, also used as the var() fallback when unregistered.
    initial: string;
    inherits: boolean;
    // Register with CSS.registerProperty where available, so author transitions interpolate.
    register?: boolean;
    // Skip reading this property (it keeps its initial value) when an earlier property in the
    // schema holds one of these keywords. Saves reads for properties that cannot matter, such as
    // the size of an edge feature on a flat edge.
    skipWhen?: { property: string; values: string[] };
}

export interface LengthPercentage {
    px: number;
    // Percentage part, 50 for 50%.
    percent: number;
}

export type Rgba = [number, number, number, number];

export type PropertyValue = LengthPercentage | number | string | Rgba | null;

const RESERVED = ['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default'];

function checkKeywords(name: string, keywords: string[]): void {
    for (const value of keywords) {
        if (RESERVED.indexOf(value) >= 0) throw new Error(`${name}: keyword "${value}" cannot be observed`);
        if (!/^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(value)) throw new Error(`${name}: "${value}" is not an identifier`);
    }
}

export function validateSchema(schema: PropertySpec[]): void {
    const seen: string[] = [];
    for (const spec of schema) {
        if (spec.skipWhen && seen.indexOf(spec.skipWhen.property) < 0) {
            throw new Error(`${spec.name}: skipWhen refers to ${spec.skipWhen.property}, which must come earlier in the schema`);
        }
        seen.push(spec.name);
        if (spec.name.indexOf('--') !== 0) throw new Error(`${spec.name} is not a custom property name`);
        const syntax = spec.syntax;
        if (syntax.type === 'keyword') {
            checkKeywords(spec.name, syntax.values);
        } else if (syntax.type !== 'color' && syntax.type !== 'time' && syntax.keywords) {
            // Numeric types may hold a keyword instead of a value ("<length> | auto");
            // validate them the same way as the keyword type. Color keywords stay unvalidated.
            checkKeywords(spec.name, syntax.keywords);
        }
    }
}

export function cssSyntax(syntax: PropertySyntax): string {
    switch (syntax.type) {
        case 'length':
            return syntax.keywords && syntax.keywords.length ? `<length> | ${syntax.keywords.join(' | ')}` : '<length>';
        case 'length-percentage':
            return syntax.keywords && syntax.keywords.length ? `<length-percentage> | ${syntax.keywords.join(' | ')}` : '<length-percentage>';
        case 'number':
            return syntax.keywords && syntax.keywords.length ? `<number> | ${syntax.keywords.join(' | ')}` : '<number>';
        case 'time':
            return '<time>';
        case 'color':
            return syntax.keywords && syntax.keywords.length ? `<color> | ${syntax.keywords.join(' | ')}` : '<color>';
        case 'keyword':
            return syntax.values.join(' | ');
    }
}
