import React, { useState } from 'react';
import { ShieldCheck, Calculator } from 'lucide-react';
import type { Employee } from '../types';
import { formatINR, computeStatutoryGratuity } from '../utils/formatters';
import { computeTenureYears } from '../utils/dates';
import { earnedLeaveBalance } from '../utils/leave';

interface RetentionSectionProps {
  employees: Employee[];
}

export const RetentionSection: React.FC<RetentionSectionProps> = ({ employees }) => {
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [basicSalary, setBasicSalary] = useState(45000);
  const [tenureYears, setTenureYears] = useState<number | null>(5.5);
  const [unusedLeaves, setUnusedLeaves] = useState(15);
  const [separationType, setSeparationType] = useState<'resignation' | 'retrenchment'>('resignation');
  const [hasCalculated, setHasCalculated] = useState(false);

  const handleSelectEmployee = (empId: string) => {
    setSelectedEmpId(empId);
    const emp = employees.find(e => e.id === empId);
    if (emp) {
      setBasicSalary(emp.basicSalary);
      // Service is measured against the real current date, not a frozen "today".
      // A blank or unreadable doj yields null, which computeStatutoryGratuity
      // reports as invalid, so no settlement statement is rendered at all.
      const service = computeTenureYears(emp.doj);
      setTenureYears(service === null ? null : parseFloat(service.toFixed(1)));
      setUnusedLeaves(earnedLeaveBalance(emp));
    }
  };

  // Statutory calculation
  const gratuityResult = computeStatutoryGratuity(basicSalary, tenureYears);
  // An unusable input yields no settlement at all: a ₹0 total would read as a
  // legitimate finding on a statement an employee may act on.
  const settlementInvalid = gratuityResult.invalid;
  const leaveEncashment = Math.max(0, Math.round((basicSalary / 30) * Math.min(unusedLeaves, 30)));

  let noticePay = 0;
  let retrenchmentComp = 0;
  if (tenureYears !== null && !settlementInvalid && separationType === 'retrenchment') {
    noticePay = Math.max(0, Math.round(basicSalary)); // 1 month notice in lieu
    retrenchmentComp = Math.max(0, Math.round((15 * basicSalary * tenureYears) / 30)); // 15 days avg pay/yr
  }

  const totalSettlement = Math.max(
    0,
    (settlementInvalid ? 0 : gratuityResult.gratuity) + leaveEncashment + noticePay + retrenchmentComp
  );

  return (
    <div className="section-stack">
      <div className="omni-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-2)' }}>
          <ShieldCheck size={22} className="text-primary" />
          <h3 className="omni-card-title" style={{ fontSize: 'var(--fs-xl)' }}>
            Statutory End of Service Benefits (Gratuity & Final Settlement Engine)
          </h3>
        </div>
        <p className="prose" style={{ marginBottom: 'var(--space-5)' }}>
          Strict legal compliance with the <strong>Payment of Gratuity Act 1972</strong> and Indian Industrial Disputes Act (Section 25F).
        </p>

        {/* Input Form */}
        <div className="grid grid--form">
          <div className="omni-field">
            <label className="omni-label" htmlFor="settle-staff">Select Staff Member:</label>
            <select 
              id="settle-staff"
              className="omni-select"
              style={{ width: '100%' }}
              value={selectedEmpId}
              onChange={(e) => handleSelectEmployee(e.target.value)}
            >
              <option value="">-- Choose Profile --</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.id} • {e.department})</option>
              ))}
            </select>
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="settle-basic">Last Drawn Basic Salary (₹):</label>
            <input 
              id="settle-basic"
              type="number"
              min={0}
              className="omni-input"
              style={{ width: '100%' }}
              value={basicSalary}
              onChange={(e) => setBasicSalary(Math.max(0, Number(e.target.value)))}
            />
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="settle-tenure">Completed Service Tenure (Years):</label>
            <input 
              id="settle-tenure"
              type="number"
              min={0}
              step="0.1"
              className="omni-input"
              style={{ width: '100%' }}
              value={tenureYears ?? ''}
              onChange={(e) => setTenureYears(Math.max(0, Number(e.target.value)))}
            />
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="settle-leaves">Accumulated Leaves (Max 30 Days):</label>
            <input 
              id="settle-leaves"
              type="number"
              min={0}
              className="omni-input"
              style={{ width: '100%' }}
              value={unusedLeaves}
              onChange={(e) => setUnusedLeaves(Math.max(0, Number(e.target.value)))}
            />
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="settle-separation">Separation Category:</label>
            <select
              id="settle-separation"
              className="omni-select"
              style={{ width: '100%' }}
              value={separationType}
              onChange={(e) => setSeparationType(e.target.value as any)}
            >
              <option value="resignation">Voluntary Resignation (Notice Served)</option>
              <option value="retrenchment">Involuntary Layoff / Retrenchment (Employer Terminated)</option>
            </select>
          </div>
        </div>

        <button 
          onClick={() => setHasCalculated(true)}
          className="btn btn-primary"
          style={{ marginTop: 'var(--space-5)' }}
        >
          <Calculator size={16} /> Compute Statutory Settlement
        </button>

        {/* Calculation Result Breakdown */}
        {hasCalculated && !settlementInvalid && (
          <div className="settlement">
            <h4 className="omni-card-title">
              Official Final Settlement Statement
            </h4>
            
            <div className="grid grid--half" style={{ gap: 'var(--gap-tight)', marginTop: 'var(--space-3)' }}>
              <div>
                <span className="text-muted">Statutory Gratuity (Tenure: {tenureYears} yrs &rarr; Rounded: <strong>{gratuityResult.roundedTenure} yrs</strong>):</span>
                <div className={`settlement__line${gratuityResult.eligible ? '' : ' settlement__line--void'}`}>
                  ₹{formatINR(gratuityResult.gratuity)} 
                  {!gratuityResult.eligible && (
                    <span className="settlement__flag">
                      (Tenure &lt; 5 years; Not legally eligible)
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-muted">Privilege Leave Encashment ({Math.min(unusedLeaves, 30)} days):</span>
                <div className="settlement__line">
                  ₹{formatINR(leaveEncashment)}
                </div>
              </div>

              {separationType === 'retrenchment' && (
                <>
                  <div>
                    <span className="text-muted">1-Month Notice Period Pay (Layoff in lieu):</span>
                    <div className="settlement__line">
                      ₹{formatINR(noticePay)}
                    </div>
                  </div>

                  <div>
                    <span className="text-muted">Retrenchment Compensation (Sec 25F ID Act):</span>
                    <div className="settlement__line">
                      ₹{formatINR(retrenchmentComp)}
                    </div>
                  </div>
                </>
              )}
            </div>

            <hr className="rule" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <span className="text-dim" style={{ fontSize: 'var(--fs-sm)' }}>
                Payment of Gratuity Statutory Cap Applied: ₹20,00,000
              </span>
              <div style={{ textAlign: 'right' }}>
                <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>Total Settlement Disbursable</span>
                <div className="settlement__total">
                  ₹{formatINR(totalSettlement)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Withheld panel: an unusable input must not print a ₹0 settlement. */}
        {hasCalculated && settlementInvalid && (
          <div className="settlement">
            <h4 className="omni-card-title">
              Official Final Settlement Statement
            </h4>

            <div className="settlement__line settlement__line--void" style={{ display: 'block' }}>
              Enter a valid basic salary and date of joining
              <span className="settlement__flag">
                No settlement can be stated: the tenure or basic salary on this profile could not be read.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
