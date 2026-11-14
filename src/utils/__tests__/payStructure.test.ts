import { describe, expect, it } from 'vitest';
import type {
  Employee,
  PayStructure,
  PayStructureOverride,
  PayrollBonus,
} from '../../types';
import {
  DEFAULT_PAY_STRUCTURE,
  computePayrollWithStructure,
  createDefaultPayStructure,
  evaluateEarnings,
  resolvePayStructure,
  suggestPerformanceBonus,
  validatePayrollBonus,
  validatePayStructure,
  validatePayStructureOverride,
} from '../payStructure';
import { computePayroll } from '../payroll';

const AS_OF = '2026-11-14';
const MONTH = '2026-11';

const emp = (over: Partial<Employee> = {}): Employee => ({
  id: 'EMP-1',
  name: 'Test Employee',
  email: 'test@example.com',
  phone: '+91 0000000000',
  department: 'Engineering & Technology',
  deptId: 'eng',
  role: 'Engineer',
  location: 'Bengaluru HQ',
  doj: '2020-01-01',
  monthlyCTC: 100000,
  basicSalary: 50000,
  hra: 25000,
  specialAllowance: 25000,
  status: 'Active',
  gender: 'Female',
  performanceRating: 4,
  reportsTo: null,
  presentDays: 26,
  clBalance: 8,
  slBalance: 8,
  elBalance: 12,
  lopDays: 0,
  uan: '100000000000',
  ...over,
});

const structure = (
  components: PayStructure['components'],
  over: Partial<PayStructure> = {},
): PayStructure => ({
  components,
  epfEnabled: true,
  professionalTaxEnabled: true,
  performanceBonusRules: createDefaultPayStructure().performanceBonusRules,
  updatedAt: '2026-11-14T09:30:00.000Z',
  ...over,
});

const bonus = (over: Partial<PayrollBonus> = {}): PayrollBonus => ({
  id: 'bonus-1',
  employeeId: 'EMP-1',
  monthKey: MONTH,
  kind: 'Custom',
  label: 'Diwali bonus',
  amount: 5000,
  createdAt: '2026-11-14T09:30:00.000Z',
  updatedAt: '2026-11-14T09:30:00.000Z',
  ...over,
});

describe('DEFAULT_PAY_STRUCTURE', () => {
  it('is today\'s 50/25/25 split with EPF and PT on and no auto bonus', () => {
    expect(DEFAULT_PAY_STRUCTURE.components).toEqual([
      { id: 'basic', name: 'Basic Salary', basis: 'PercentOfCTC', value: 50, isBasic: true },
      { id: 'hra', name: 'House Rent Allowance (HRA)', basis: 'PercentOfBasic', value: 50 },
      { id: 'special', name: 'Special Allowance', basis: 'Remainder', value: 0 },
    ]);
    expect(DEFAULT_PAY_STRUCTURE.epfEnabled).toBe(true);
    expect(DEFAULT_PAY_STRUCTURE.professionalTaxEnabled).toBe(true);
    expect(DEFAULT_PAY_STRUCTURE.performanceBonusRules.map((rule) => rule.rating)).toEqual([
      5, 4, 3, 2, 1,
    ]);
    expect(validatePayStructure(DEFAULT_PAY_STRUCTURE)).toEqual([]);
  });

  it('hands out a deep copy that cannot corrupt the exported constant', () => {
    const copy = createDefaultPayStructure();
    copy.components[0].value = 99;
    copy.performanceBonusRules[0].percentOfBasic = 99;

    expect(DEFAULT_PAY_STRUCTURE.components[0].value).toBe(50);
    expect(DEFAULT_PAY_STRUCTURE.performanceBonusRules[0].percentOfBasic).toBe(10);
  });
});

describe('evaluateEarnings', () => {
  it('reproduces the default 50/25/25 split and grosses to CTC', () => {
    const result = evaluateEarnings(emp(), DEFAULT_PAY_STRUCTURE);

    expect(result.earnings.map((line) => [line.componentId, line.amount])).toEqual([
      ['basic', 50000],
      ['hra', 25000],
      ['special', 25000],
    ]);
    expect(result.basic).toBe(50000);
    expect(result.remainder).toBe(25000);
    expect(result.gross).toBe(100000);
  });

  it('evaluates Basic first even when it is listed after another component', () => {
    const custom = structure([
      { id: 'hra', name: 'HRA', basis: 'PercentOfBasic', value: 50 },
      { id: 'basic', name: 'Basic', basis: 'PercentOfCTC', value: 40, isBasic: true },
      { id: 'special', name: 'Special', basis: 'Remainder', value: 0 },
    ]);

    const result = evaluateEarnings(emp(), custom);

    expect(result.basic).toBe(40000);
    // HRA is half of the computed Basic, not of an earlier zero.
    expect(result.earnings.map((line) => line.amount)).toEqual([20000, 40000, 40000]);
    expect(result.gross).toBe(100000);
  });

  it('supports percent, fixed and remainder bases together', () => {
    const custom = structure([
      { id: 'basic', name: 'Basic', basis: 'PercentOfCTC', value: 40, isBasic: true },
      { id: 'hra', name: 'HRA', basis: 'Fixed', value: 12000 },
      { id: 'special', name: 'Special', basis: 'Remainder', value: 0 },
    ]);

    const result = evaluateEarnings(emp(), custom);

    expect(result.basic).toBe(40000);
    expect(result.earnings[1].amount).toBe(12000);
    expect(result.remainder).toBe(48000);
    expect(result.gross).toBe(100000);
  });

  it('rounds every line to the rupee', () => {
    const result = evaluateEarnings(emp({ monthlyCTC: 100001 }), DEFAULT_PAY_STRUCTURE);

    expect(result.earnings.map((line) => line.amount)).toEqual([50001, 25001, 24999]);
    expect(result.gross).toBe(100001);
  });

  it('floors a negative remainder at zero instead of clawing money back', () => {
    const custom = structure([
      { id: 'basic', name: 'Basic', basis: 'Fixed', value: 60000, isBasic: true },
      { id: 'special', name: 'Special', basis: 'Remainder', value: 0 },
    ]);

    const result = evaluateEarnings(emp({ monthlyCTC: 50000 }), custom);

    expect(result.remainder).toBe(0);
    expect(result.gross).toBe(60000);
  });

  it('never returns NaN or a negative gross for a corrupt or zero CTC', () => {
    for (const monthlyCTC of [0, NaN, Infinity, -50000]) {
      const result = evaluateEarnings(emp({ monthlyCTC }), DEFAULT_PAY_STRUCTURE);
      expect(result.gross).toBe(0);
      expect(result.basic).toBe(0);
      expect(result.earnings.every((line) => Number.isFinite(line.amount))).toBe(true);
    }
  });
});

describe('computePayrollWithStructure — default equivalence', () => {
  it('matches computePayroll for employees already split by the default template', () => {
    for (const monthlyCTC of [0, 83333, 100000, 250001]) {
      const basicSalary = Math.round(monthlyCTC * 0.5);
      const hra = Math.round(basicSalary * 0.5);
      const employee = emp({
        monthlyCTC,
        basicSalary,
        hra,
        specialAllowance: monthlyCTC - basicSalary - hra,
        lopDays: 1,
      });

      const legacy = computePayroll(employee, AS_OF);
      const priced = computePayrollWithStructure(employee, {
        structure: DEFAULT_PAY_STRUCTURE,
        asOf: AS_OF,
        monthKey: MONTH,
      });

      expect(priced.gross).toBe(legacy.gross);
      expect(priced.basic).toBe(legacy.basic);
      expect(priced.hra).toBe(legacy.hra);
      expect(priced.specialAllowance).toBe(legacy.specialAllowance);
      expect(priced.epf).toBe(legacy.epf);
      expect(priced.professionalTax).toBe(legacy.professionalTax);
      expect(priced.lossOfPay).toBe(legacy.lossOfPay);
      expect(priced.totalDeductions).toBe(legacy.totalDeductions);
      expect(priced.netPayable).toBe(legacy.netPayable);
    }
  });

  it('keeps the full legacy field set and adds the detail fields', () => {
    const priced = computePayrollWithStructure(emp(), {
      structure: DEFAULT_PAY_STRUCTURE,
      asOf: AS_OF,
      monthKey: MONTH,
    });

    expect(priced).toMatchObject({
      gross: 100000,
      basic: 50000,
      hra: 25000,
      specialAllowance: 25000,
      epf: 3000,
      professionalTax: 200,
      lossOfPay: 0,
      totalDeductions: 3200,
      netPayable: 96800,
      bonusTotal: 0,
      employerEpf: 3000,
    });
    expect(priced.earnings).toHaveLength(3);
    expect(priced.bonuses).toEqual([]);
  });
});

describe('computePayrollWithStructure — statutory toggles and LOP', () => {
  it('drops EPF and PT when both toggles are off', () => {
    const custom = structure(DEFAULT_PAY_STRUCTURE.components, {
      epfEnabled: false,
      professionalTaxEnabled: false,
    });

    const priced = computePayrollWithStructure(emp({ lopDays: 2 }), {
      structure: custom,
      asOf: AS_OF,
      monthKey: MONTH,
    });

    expect(priced.epf).toBe(0);
    expect(priced.professionalTax).toBe(0);
    expect(priced.employerEpf).toBe(0);
    expect(priced.lossOfPay).toBe(Math.round((50000 / 26) * 2));
    expect(priced.netPayable).toBe(100000 - priced.lossOfPay);
  });

  it('reports employer EPF as company cost but never deducts it', () => {
    const priced = computePayrollWithStructure(emp(), {
      structure: DEFAULT_PAY_STRUCTURE,
      asOf: AS_OF,
      monthKey: MONTH,
    });

    expect(priced.employerEpf).toBe(priced.epf);
    expect(priced.netPayable).toBe(
      priced.gross - priced.totalDeductions,
    );
  });

  it('caps LOP at the 26-day working month and floors net at zero', () => {
    const custom = structure(
      [
        { id: 'basic', name: 'Basic', basis: 'Fixed', value: 26000, isBasic: true },
        { id: 'special', name: 'Special', basis: 'Remainder', value: 0 },
      ],
      { epfEnabled: false, professionalTaxEnabled: false },
    );

    const priced = computePayrollWithStructure(
      emp({ monthlyCTC: 26000, basicSalary: 26000, hra: 0, specialAllowance: 0, lopDays: 99 }),
      { structure: custom, asOf: AS_OF, monthKey: MONTH },
    );

    expect(priced.lossOfPay).toBe(26000);
    expect(priced.netPayable).toBe(0);
  });
});

describe('computePayrollWithStructure — bonuses', () => {
  it('adds only this employee\'s bonuses for the selected month, rounded, after gross', () => {
    const priced = computePayrollWithStructure(emp(), {
      structure: DEFAULT_PAY_STRUCTURE,
      asOf: AS_OF,
      monthKey: MONTH,
      bonuses: [
        bonus({ id: 'b1', kind: 'Performance', label: 'Performance', amount: 5000.4, rating: 4 }),
        bonus({ id: 'b2', amount: 2500.6 }),
        bonus({ id: 'b3', monthKey: '2026-10', amount: 99999 }),
        bonus({ id: 'b4', employeeId: 'EMP-2', amount: 7777 }),
      ],
    });

    expect(priced.bonusTotal).toBe(7501);
    expect(priced.bonuses.map((line) => line.amount)).toEqual([5000, 2501]);
    expect(priced.bonuses.map((line) => line.id)).toEqual(['b1', 'b2']);
    expect(priced.gross).toBe(100000);
    // Bonuses do not change EPF, PT or LOP.
    expect(priced.epf).toBe(3000);
    expect(priced.professionalTax).toBe(200);
    expect(priced.netPayable).toBe(100000 + 7501 - 3200);
  });

  it('defaults the payroll month to the as-of date', () => {
    const priced = computePayrollWithStructure(emp(), {
      structure: DEFAULT_PAY_STRUCTURE,
      asOf: AS_OF,
      bonuses: [bonus({ amount: 1000 })],
    });

    expect(priced.bonusTotal).toBe(1000);
  });
});

describe('resolvePayStructure and overrides', () => {
  const override = (over: Partial<PayStructureOverride> = {}): PayStructureOverride => ({
    employeeId: 'EMP-1',
    components: [
      { id: 'basic', name: 'Basic', basis: 'Fixed', value: 60000, isBasic: true },
      { id: 'special', name: 'Special', basis: 'Remainder', value: 0 },
    ],
    epfEnabled: false,
    professionalTaxEnabled: false,
    note: 'Retained package',
    updatedAt: '2026-11-14T09:30:00.000Z',
    ...over,
  });

  it('returns the company template when the employee has no override', () => {
    const resolved = resolvePayStructure('EMP-2', DEFAULT_PAY_STRUCTURE, [override()]);
    expect(resolved.components).toEqual(DEFAULT_PAY_STRUCTURE.components);
    expect(resolved.epfEnabled).toBe(true);
  });

  it('uses the override for its employee and keeps company bonus rules current', () => {
    const priced = computePayrollWithStructure(emp(), {
      structure: DEFAULT_PAY_STRUCTURE,
      asOf: AS_OF,
      monthKey: MONTH,
      overrides: [override()],
    });

    expect(priced.basic).toBe(60000);
    expect(priced.specialAllowance).toBe(40000);
    expect(priced.hra).toBe(0);
    expect(priced.epf).toBe(0);
    expect(priced.professionalTax).toBe(0);
  });

  it('isolates an overridden employee from a later company-structure change', () => {
    const changedCompany = structure([
      { id: 'basic', name: 'Basic', basis: 'PercentOfCTC', value: 40, isBasic: true },
      { id: 'special', name: 'Special', basis: 'Remainder', value: 0 },
    ]);

    const overridden = computePayrollWithStructure(emp(), {
      structure: changedCompany,
      overrides: [override()],
      asOf: AS_OF,
      monthKey: MONTH,
    });
    const normal = computePayrollWithStructure(emp({ id: 'EMP-2' }), {
      structure: changedCompany,
      overrides: [override()],
      asOf: AS_OF,
      monthKey: MONTH,
    });

    expect(overridden.basic).toBe(60000);
    expect(normal.basic).toBe(40000);
  });
});

describe('validatePayStructure', () => {
  it('requires exactly one Basic that is not self-referential', () => {
    expect(
      validatePayStructure(
        structure([{ id: 'hra', name: 'HRA', basis: 'PercentOfCTC', value: 50 }]),
      ).join(' '),
    ).toMatch(/exactly one earning component must be basic/i);

    expect(
      validatePayStructure(
        structure([
          { id: 'basic', name: 'Basic', basis: 'PercentOfCTC', value: 50, isBasic: true },
          { id: 'basic2', name: 'Second Basic', basis: 'Fixed', value: 10, isBasic: true },
        ]),
      ).join(' '),
    ).toMatch(/exactly one earning component must be basic/i);

    expect(
      validatePayStructure(
        structure([
          { id: 'basic', name: 'Basic', basis: 'PercentOfBasic', value: 50, isBasic: true },
        ]),
      ).join(' '),
    ).toMatch(/cannot be a percentage of basic/i);
  });

  it('rejects two Remainder components', () => {
    const errors = validatePayStructure(
      structure([
        { id: 'basic', name: 'Basic', basis: 'PercentOfCTC', value: 50, isBasic: true },
        { id: 'r1', name: 'R1', basis: 'Remainder', value: 0 },
        { id: 'r2', name: 'R2', basis: 'Remainder', value: 0 },
      ]),
    );
    expect(errors.join(' ')).toMatch(/only one remainder/i);
  });

  it('rejects duplicate or blank component ids and names', () => {
    const errors = validatePayStructure(
      structure([
        { id: 'basic', name: 'Basic', basis: 'PercentOfCTC', value: 50, isBasic: true },
        { id: 'basic', name: '', basis: 'Fixed', value: 10 },
      ]),
    );
    expect(errors.join(' ')).toMatch(/duplicate earning component id/i);
    expect(errors.join(' ')).toMatch(/needs a name/i);
  });

  it('rejects non-finite, negative and absurd percent values', () => {
    for (const value of [-1, NaN, Infinity]) {
      const errors = validatePayStructure(
        structure([
          { id: 'basic', name: 'Basic', basis: 'PercentOfCTC', value, isBasic: true },
        ]),
      );
      expect(errors.length).toBeGreaterThan(0);
    }

    expect(
      validatePayStructure(
        structure([
          { id: 'basic', name: 'Basic', basis: 'PercentOfCTC', value: 1001, isBasic: true },
        ]),
      ).join(' '),
    ).toMatch(/cannot exceed 1000/i);
  });

  it('requires a complete rating 1–5 rule set with non-negative percentages', () => {
    const incomplete = structure(DEFAULT_PAY_STRUCTURE.components, {
      performanceBonusRules: [{ rating: 5, percentOfBasic: 10 }],
    });
    expect(validatePayStructure(incomplete).join(' ')).toMatch(/rating 1/i);

    const duplicate = structure(DEFAULT_PAY_STRUCTURE.components, {
      performanceBonusRules: [
        { rating: 5, percentOfBasic: 10 },
        { rating: 5, percentOfBasic: 20 },
        { rating: 4, percentOfBasic: 5 },
        { rating: 3, percentOfBasic: 0 },
        { rating: 2, percentOfBasic: 0 },
        { rating: 1, percentOfBasic: 0 },
      ],
    });
    expect(validatePayStructure(duplicate).join(' ')).toMatch(/more than one/i);

    const negative = structure(DEFAULT_PAY_STRUCTURE.components, {
      performanceBonusRules: DEFAULT_PAY_STRUCTURE.performanceBonusRules.map((rule) =>
        rule.rating === 5 ? { ...rule, percentOfBasic: -1 } : rule,
      ),
    });
    expect(validatePayStructure(negative).join(' ')).toMatch(/non-negative/i);
  });

  it('requires boolean statutory toggles', () => {
    const errors = validatePayStructure({
      ...DEFAULT_PAY_STRUCTURE,
      epfEnabled: 'yes',
      professionalTaxEnabled: 1,
    });
    expect(errors.join(' ')).toMatch(/epf setting/i);
    expect(errors.join(' ')).toMatch(/professional tax setting/i);
  });

  it('rejects a non-object and a missing timestamp', () => {
    expect(validatePayStructure(null)).toEqual(['Pay structure must be an object.']);
    expect(
      validatePayStructure({ ...DEFAULT_PAY_STRUCTURE, updatedAt: 'not-a-date' }).join(' '),
    ).toMatch(/valid updated timestamp/i);
  });
});

describe('validatePayStructureOverride', () => {
  const valid: PayStructureOverride = {
    employeeId: 'EMP-1',
    components: [
      { id: 'basic', name: 'Basic', basis: 'Fixed', value: 60000, isBasic: true },
      { id: 'special', name: 'Special', basis: 'Remainder', value: 0 },
    ],
    epfEnabled: false,
    professionalTaxEnabled: true,
    note: 'Retention package',
    updatedAt: '2026-11-14T09:30:00.000Z',
  };

  it('accepts a complete override', () => {
    expect(validatePayStructureOverride(valid)).toEqual([]);
  });

  it('rejects an empty employee, invalid components, a bad note and timestamp', () => {
    expect(validatePayStructureOverride({ ...valid, employeeId: '' }).join(' ')).toMatch(
      /needs an employee/i,
    );
    expect(
      validatePayStructureOverride({ ...valid, components: [] }).join(' '),
    ).toMatch(/at least one earning component/i);
    expect(validatePayStructureOverride({ ...valid, note: 42 }).join(' ')).toMatch(
      /note must be text/i,
    );
    expect(
      validatePayStructureOverride({ ...valid, updatedAt: 'nope' }).join(' '),
    ).toMatch(/valid updated timestamp/i);
  });
});

describe('validatePayrollBonus', () => {
  it('accepts a performance bonus with a rating and a custom bonus without one', () => {
    expect(validatePayrollBonus(bonus())).toEqual([]);
    expect(
      validatePayrollBonus(bonus({ kind: 'Performance', rating: 4 })),
    ).toEqual([]);
  });

  it('rejects a bad month, amount, label, kind and timestamps', () => {
    expect(validatePayrollBonus(bonus({ monthKey: '2026-13' })).join(' ')).toMatch(
      /valid YYYY-MM month/i,
    );
    expect(validatePayrollBonus(bonus({ monthKey: '11-2026' })).join(' ')).toMatch(
      /valid YYYY-MM month/i,
    );
    expect(validatePayrollBonus(bonus({ monthKey: '0000-01' })).join(' ')).toMatch(
      /valid YYYY-MM month/i,
    );

    for (const amount of [0, -1, NaN, Infinity]) {
      expect(validatePayrollBonus(bonus({ amount })).join(' ')).toMatch(/positive finite/i);
    }

    expect(validatePayrollBonus(bonus({ label: '   ' })).join(' ')).toMatch(/needs a label/i);
    expect(
      validatePayrollBonus(bonus({ kind: 'Bonus' as PayrollBonus['kind'] })).join(' '),
    ).toMatch(/known kind/i);
    expect(
      validatePayrollBonus(bonus({ createdAt: 'yesterday' })).join(' '),
    ).toMatch(/valid created timestamp/i);
    expect(
      validatePayrollBonus(bonus({ updatedAt: 'yesterday' })).join(' '),
    ).toMatch(/valid updated timestamp/i);
  });

  it('allows a rating only on a performance bonus, within 1–5', () => {
    expect(validatePayrollBonus(bonus({ rating: 4 })).join(' ')).toMatch(
      /only a performance bonus/i,
    );
    expect(
      validatePayrollBonus(bonus({ kind: 'Performance', rating: 6 })).join(' '),
    ).toMatch(/whole number from 1 to 5/i);
    expect(
      validatePayrollBonus(bonus({ kind: 'Performance', rating: 2.5 })).join(' '),
    ).toMatch(/whole number from 1 to 5/i);
  });
});

describe('suggestPerformanceBonus', () => {
  it('suggests the configured percentage of the computed Basic', () => {
    expect(suggestPerformanceBonus(emp({ performanceRating: 5 }), DEFAULT_PAY_STRUCTURE)).toEqual({
      rating: 5,
      percentOfBasic: 10,
      amount: 5000,
    });
    expect(suggestPerformanceBonus(emp({ performanceRating: 4 }), DEFAULT_PAY_STRUCTURE)).toEqual({
      rating: 4,
      percentOfBasic: 5,
      amount: 2500,
    });
    expect(suggestPerformanceBonus(emp({ performanceRating: 3 }), DEFAULT_PAY_STRUCTURE)).toEqual({
      rating: 3,
      percentOfBasic: 0,
      amount: 0,
    });
  });

  it('suggests zero when the rating has no rule', () => {
    expect(suggestPerformanceBonus(emp({ performanceRating: 8 }), DEFAULT_PAY_STRUCTURE)).toEqual({
      rating: 8,
      percentOfBasic: 0,
      amount: 0,
    });
  });

  it('rounds the suggestion to the rupee', () => {
    const suggested = suggestPerformanceBonus(
      emp({ monthlyCTC: 100001, performanceRating: 5 }),
      DEFAULT_PAY_STRUCTURE,
    );
    // Basic is 50,001; 10% is 5,000.1.
    expect(suggested.amount).toBe(5000);
  });
});
