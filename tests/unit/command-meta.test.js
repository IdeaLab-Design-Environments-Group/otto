/**
 * CommandCatalog metadata (arg schemas, risk) and the minimal JSON-schema
 * validator used to check structured (LLM/tool) arguments before a command
 * is built.
 */
import { test, assert, assertEqual } from '../harness.js';
import { CommandCatalog } from '../../src/commands/CommandCatalog.js';
import { validateSchema } from '../../src/core/jsonSchemaLite.js';

const schema = {
    type: 'object',
    required: ['id', 'count'],
    additionalProperties: false,
    properties: {
        id: { type: 'string', minLength: 1 },
        count: { type: 'integer', minimum: 1, maximum: 10 },
        kind: { type: 'string', enum: ['finger', 'tab_slot'] },
        tags: { type: 'array', items: { type: 'string' } },
        at: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } }
    }
};

test('validateSchema accepts a valid object', () => {
    const r = validateSchema(schema, { id: 'a', count: 3, kind: 'finger', tags: ['x'], at: { x: 1, y: 2 } });
    assert(r.ok, JSON.stringify(r.errors));
});

test('validateSchema reports missing required properties with paths', () => {
    const r = validateSchema(schema, { id: 'a' });
    assert(!r.ok);
    assertEqual(r.errors[0].path, '$.count');
});

test('validateSchema rejects wrong types, bounds, enums, extra keys', () => {
    const r = validateSchema(schema, { id: 'a', count: 2.5, kind: 'glue', extra: 1, tags: [3] });
    const paths = r.errors.map(e => e.path).sort();
    assertEqual(paths.join(','), '$.count,$.extra,$.kind,$.tags[0]');
    assert(!validateSchema(schema, { id: 'a', count: 11 }).ok, 'maximum');
    assert(!validateSchema(schema, { id: '', count: 1 }).ok, 'minLength');
});

test('validateSchema: integer rejects NaN and non-numbers; number accepts floats', () => {
    assert(!validateSchema({ type: 'integer' }, NaN).ok);
    assert(!validateSchema({ type: 'number' }, '3').ok);
    assert(validateSchema({ type: 'number' }, 3.5).ok);
});

test('validateSchema: empty schema accepts anything', () => {
    assert(validateSchema({}, { anything: [1, 2] }).ok);
});

test('CommandCatalog stores optional metadata without affecting create()', () => {
    const catalog = new CommandCatalog();
    catalog.register('demo.cmd', (n) => ({ n }), { summary: 'Demo', risk: 'low', schema });
    assertEqual(catalog.create('demo.cmd', 4).n, 4);
    assertEqual(catalog.getMeta('demo.cmd').risk, 'low');
    assertEqual(catalog.getMeta('shape.add'), null, 'built-ins have no metadata yet');
    const names = catalog.describe().map(d => d.name);
    assert(names.includes('demo.cmd'), 'described');
    assertEqual(names.join(','), [...names].sort().join(','), 'sorted by name');
});

test('CommandCatalog.unregister drops metadata too', () => {
    const catalog = new CommandCatalog();
    catalog.register('demo.cmd', () => ({}), { summary: 'Demo' });
    catalog.unregister('demo.cmd');
    assertEqual(catalog.getMeta('demo.cmd'), null);
});
