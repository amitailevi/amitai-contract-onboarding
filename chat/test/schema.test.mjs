import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, missing, scrub } from '../schema.mjs';

test('israeli id checksum', () => {
  assert.equal(validate('employeeId', '000000018', true).value, '000000018');
  assert.equal(validate('employeeId', '123456782', true).value, '123456782');
  assert.equal(validate('employeeId', '123456789', true).ok, false);
});
test('dates normalize and reject future/invalid', () => {
  assert.equal(validate('birthDate', '3/3/1986').value, '1986-03-03');
  assert.equal(validate('birthDate', '1986-03-03').value, '1986-03-03');
  assert.equal(validate('birthDate', '31/02/1990').ok, false);
  assert.equal(validate('birthDate', '01/01/2999').ok, false);
});
test('enums, phone, bank', () => {
  assert.equal(validate('gender', 'זכר').ok, true);
  assert.equal(validate('gender', 'male').ok, false);
  assert.equal(validate('mobile', '+972-52-123-4567').value, '0521234567');
  assert.equal(validate('branchNumber', '12').ok, false);
  assert.equal(validate('creditDischarged', 'true').value, true);
  assert.equal(validate('nope', 'x').ok, false);
});
test('completeness follows the conversation', () => {
  const s = { fields: { maritalStatus: 'נשוי/אה', childrenCount: 2, otherIncome: 'יש' }, secure: {} };
  const m = missing(s);
  for (const k of ['spouseId', 'child2.id', 'child2.inCustody', 'taxCoordination', 'accountNumber']) assert.ok(m.includes(k), k);
  assert.ok(!m.includes('child3.name'));
});
test('scrub masks ids/accounts but keeps phones and dates', () => {
  assert.match(scrub('הת"ז שלי 123456782'), /הוסתר/);
  assert.match(scrub('חשבון 12-345-678901'), /הוסתר/);
  assert.equal(scrub('הטלפון 052-123-4567'), 'הטלפון 052-123-4567');
  assert.equal(scrub('נולדתי ב 3/3/1986'), 'נולדתי ב 3/3/1986');
});

import { consistency, prune } from '../schema.mjs';
test('review fixes: scrub variants, fake ids, counts, bank pad', () => {
  for (const t of ['חשבון 12345', '123.456.782', '123/456/782', '١٢٣٤٥٦٧٨٢', '512345678']) assert.match(scrub(t), /הוסתר/, t);
  assert.equal(scrub('נולדתי 1999-02-14'), 'נולדתי 1999-02-14');
  assert.equal(scrub('+972 52 123 4567'), '+972 52 123 4567');
  assert.equal(validate('employeeId', '000000000', true).ok, false);
  assert.equal(validate('childrenCount', '').ok, false);
  assert.equal(validate('childrenCount', '1e1').ok, false);
  assert.equal(validate('bankNumber', '4').value, '04');
});
test('consistency + prune', () => {
  const s = { fields: { maritalStatus: 'רווק/ה', creditSpouseNoIncome: true, childrenCount: 0, creditToddlers: true }, secure: {} };
  assert.equal(consistency(s).length, 2);
  const p = { fields: { childrenCount: 1, 'child1.name': 'א', 'child2.name': 'ב' }, secure: { 'child2.id': '1' } };
  prune(p); assert.deepEqual(Object.keys(p.fields), ['childrenCount', 'child1.name']); assert.deepEqual(p.secure, {});
});
