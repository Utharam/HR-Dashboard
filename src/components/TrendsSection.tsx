import React from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import type { MonthlyTracker } from '../types';
import { formatCrores, formatINR } from '../utils/formatters';
import { describeTable, scrollRegionLabel } from '../utils/pagination';

const TABLE_TITLE = 'Historical monthly HR ledger';

interface TrendsSectionProps {
  tracker: MonthlyTracker[];
}

// Canvas cannot resolve CSS custom properties, so the chart palette is read
// from the token layer once. Change a token in index.css and the charts follow.
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const CHART = {
  primary: token('--primary'),
  success: token('--success'),
  tick: token('--text-muted'),
  grid: token('--grid-line'),
  font: token('--font-sans')
};

const axisTickFont = { family: CHART.font, size: 11 };

export const TrendsSection: React.FC<TrendsSectionProps> = ({ tracker }) => {
  // The ledger is the same window the caption describes. Derived once so the caption, the
  // row count a screen reader announces and the rendered rows cannot disagree.
  const ledgerRows = tracker.slice(-12).reverse();

  // Read the recorded headcount directly, matching the payroll read below.
  // `|| 200` published a fabricated 200-person workforce whenever the tracker
  // was empty or the last month recorded a genuine zero — so an empty tracker
  // claimed 200 staff beside a ₹0 payroll. No record means no headcount.
  const totalHeadcountCurrent = tracker[tracker.length - 1]?.headcount ?? 0;
  // Read the recorded payroll directly. `|| 23000000` published a fabricated
  // ₹2.3 Cr monthly payroll whenever the tracker was empty or the last month
  // recorded a genuine zero — a payroll figure, not a placeholder, and the one
  // remaining `|| <numeric default>` on a payroll number in this section.
  const currentPayroll = tracker[tracker.length - 1]?.grossPayroll ?? 0;
  const avgAttendance = (tracker.reduce((acc, t) => acc + t.avgAttendance, 0) / tracker.length).toFixed(1);
  const avgAttrition = (tracker.reduce((acc, t) => acc + t.attritionPct, 0) / tracker.length).toFixed(2);

  // Chart
  const labels = tracker.map(t => t.month);
  const headcountData = tracker.map(t => t.headcount);
  const payrollData = tracker.map(t => Number((t.grossPayroll / 10000000).toFixed(2))); // In Cr as numbers

  const trendChartData = {
    labels,
    datasets: [
      {
        label: 'Gross Payroll Spend (₹ Crores)',
        data: payrollData,
        borderColor: CHART.primary,
        backgroundColor: token('--primary-glow'),
        pointBackgroundColor: CHART.primary,
        pointBorderColor: token('--bg-card'),
        pointBorderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 12,
        borderWidth: 2,
        yAxisID: 'y1',
        fill: true,
        tension: 0.3
      },
      {
        label: 'Workforce Headcount',
        data: headcountData,
        borderColor: CHART.success,
        backgroundColor: CHART.success,
        pointBackgroundColor: CHART.success,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 12,
        borderWidth: 2,
        borderDash: [4, 4],
        yAxisID: 'y',
        tension: 0.2
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 420 },
    interaction: { mode: 'index' as const, intersect: false },
    scales: {
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        ticks: { color: CHART.success, font: axisTickFont, padding: 6 },
        grid: { color: CHART.grid, drawTicks: false },
        border: { display: false }
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        ticks: { color: CHART.primary, font: axisTickFont, padding: 6 },
        grid: { drawOnChartArea: false },
        border: { display: false }
      },
      x: {
        ticks: { color: CHART.tick, font: axisTickFont, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
        grid: { display: false },
        border: { display: false }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          color: CHART.tick,
          usePointStyle: true,
          pointStyle: 'line',
          boxWidth: 22,
          padding: 16,
          font: axisTickFont
        }
      },
      tooltip: {
        backgroundColor: token('--bg-well'),
        titleColor: token('--text-bright'),
        bodyColor: token('--text-muted'),
        borderColor: token('--border'),
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        titleFont: { family: CHART.font, weight: 600 as const },
        bodyFont: { family: CHART.font }
      }
    }
  };

  return (
    <div className="section-stack">
      {/* 4 Trend Cards */}
      <div className="grid grid--kpi-lg">
        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Active Headcount</span>
          <div className="kpi-value">{totalHeadcountCurrent}</div>
          <span className="kpi-sub text-success">+14.3% Headcount Growth</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Current Monthly Payroll</span>
          <div className="kpi-value text-primary">{formatCrores(currentPayroll)}</div>
          <span className="kpi-sub">₹{formatINR(currentPayroll)} / month</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Historical Attendance Avg</span>
          <div className="kpi-value text-info">{avgAttendance}%</div>
          <span className="kpi-sub">Across 33 Consecutive Months</span>
        </div>

        <div className="omni-card kpi-card kpi-card--compact">
          <span className="kpi-label">Avg Monthly Attrition</span>
          <div className="kpi-value text-warning">{avgAttrition}%</div>
          <span className="kpi-sub">Low Turnover Stability</span>
        </div>
      </div>

      {/* Main Historical Chart */}
      <div className="omni-card chart-card" style={{ height: '360px' }}>
        <h3 className="omni-card-title" style={{ marginBottom: 'var(--space-3)' }}>
          33-Month Headcount vs Total Payroll Spend (Jan 2024 – Sep 2026)
        </h3>
        <div className="chart-body">
          <Line data={trendChartData} options={chartOptions} />
        </div>
      </div>

      {/* Historical Ledger Table */}
      <div className="omni-card omni-card--flush">
        <div className="omni-card-header">
          <div>
            <h3 className="omni-card-title">Historical Monthly HR Ledger (Last 12 Months)</h3>
            <p className="omni-card-sub">Chronological record of monthly hiring, exits, gross payroll, and attendance.</p>
          </div>
        </div>

        <div
          className="omni-table-wrap"
          role="region"
          aria-label={scrollRegionLabel(TABLE_TITLE)}
          tabIndex={0}
        >
          <table className="omni-table">
            <caption className="sr-only">
              {describeTable(TABLE_TITLE, ledgerRows.length, ledgerRows.length, 1, 1)}
            </caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Headcount</th>
                <th scope="col">Gross Payroll (INR)</th>
                <th scope="col">Monthly Hires</th>
                <th scope="col">Monthly Exits</th>
                <th scope="col">Attrition Rate</th>
                <th scope="col">Average Attendance</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map(t => (
                <tr key={t.month}>
                  <td className="cell-strong">{t.month}</td>
                  <td>{t.headcount} staff</td>
                  <td className="cell-strong text-success">₹{formatINR(t.grossPayroll)}</td>
                  <td className="cell-strong text-primary">+{t.hires} hires</td>
                  <td className="cell-strong text-danger-soft">−{t.exits} exits</td>
                  <td><span className="badge badge-active">{t.attritionPct}%</span></td>
                  <td>{t.avgAttendance}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
