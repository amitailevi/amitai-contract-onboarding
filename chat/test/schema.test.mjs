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
