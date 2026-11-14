import React, { useId, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ChevronLeft, ChevronRight, Download, FileText, Printer } from 'lucide-react';
import type {
  AttendanceRecord,
  Employee,
  Holiday,
  PayStructure,
  PayStructureOverride,
  PayrollBonus,
} from '../types';
import { isActive } from '../utils/payroll';
import {
  computePayrollWithStructure,
  createDefaultPayStructure,
} from '../utils/payStructure';
import { monthKey as toMonthKey, parseMonthKey, rollupMonth } from '../utils/attendance';
import { toISODate } from '../utils/dates';
import { formatINR } from '../utils/formatters';
import {
  applyMonthAttendanceRollup,
  buildFinanceReportModel,
  buildFinanceReportWorkbook,
  describeFinanceMonth,
  type FinanceReportRowInput,
} from '../utils/financeReport';

/**
 * The Finance Report (design §6.4): a read-only month-close statement.
 *
 * The page owns its month; App hands it the FULL register, the daily ledger, the
 * holiday calendar and the live pay datasets. For the chosen month it computes
 * `rollupMonth`, folds the day-level attendance into every employee with records
 * (the same rule App uses for the current month) and prices each active employee
 * with `computePayrollWithStructure` - the one calculation the Payroll tab, the
 * payslip, the designer and the payroll export use.
 *
 * There are no inline edits here. A month can be priced from the attendance
 * ledger and the CURRENT employee terms, which is a report, not a stored payroll
 * run; that limitation is the one documented deferral in the design.
 */

const NO_OVERRIDES: PayStructureOverride[] = [];
const NO_BONUSES: PayrollBonus[] = [];
const FALLBACK_STRUCTURE = createDefaultPayStructure();

const GENERATED_LABEL = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export interface FinanceReportSectionProps {
  /** The full register. The report applies its own payroll-run filter. */
  employees: Employee[];
  /** The daily attendance ledger the selected month's rollup reads. */
  attendance: AttendanceRecord[];
  holidays: Holiday[];
  /** The live company template. Absent = the default structure. */
  payStructure?: PayStructure;
  payOverrides?: PayStructureOverride[];
  payrollBonuses?: PayrollBonus[];
  /** The default month; the report owns the selected month from then on. */
  currentMonthKey?: string;
  /** The selected month rides along so the payslip prices that month's bonuses. */
  onSelectEmployee: (employee: Employee, monthKey: string) => void;
  /** Company name on the print header and the workbook summary. */
  companyName?: string;
}

function defaultMonthKey(currentMonthKey?: string): string {
  if (currentMonthKey && parseMonthKey(currentMonthKey)) return currentMonthKey;

  const today = toISODate(new Date());
  const parsed = parseMonthKey(today.slice(0, 7));
  return parsed ? today.slice(0, 7) : toMonthKey(new Date().getFullYear(), new Date().getMonth());
}

function monthFrom(key: string): { year: number; monthIndex: number } {
  const parsed = parseMonthKey(key);
  if (parsed) return parsed;

  const fallback = parseMonthKey(defaultMonthKey());
  return fallback ?? { year: new Date().getFullYear(), monthIndex: new Date().getMonth() };
}

export const FinanceReportSection: React.FC<FinanceReportSectionProps> = ({
  employees,
  attendance,
  holidays,
  payStructure,
  payOverrides = NO_OVERRIDES,
  payrollBonuses = NO_BONUSES,
  currentMonthKey,
  onSelectEmployee,
  companyName = 'OmniHR',
}) => {
  const monthInputId = useId();
  const [selectedMonthKey, setSelectedMonthKey] = useState(() =>
    defaultMonthKey(currentMonthKey),
  );
  const [generatedAt, setGeneratedAt] = useState(() => new Date());

  const { year, monthIndex } = monthFrom(selectedMonthKey);
  const monthLabel = describeFinanceMonth(selectedMonthKey);
  const generatedLabel = GENERATED_LABEL.format(generatedAt);
  const structure = payStructure ?? FALLBACK_STRUCTURE;

  const changeMonth = (nextKey: string) => {
    if (!parseMonthKey(nextKey) || nextKey === selectedMonthKey) return;
    setSelectedMonthKey(nextKey);
    // A new month is a new statement, so its generated timestamp moves with it.
    setGeneratedAt(new Date());
  };

  const shiftMonth = (delta: number) => {
    const { year: y, monthIndex: m } = monthFrom(selectedMonthKey);
    const shifted = new Date(y, m + delta, 1);
    changeMonth(toMonthKey(shifted.getFullYear(), shifted.getMonth()));
  };

  // The selected month's day-level rollup. Resigned/Unknown staff stay in the
  // rollup (it is a ledger fact) but are filtered out of the money below.
  const rollups = useMemo(
    () => rollupMonth(attendance, employees, holidays, year, monthIndex),
    [attendance, employees, holidays, year, monthIndex],
  );

  const reportEmployees = useMemo(
    () => applyMonthAttendanceRollup(employees.filter(isActive), rollups),
    [employees, rollups],
  );

  const rows = useMemo<FinanceReportRowInput[]>(
    () =>
      reportEmployees.map((employee) => ({
        employee,
        breakdown: computePayrollWithStructure(employee, {
          structure,
          overrides: payOverrides,
          bonuses: payrollBonuses,
          monthKey: selectedMonthKey,
        }),
      })),
    [reportEmployees, structure, payOverrides, payrollBonuses, selectedMonthKey],
  );

  const model = useMemo(
    () =>
      buildFinanceReportModel({
        monthKey: selectedMonthKey,
        generatedAt: generatedAt.toISOString(),
        rows,
      }),
    [selectedMonthKey, generatedAt, rows],
  );

  const employeeById = useMemo(
    () => new Map(reportEmployees.map((employee) => [employee.id, employee])),
    [reportEmployees],
  );

  const handleExport = () => {
    const workbook = buildFinanceReportWorkbook({
      monthKey: selectedMonthKey,
      generatedAt: new Date().toISOString(),
      rows,
      companyName,
    });
    XLSX.writeFile(workbook, `OmniHR_Finance_Report_${selectedMonthKey}.xlsx`);
  };

  const hasEmployees = model.summary.employeesPaid > 0;
  const floorCount = model.summary.flooredEmployees.length;

  return (
    <div className="section-stack finance-report">
      {/* Print-only statement header: the screen's header and sidebar are
          already hidden by the global print rules, so the paper gets its own. */}
      <div className="finance-report__print-head">
        <p className="finance-report__print-brand">{companyName}</p>
        <h3>Finance Report — {monthLabel}</h3>
        <p>
          Month: {monthLabel} ({selectedMonthKey}) · Generated {generatedLabel}
        </p>
      </div>

      <section className="omni-card finance-report__toolbar no-print" aria-label="Report controls">
        <div className="finance-report__month">
          <label className="omni-label" htmlFor={monthInputId}>
            Report month
          </label>
          <div className="finance-report__month-row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft size={15} aria-hidden="true" /> Prev
            </button>
            <input
              id={monthInputId}
              type="month"
              className="omni-input"
              value={selectedMonthKey}
              onChange={(event) => changeMonth(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              Next <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="finance-report__meta">
          <span className="finance-report__month-label">{monthLabel}</span>
          <span className="designer-hint">Generated {generatedLabel}</span>
        </div>

        <div className="finance-report__actions">
          <button type="button" className="btn btn-secondary" onClick={handleExport}>
            <Download size={15} aria-hidden="true" /> Export Excel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
          >
            <Printer size={15} aria-hidden="true" /> Print report
          </button>
        </div>
      </section>

      {floorCount > 0 && (
        <div className="alert tone-warning finance-report__floor-note" role="status">
          <strong>Net pay is floored at zero for {floorCount} employee{floorCount === 1 ? '' : 's'}.</strong>{' '}
          Their deductions exceed gross earnings plus bonuses by ₹
          {formatINR(model.summary.netFloorShortfall)} in total. The statement shows ₹0
          net rather than a negative payment, and the zero-floor write-off is carried
          in the reconciliation.
        </div>
      )}

      {!hasEmployees && (
        <div className="alert tone-info" role="status">
          No active employees for {monthLabel}. The report is still a truthful zero
          statement: every total is ₹0 and the workbook exports with empty tables.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Employees paid</span>
          <div className="kpi-value">{model.summary.employeesPaid}</div>
          <span className="kpi-sub">Active, Probation and Notice Period staff</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Gross Earnings (fixed)</span>
          <div className="kpi-value text-primary">₹{formatINR(model.summary.gross)}</div>
          <span className="kpi-sub">Structure earnings before bonuses</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Bonuses</span>
          <div className="kpi-value text-success-soft">₹{formatINR(model.summary.bonuses)}</div>
          <span className="kpi-sub">Performance and custom one-offs</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Statutory Deductions (EPF + PT)</span>
          <div className="kpi-value text-danger">₹{formatINR(model.summary.statutoryDeductions)}</div>
          <span className="kpi-sub">
            EPF: ₹{formatINR(model.summary.epf)} • PT: ₹{formatINR(model.summary.professionalTax)}
          </span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">LOP Recovery</span>
          <div className="kpi-value text-warning">₹{formatINR(model.summary.lopRecovery)}</div>
          <span className="kpi-sub">Loss of pay recovered from salaries</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Net Payable</span>
          <div className="kpi-value text-success">₹{formatINR(model.summary.netPayable)}</div>
          <span className="kpi-sub">After EPF, Professional Tax and LOP</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Employer EPF</span>
          <div className="kpi-value text-info">₹{formatINR(model.summary.employerEpf)}</div>
          <span className="kpi-sub">Company contribution, never deducted</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Total Cost to Company</span>
          <div className="kpi-value">₹{formatINR(model.summary.totalCost)}</div>
          <span className="kpi-sub">Gross + bonuses + employer EPF</span>
        </div>
      </div>

      {/* Department table */}
      <section className="omni-card omni-card--flush" aria-labelledby="finance-departments-title">
        <div className="omni-card-header">
          <div>
            <h3 id="finance-departments-title" className="omni-card-title">
              Department breakdown
            </h3>
            <p className="omni-card-sub">
              Department headcount and cost for {monthLabel}. Deductions include EPF,
              Professional Tax and LOP.
            </p>
          </div>
          <span className="pagination__count">
            {model.departments.length} department{model.departments.length === 1 ? '' : 's'}
          </span>
        </div>

        <div
          className="omni-table-wrap"
          role="region"
          aria-label="Department salary and cost table"
          tabIndex={0}
        >
          <table className="omni-table finance-report__table">
            <caption className="sr-only">
              Department salary and cost breakdown for {monthLabel}
            </caption>
            <thead>
              <tr>
                <th scope="col">Department</th>
                <th scope="col">Headcount</th>
                <th scope="col">Gross Earnings</th>
                <th scope="col">Bonuses</th>
                <th scope="col">Deductions</th>
                <th scope="col">Net Payable</th>
                <th scope="col">Employer EPF</th>
                <th scope="col">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {model.departments.map((department) => (
                <tr key={department.department}>
                  <td className="cell-strong">{department.department}</td>
                  <td>{department.headcount}</td>
                  <td>₹{formatINR(department.gross)}</td>
                  <td className={department.bonuses > 0 ? 'text-success-soft' : 'text-dim'}>
                    {department.bonuses > 0 ? `+₹${formatINR(department.bonuses)}` : '—'}
                  </td>
                  <td className="text-danger-soft">−₹{formatINR(department.deductions)}</td>
                  <td className="cell-strong text-success">₹{formatINR(department.net)}</td>
                  <td>₹{formatINR(department.employerEpf)}</td>
                  <td className="cell-strong">₹{formatINR(department.totalCost)}</td>
                </tr>
              ))}
              {model.departments.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-cell">
                      No active employees for {monthLabel}. There is nothing to group.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {model.departments.length > 0 && (
              <tfoot>
                <tr>
                  <th scope="row" className="finance-report__total-cell">Total</th>
                  <td className="finance-report__total-cell">{model.summary.employeesPaid}</td>
                  <td className="finance-report__total-cell">₹{formatINR(model.summary.gross)}</td>
                  <td className="finance-report__total-cell">₹{formatINR(model.summary.bonuses)}</td>
                  <td className="finance-report__total-cell">−₹{formatINR(model.summary.totalDeductions)}</td>
                  <td className="finance-report__total-cell">₹{formatINR(model.summary.netPayable)}</td>
                  <td className="finance-report__total-cell">₹{formatINR(model.summary.employerEpf)}</td>
                  <td className="finance-report__total-cell">₹{formatINR(model.summary.totalCost)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Employee table */}
      <section className="omni-card omni-card--flush" aria-labelledby="finance-employees-title">
        <div className="omni-card-header">
          <div>
            <h3 id="finance-employees-title" className="omni-card-title">
              Employee breakup
            </h3>
            <p className="omni-card-sub">
              One row per paid employee for {monthLabel}. Gross + bonuses − deductions =
              net, subject to the zero floor.
            </p>
          </div>
          <span className="pagination__count">
            {model.summary.employeesPaid} employee{model.summary.employeesPaid === 1 ? '' : 's'}
          </span>
        </div>

        <div
          className="omni-table-wrap"
          role="region"
          aria-label="Employee salary and cost table"
          tabIndex={0}
        >
          <table className="omni-table finance-report__table">
            <caption className="sr-only">
              Employee salary and cost breakup for {monthLabel}
            </caption>
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col">Department</th>
                <th scope="col">Gross</th>
                <th scope="col">Performance Bonus</th>
                <th scope="col">Custom Bonus</th>
                <th scope="col">EPF</th>
                <th scope="col">PT</th>
                <th scope="col">LOP</th>
                <th scope="col">Net</th>
                <th scope="col">Employer EPF</th>
                <th scope="col">Payslip</th>
              </tr>
            </thead>
            <tbody>
              {model.employees.map((row) => {
                const employee = employeeById.get(row.employeeId);
                return (
                  <tr key={row.employeeId}>
                    <td className="cell-strong">
                      {row.employeeName}
                      <span className="finance-report__employee-id">{row.employeeId}</span>
                    </td>
                    <td>{row.department}</td>
                    <td>₹{formatINR(row.gross)}</td>
                    <td className={row.performanceBonus > 0 ? 'text-success-soft' : 'text-dim'}>
                      {row.performanceBonus > 0 ? `+₹${formatINR(row.performanceBonus)}` : '—'}
                    </td>
                    <td className={row.customBonus > 0 ? 'text-success-soft' : 'text-dim'}>
                      {row.customBonus > 0 ? `+₹${formatINR(row.customBonus)}` : '—'}
                    </td>
                    <td className="text-danger-soft">−₹{formatINR(row.epf)}</td>
                    <td className="text-danger-soft">−₹{row.professionalTax}</td>
                    <td className={row.lossOfPay > 0 ? 'text-danger-soft' : 'text-dim'}>
                      −₹{formatINR(row.lossOfPay)}
                    </td>
                    <td className="cell-strong text-success">
                      ₹{formatINR(row.netPayable)}
                      {row.netFloored && (
                        <span className="badge badge-probation finance-report__floor-badge">
                          Floored
                        </span>
                      )}
                    </td>
                    <td>₹{formatINR(row.employerEpf)}</td>
                    <td>
                      {employee && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm no-print"
                          onClick={() => onSelectEmployee(employee, selectedMonthKey)}
                          aria-label={`Open payslip for ${row.employeeName}`}
                        >
                          <FileText size={13} aria-hidden="true" /> Payslip
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {model.employees.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-cell">
                      No active employees for {monthLabel}. Add staff or resolve their
                      status to populate the report.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
