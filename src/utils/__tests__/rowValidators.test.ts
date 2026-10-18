import { describe, it, expect } from 'vitest';
import { isEmployeeRow, isPolicyRow } from '../rowValidators';
import { INITIAL_EMPLOYEES } from '../../data/initialData';
import { INITIAL_POLICIES } from '../../data/initialPolicies';

const employee = () => ({ ...INITIAL_EMPLOYEES[0] });

describe('isEmployeeRow', () => {
  it('accepts a real employee from the seed data', () => {
    expect(isEmployeeRow(employee())).toBe(true);
  });

  // Each of these is dereferenced by `filteredEmployees` in App.tsx as
  // `emp.<field>.toLowerCase()`. A payload where one of them is a number or missing
  // is the measured white screen: the render throws, the persistence effect never
  // runs, and the "Reset Demo State" button that would fix it never mounts. The
  // validator is the only place this can be caught, so it has to know the exact
  // fields the consumer touches - hence one assertion per field.
  it.each(['id', 'name', 'email', 'department', 'role'] as const)(
    'rejects a row whose %s is not a string',
    (field) => {
      expect(isEmployeeRow({ ...employee(), [field]: 42 })).toBe(false);
      expect(isEmployeeRow({ ...employee(), [field]: null })).toBe(false);
      expect(isEmployeeRow({ ...employee(), [field]: undefined })).toBe(false);
      const missing = employee() as Record<string, unknown>;
      delete missing[field];
      expect(isEmployeeRow(missing)).toBe(false);
    },
  );

  it('rejects a row whose location is not a string', () => {
    // `filteredEmployees` compares location by equality rather than calling a method
    // on it, so a number here fails the filter silently instead of throwing - the row
    // vanishes from every view with no error anywhere.
    expect(isEmployeeRow({ ...employee(), location: 7 })).toBe(false);
  });

  it.each([
    'monthlyCTC', 'basicSalary', 'hra', 'specialAllowance',
    'performanceRating', 'presentDays', 'clBalance', 'slBalance',
    'elBalance', 'lopDays',
  ] as const)('rejects a row whose %s is not a finite number', (field) => {
    // A stringified number does not crash the filter, it silently poisons every
    // downstream total: the formatters call `.toFixed()` on these.
    expect(isEmployeeRow({ ...employee(), [field]: '30' })).toBe(false);
    expect(isEmployeeRow({ ...employee(), [field]: NaN })).toBe(false);
    expect(isEmployeeRow({ ...employee(), [field]: Infinity })).toBe(false);
    expect(isEmployeeRow({ ...employee(), [field]: null })).toBe(false);
  });

  it('keeps a genuine zero on a numeric field', () => {
    // Zero lop days and a zero leave balance are real values, not absence. A validator
    // written as `if (!value)` would discard the roster every time one employee had a
    // zero balance.
    expect(isEmployeeRow({ ...employee(), lopDays: 0, clBalance: 0, elBalance: 0 })).toBe(true);
  });

  it('accepts reportsTo as a string or null, but not a number', () => {
    expect(isEmployeeRow({ ...employee(), reportsTo: null })).toBe(true);
    expect(isEmployeeRow({ ...employee(), reportsTo: 'EMP-1002' })).toBe(true);
    expect(isEmployeeRow({ ...employee(), reportsTo: 1002 })).toBe(false);
  });

  it('keeps a status or gender this build has never heard of', () => {
    // The unions in types.ts are widened over time. A value outside the union is still a
    // string, and `isActive` / the gender ratios already fail closed on it; discarding
    // the entire roster because one cell read "Retiring" would be a far worse outcome.
    expect(isEmployeeRow({ ...employee(), status: 'Retiring' })).toBe(true);
    expect(isEmployeeRow({ ...employee(), gender: 'Unspecified' })).toBe(true);
  });

  it.each([null, undefined, 42, 'EMP-1', ['x'], true])('rejects the non-object %s', (row) => {
    expect(isEmployeeRow(row)).toBe(false);
  });

  it('rejects an empty object', () => {
    // `{"employees":[{}]}` was one of the two payloads measured as white-screening
    // the app.
    expect(isEmployeeRow({})).toBe(false);
  });
});

describe('isPolicyRow', () => {
  const policy = () => ({ ...INITIAL_POLICIES[0] });

  it('accepts a real policy from the seed data', () => {
    expect(isPolicyRow(policy())).toBe(true);
  });

  it.each(['id', 'title', 'category', 'shortDesc', 'eligibility'] as const)(
    'rejects a policy whose %s is not a string',
    (field) => {
      expect(isPolicyRow({ ...policy(), [field]: 7 })).toBe(false);
      expect(isPolicyRow({ ...policy(), [field]: null })).toBe(false);
    },
  );

  it('rejects a policy whose rules is not an array of strings', () => {
    // PolicySection searches with `p.rules.some(r => r.toLowerCase()...)`.
    expect(isPolicyRow({ ...policy(), rules: 'no rules' })).toBe(false);
    expect(isPolicyRow({ ...policy(), rules: [1, 2] })).toBe(false);
    expect(isPolicyRow({ ...policy(), rules: null })).toBe(false);
    expect(isPolicyRow({ ...policy(), rules: [] })).toBe(true);
  });

  it('rejects a policy whose daysAllowed is not a finite number', () => {
    // daysAllowed feeds `safeBalance` and is rendered as `{policy.daysAllowed} {policy.timeUnit}`.
    expect(isPolicyRow({ ...policy(), daysAllowed: '12' })).toBe(false);
    expect(isPolicyRow({ ...policy(), daysAllowed: NaN })).toBe(false);
    expect(isPolicyRow({ ...policy(), daysAllowed: 0 })).toBe(true);
  });

  it('rejects a policy whose isActive is not a boolean', () => {
    // `policies.filter(p => p.isActive).length` is the active-count KPI: a truthy
    // string "false" would count a disabled policy as active.
    expect(isPolicyRow({ ...policy(), isActive: 'false' })).toBe(false);
    expect(isPolicyRow({ ...policy(), isActive: 0 })).toBe(false);
    expect(isPolicyRow({ ...policy(), isActive: true })).toBe(true);
  });

  it('tolerates the optional gift fields being absent', () => {
    const {
      giftOrPerk: _giftOrPerk,
      giftOptions: _giftOptions,
      statutoryReference: _statutoryReference,
      isCustom: _isCustom,
      ...rest
    } = policy();
    expect(isPolicyRow(rest)).toBe(true);
  });

  it.each([null, 42, 'POL-MAT', []])('rejects the non-object %s', (row) => {
    expect(isPolicyRow(row)).toBe(false);
  });
});