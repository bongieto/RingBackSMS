import { parseNdjson, mapRowToCase } from '../importer';

describe('parseNdjson', () => {
  test('parses native-shape rows', () => {
    const content = JSON.stringify({
      id: 'a',
      tenantId: 't-1',
      tenantName: 'X',
      callerPhone: '+1',
      inboundMessage: 'hi',
      originalReply: 'hi back',
    });
    const { cases, errors } = parseNdjson(content);
    expect(errors).toEqual([]);
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe('a');
  });

  test('skips blank lines and // comments', () => {
    const content = [
      '// comment line',
      '',
      JSON.stringify({
        id: 'a',
        tenantId: 't-1',
        tenantName: 'X',
        callerPhone: '+1',
        inboundMessage: 'hi',
        originalReply: 'r',
      }),
      '   ',
      '// another comment',
    ].join('\n');
    const { cases, errors } = parseNdjson(content);
    expect(errors).toEqual([]);
    expect(cases).toHaveLength(1);
  });

  test('reports parse errors with line number', () => {
    const content = ['{not json', '{"valid": true}'].join('\n');
    const { cases, errors } = parseNdjson(content);
    expect(cases).toHaveLength(0); // second line missing required fields too
    expect(errors).toHaveLength(2);
    expect(errors[0].lineNumber).toBe(1);
    expect(errors[0].reason).toContain('JSON parse failed');
  });

  test('reports missing required fields', () => {
    const content = JSON.stringify({ foo: 'bar' });
    const { cases, errors } = parseNdjson(content);
    expect(cases).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('missing required fields');
  });

  test('maps Axiom-style fields (From / Body / botReply)', () => {
    const content = JSON.stringify({
      MessageSid: 'SM_abc',
      tenant_id: 't-1',
      tenant_name: 'Test',
      From: '+12175550100',
      Body: 'hi',
      botReply: 'Hi!',
    });
    const { cases, errors } = parseNdjson(content);
    expect(errors).toEqual([]);
    expect(cases[0].id).toBe('SM_abc');
    expect(cases[0].callerPhone).toBe('+12175550100');
    expect(cases[0].inboundMessage).toBe('hi');
    expect(cases[0].originalReply).toBe('Hi!');
  });
});

describe('mapRowToCase', () => {
  test('null for non-object input', () => {
    expect(mapRowToCase('string', 0)).toBeNull();
    expect(mapRowToCase(null, 0)).toBeNull();
  });

  test('falls back to row-N id when none provided', () => {
    const c = mapRowToCase(
      {
        tenant_id: 't',
        tenant_name: 'T',
        From: '+1',
        Body: 'b',
        botReply: 'r',
      },
      42,
    );
    expect(c?.id).toBe('row-42');
  });
});
