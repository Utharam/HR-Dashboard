import React, { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import 'chart.js/auto';
import { Users, CreditCard, Award, CalendarCheck, TrendingDown, Sparkles } from 'lucide-react';
import type { Employee, Department } from '../types';
import { formatINR, formatCrores, formatLakhs } from '../utils/formatters';
import { computeAttendancePct } from '../utils/dates';
import { isActive } from '../utils/payroll';
import { useChartTokens } from '../theme/chartTokens';

interface OverviewSectionProps {
  employees: Employee[];
  departments: Department[];
  onSelectEmployee: (emp: Employee) => void;
  /**
   * Resets the global filters that emptied this view. Optional because the section is also
   * rendered with a genuinely empty register, where there is nothing to clear and offering
   * to clear it would be a control that does nothing.
   */
  onClearFilters?: () => void;
}

/**
 * The published reference figure for tech attrition, kept as a constant so it can only ever
 * change in one place - and quoted as a BENCHMARK rather than compared against the roster.
 * The old sub-label read "Below 3.5% Tech Industry Avg" under a hardcoded 1.4%, which made
 * an industry figure read as though the app had compared this organisation against it.
 */
const TECH_ATTRITION_BENCHMARK = '3.5% tech industry benchmark';

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  employees,
  departments,
  onSelectEmployee,
  onClearFilters
}) => {
  const chartTokens = useChartTokens();

  // Aggregate Metrics
  const totalHeadcount = employees.length;
  const activeCount = employees.filter(e => e.status === 'Active').length;
  const probationCount = employees.filter(e => e.status === 'Probation').length;
  const noticeCount = employees.filter(e => e.status === 'Notice Period').length;
  const unknownStatusCount = employees.filter(e => e.status === 'Unknown').length;

  // Headcount on the payroll run. `isActive` excludes Resigned and Unknown, which is what
  // every other payable figure in this app is derived from - a tile that disagreed with the
  // payroll tab was disagreeing about who counts as staff at all.
  const activeEmployees = employees.filter(isActive);
  const payrollRunHeadcount = activeEmployees.length;

  // The payroll tab derives its identically-named tile from the active roster, so this one
  // must too: summing every record here made the two tabs report two different "monthly
  // payroll CTC" totals with no basis label to reconcile them. The average uses the same
  // active denominator, so it cannot quietly average over resigned staff either.
  const totalMonthlyPayroll = activeEmployees.reduce((acc, e) => acc + e.monthlyCTC, 0);
  const avgMonthlyCTC = payrollRunHeadcount ? totalMonthlyPayroll / payrollRunHeadcount : 0;
  // An empty roster has no attendance to average. The old fallback published a literal
  // '95.2', which is a plausible-looking workforce statistic for a dataset that does
  // not exist. 0.0 is the honest reading and matches the empty-roster ratio fallback
  // below; no number is invented here.
  const avgAttendance = totalHeadcount 
    ? (employees.reduce((acc, e) => acc + computeAttendancePct(e.presentDays), 0) / totalHeadcount).toFixed(1)
    : '0.0';

  // Diversity
  const femaleCount = employees.filter(e => e.gender === 'Female').length;
  const maleCount = employees.filter(e => e.gender === 'Male').length;
  const nbCount = employees.filter(e => e.gender === 'Non-Binary').length;
  const declinedCount = employees.filter(e => e.gender === 'Prefer Not to Say').length;
  const unknownGenderCount = employees.filter(e => e.gender === 'Unknown').length;
  // The denominator is the population that actually answered: Female + Male +
  // Non-Binary. `Prefer Not to Say` is a declined answer and `Unknown` means the
  // column could not be read, so counting either in the denominator would silently
  // deflate the ratio for reasons that have nothing to do with the workforce, and
  // counting them in the numerator would be worse. The ratio therefore answers
  // "of the employees who declared a gender, what share are Female" - stated as such
  // in the sub-label so nobody reads it as a share of the whole roster.
  const declaredGenderCount = femaleCount + maleCount + nbCount;
  const femaleRatio = declaredGenderCount
    ? ((femaleCount / declaredGenderCount) * 100).toFixed(1)
    : '0.0';

  // High Performers (5-star rating)
  const topPerformers = employees.filter(e => e.performanceRating === 5).slice(0, 5);

  // Attrition, over the records actually in view.
  //
  // The denominator is stated in the sub-label because the figure is only meaningful with
  // one: "20% attrition" over 10 records and over 10,000 are different claims, and a tile
  // that shows one without the other is a riddle. It was a literal `1.4%` in the markup,
  // which meant a search box returning three people still reported the organisation-wide
  // figure as though it had been measured on those three.
  const resignedCount = employees.filter(e => e.status === 'Resigned').length;
  const attritionPct = (totalHeadcount ? (resignedCount / totalHeadcount) * 100 : 0).toFixed(1);

  // Canvas cannot resolve CSS custom properties, so the component reads them
  // through the theme-subscribed hook and hands plain strings to Chart.js.
  // Every chart-facing object is memoised (and all hooks sit above the empty
  // roster return below) so an unrelated rerender cannot hand Chart.js a new
  // object identity and redraw a chart that has not changed.
  const axisTickFont = useMemo(
    () => ({ family: chartTokens.font, size: 11 }),
    [chartTokens],
  );
  const tooltipTheme = useMemo(() => ({
    backgroundColor: chartTokens.well,
    titleColor: chartTokens.bright,
    bodyColor: chartTokens.tick,
    borderColor: chartTokens.border,
    borderWidth: 1,
    cornerRadius: 8,
    padding: 10,
    displayColors: true,
    titleFont: { family: chartTokens.font, weight: 600 as const },
    bodyFont: { family: chartTokens.font }
  }), [chartTokens]);

  // 1. Department Headcount Chart Data
  const deptLabels = useMemo(
    () => departments.map(d => d.name.split(' ')[0]),
    [departments],
  );
  const deptHeadcounts = useMemo(
    () => departments.map(d => employees.filter(e => e.department === d.name).length),
    [departments, employees],
  );
  const deptPayrolls = useMemo(() => departments.map(d =>
    employees.filter(e => e.department === d.name).reduce((sum, e) => sum + e.monthlyCTC, 0) / 100000 // In Lakhs
  ), [departments, employees]);

  const headcountChartData = useMemo(() => ({
    labels: deptLabels,
    datasets: [
      {
        label: 'Staff Headcount',
        data: deptHeadcounts,
        backgroundColor: chartTokens.primary,
        borderRadius: 6,
        maxBarThickness: 48
      }
    ]
  }), [deptLabels, deptHeadcounts, chartTokens]);

  const payrollChartData = useMemo(() => ({
    labels: deptLabels,
    datasets: [
      {
        label: 'Monthly Payroll (₹ Lakhs)',
        data: deptPayrolls,
        backgroundColor: chartTokens.success,
        borderRadius: 6,
        maxBarThickness: 48
      }
    ]
  }), [deptLabels, deptPayrolls, chartTokens]);

  // 2. Diversity & Status Doughnut
  const statusDoughnutData = useMemo(() => ({
    labels: ['Active', 'Probation', 'Notice Period', 'Resigned', 'Unknown'],
    datasets: [
      {
        data: [
          activeCount,
          probationCount,
          noticeCount,
          resignedCount,
          unknownStatusCount
        ],
        backgroundColor: [chartTokens.success, chartTokens.warning, chartTokens.danger, chartTokens.neutral, chartTokens.dim],
        borderColor: chartTokens.surface,
        borderWidth: 2,
        hoverOffset: 4
      }
    ]
  }), [activeCount, probationCount, noticeCount, resignedCount, unknownStatusCount, chartTokens]);

  // The doughnut shows the WHOLE roster, including the two non-answers, because a
  // slice of "Unknown" is exactly the import defect an executive needs to see. The
  // diversity KPI above is the one that excludes them from its denominator.
  const diversityDoughnutData = useMemo(() => ({
    labels: ['Female', 'Male', 'Non-Binary', 'Prefer Not to Say', 'Unknown'],
    datasets: [
      {
        data: [femaleCount, maleCount, nbCount, declinedCount, unknownGenderCount],
        backgroundColor: [chartTokens.pink, chartTokens.info, chartTokens.purple, chartTokens.dim, chartTokens.neutral],
        borderColor: chartTokens.surface,
        borderWidth: 2,
        hoverOffset: 4
      }
    ]
  }), [femaleCount, maleCount, nbCount, declinedCount, unknownGenderCount, chartTokens]);

  // Every chart in the console shares one axis, grid and tooltip treatment.
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 420 },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { color: chartTokens.tick, font: axisTickFont, padding: 6 },
        grid: { color: chartTokens.grid, drawTicks: false },
        border: { display: false }
      },
      x: {
        ticks: { color: chartTokens.tick, font: axisTickFont },
        grid: { display: false },
        border: { display: false }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: tooltipTheme
    }
  }), [chartTokens, axisTickFont, tooltipTheme]);

  const doughnutOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    animation: { duration: 420 },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: chartTokens.tick,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 7,
          padding: 14,
          font: axisTickFont
        }
      },
      tooltip: tooltipTheme
    }
  }), [chartTokens, axisTickFont, tooltipTheme]);

  // A roster emptied by a filter is not a workforce of zero. Six KPI tiles of `0`, `0.0%`
  // and `₹0` render exactly like a working dashboard whose numbers have gone to zero, so
  // nothing tells anyone to look at the filter box. This returns instead of the tiles.
  // Safe to reach with memos above: every hook already ran, so hook order does not
  // change between renders.
  if (totalHeadcount === 0) {
    return (
      <div className="section-stack">
        <div className="omni-card empty-state">
          <p className="empty-state__title">No staff match the current filters</p>
          <p className="empty-state__body">
            Every figure on this page is computed from the register as it is currently
            filtered. Nothing matched, so there is nothing to measure &mdash; this is not a
            workforce of zero.
          </p>
          {onClearFilters && (
            <button type="button" onClick={onClearFilters} className="btn btn-secondary">
              Clear filters
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      {/* 6 Key Executive Metrics */}
      <div className="grid grid--kpi">
        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Active Headcount</span>
            <Users size={16} className="text-primary" />
          </div>
          <div className="kpi-value">{payrollRunHeadcount}</div>
          <div className="kpi-sub">
            {totalHeadcount} records in view &bull; {resignedCount} resigned, {unknownStatusCount} unresolved
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Monthly Payroll CTC</span>
            <CreditCard size={16} className="text-success" />
          </div>
          <div className="kpi-value text-success">
            {formatCrores(totalMonthlyPayroll)}
          </div>
          <div className="kpi-sub">
            Avg CTC: {formatLakhs(avgMonthlyCTC * 12)} / year
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Attendance Rate</span>
            <CalendarCheck size={16} className="text-info" />
          </div>
          <div className="kpi-value text-info">{avgAttendance}%</div>
          <div className="kpi-sub">
            Standard 26-Day Cycle
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Annual Attrition Rate</span>
            <TrendingDown size={16} className="text-warning" />
          </div>
          <div className="kpi-value text-warning">{attritionPct}%</div>
          <div className="kpi-sub">
            {resignedCount} of {totalHeadcount} records in view are Resigned &bull; reference: {TECH_ATTRITION_BENCHMARK}
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Gender Diversity</span>
            <Sparkles size={16} className="text-pink" />
          </div>
          <div className="kpi-value text-pink">{femaleRatio}%</div>
          <div className="kpi-sub">
            {femaleCount} of {declaredGenderCount} declared • {totalHeadcount - declaredGenderCount} declined / unknown
          </div>
        </div>

        <div className="omni-card kpi-card">
          <div className="kpi-head">
            <span className="kpi-label">Star Performers</span>
            <Award size={16} className="text-purple" />
          </div>
          <div className="kpi-value text-purple">
            {employees.filter(e => e.performanceRating === 5).length}
          </div>
          <div className="kpi-sub">
            Rating: 5 / 5 (Outstanding)
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid--half">
        <div className="omni-card chart-card" style={{ height: '340px' }}>
          <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-4)' }}>
            Headcount by Department
          </h3>
          <div className="chart-body">
            <Bar data={headcountChartData} options={chartOptions} />
          </div>
        </div>

        <div className="omni-card chart-card" style={{ height: '340px' }}>
          <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-4)' }}>
            Monthly Payroll Spend by Department (₹ Lakhs)
          </h3>
          <div className="chart-body">
            <Bar data={payrollChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Secondary Row: Doughnut Breakdown & Top Performers */}
      <div className="grid grid--split">
        <div className="omni-card chart-card" style={{ height: '300px' }}>
          <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-3)' }}>
            Workforce Status Split
          </h3>
          <div className="chart-body">
            <Doughnut data={statusDoughnutData} options={doughnutOptions} />
          </div>
        </div>

        <div className="omni-card chart-card" style={{ height: '300px' }}>
          <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-3)' }}>
            Gender Demographics
          </h3>
          <div className="chart-body">
            <Doughnut data={diversityDoughnutData} options={doughnutOptions} />
          </div>
        </div>

        <div className="omni-card">
          <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--gap-micro)' }}>
            <Award size={16} className="text-purple" /> High Potential & Top Talent
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {topPerformers.length === 0 && (
              <p className="empty-cell">No five-star ratings in the current filter.</p>
            )}
            {topPerformers.map(emp => (
              <button
                key={emp.id}
                type="button"
                onClick={() => onSelectEmployee(emp)}
                className="entity-row"
              >
                <div>
                  <div className="entity-row__name">{emp.name}</div>
                  <div className="entity-row__meta">{emp.role} • {emp.department}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-purple">★ 5.0 Rating</span>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '3px' }}>
                    ₹{formatINR(emp.monthlyCTC)}/mo
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
