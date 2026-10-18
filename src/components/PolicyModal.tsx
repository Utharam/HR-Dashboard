import React, { useId, useState } from 'react';
import { X, Sparkles, Plus, Gift, Check } from 'lucide-react';
import type { HRPolicy, PolicyCategory } from '../types';
import { Dialog } from './Dialog';
import { 
  MATERNAL_GIFT_PRESETS, 
  PATERNAL_GIFT_PRESETS, 
  MARRIAGE_GIFT_PRESETS, 
  SABBATICAL_PROVISION_PRESETS, 
  GENERAL_PERK_PRESETS 
} from '../data/initialPolicies';

const ALL_GIFT_PRESETS = [
  'None',
  ...MATERNAL_GIFT_PRESETS.filter(g => g !== 'None'),
  ...PATERNAL_GIFT_PRESETS.filter(g => g !== 'None'),
  ...MARRIAGE_GIFT_PRESETS.filter(g => g !== 'None'),
  ...SABBATICAL_PROVISION_PRESETS.filter(g => g !== 'None'),
  ...GENERAL_PERK_PRESETS,
  'Custom (Type Below)'
];

/** `<select>` values are strings; these guards narrow them without asserting. */
const POLICY_CATEGORIES: ReadonlyArray<PolicyCategory> = [
  'Parental Provisions',
  'Leave & Quotas',
  'Separation & Notice',
  'Extended & Sabbatical',
  'Wellness & Special Perks',
  'Custom Rules',
];
const isPolicyCategory = (value: string): value is PolicyCategory =>
  (POLICY_CATEGORIES as readonly string[]).includes(value);

const TIME_UNITS: ReadonlyArray<HRPolicy['timeUnit']> = ['Days', 'Weeks', 'Months'];
const isTimeUnit = (value: string): value is HRPolicy['timeUnit'] =>
  (TIME_UNITS as readonly string[]).includes(value);

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePolicy: (policy: HRPolicy) => void;
  policyToEdit?: HRPolicy | null;
}

interface PolicyFormProps {
  onClose: () => void;
  onSavePolicy: (policy: HRPolicy) => void;
  policyToEdit?: HRPolicy | null;
  /** Owned by `PolicyModal` so two policy dialogs cannot share one `aria-labelledby`. */
  titleId: string;
}

const PolicyForm: React.FC<PolicyFormProps> = ({
  onClose,
  onSavePolicy,
  policyToEdit,
  titleId
}) => {
  const isEditing = !!policyToEdit;

  const [title, setTitle] = useState(policyToEdit?.title || '');
  const [category, setCategory] = useState<PolicyCategory>(policyToEdit?.category || 'Custom Rules');
  const [shortDesc, setShortDesc] = useState(policyToEdit?.shortDesc || '');
  const [daysAllowed, setDaysAllowed] = useState(policyToEdit ? policyToEdit.daysAllowed : 10);
  const [timeUnit, setTimeUnit] = useState<'Days' | 'Weeks' | 'Months'>(policyToEdit?.timeUnit || 'Days');
  const [isPaid, setIsPaid] = useState(policyToEdit ? policyToEdit.isPaid : true);

  const initialGift = policyToEdit?.giftOrPerk || 'None';
  const isInitialInPresets = ALL_GIFT_PRESETS.includes(initialGift);

  const [selectedGift, setSelectedGift] = useState(isInitialInPresets ? initialGift : 'Custom (Type Below)');
  const [customGiftInput, setCustomGiftInput] = useState(isInitialInPresets ? '' : initialGift);
  const [eligibility, setEligibility] = useState(policyToEdit?.eligibility || 'All full-time confirmed and probationary staff.');
  const [statutoryRef, setStatutoryRef] = useState(policyToEdit?.statutoryReference || (isEditing ? '' : 'Internal Corporate Governance & People Ops Policy'));
  const [rulesText, setRulesText] = useState(
    policyToEdit ? policyToEdit.rules.join('\n') : '1. Applies uniformly across all corporate office locations and remote staff.\n2. Must be submitted electronically via HR portal with minimum 3 days advance notice.\n3. Requires approval from Department Head and People Operations.'
  );
  const [isActive, setIsActive] = useState(policyToEdit ? policyToEdit.isActive : true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let finalGift = selectedGift;
    if (selectedGift === 'Custom (Type Below)' || !selectedGift) {
      finalGift = customGiftInput.trim() || 'None';
    }

    const rules = rulesText
      .split('\n')
      .map(r => r.trim())
      .filter(r => r.length > 0);

    const savedPolicy: HRPolicy = {
      id: policyToEdit ? policyToEdit.id : `POL-CST-${Date.now().toString().slice(-4)}`,
      title: title.trim(),
      category,
      shortDesc: shortDesc.trim() || `${title} guidelines and operational provisions.`,
      daysAllowed: Number(daysAllowed) || 0,
      timeUnit,
      isPaid,
      giftOrPerk: finalGift,
      giftOptions: policyToEdit?.giftOptions || ALL_GIFT_PRESETS.filter(g => g !== 'Custom (Type Below)'),
      eligibility: eligibility.trim() || 'All staff members.',
      statutoryReference: statutoryRef.trim() || undefined,
      rules: rules.length > 0 ? rules : ['Standard company policies apply.'],
      isActive,
      isCustom: policyToEdit ? policyToEdit.isCustom : true
    };

    onSavePolicy(savedPolicy);
    onClose();
  };

  return (
    <>
      <button 
        onClick={onClose}
        aria-label="Close"
        className="modal-close"
      >
        <X size={20} aria-hidden="true" />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', paddingRight: 'var(--space-10)' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: 'var(--r-lg)',
          background: 'var(--primary-glow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Sparkles size={20} className="text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 id={titleId} className="omni-card-title" style={{ fontSize: 'var(--fs-2xl)' }}>
            {isEditing ? 'Edit HR Policy & Provisions' : 'Create Custom HR Policy / Rule'}
          </h2>
          <p className="omni-card-sub">
            Configure leave quotas, family benefits, gifts, notice terms, or unique corporate rules.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Policy Title */}
        <div className="omni-field">
          <label className="omni-label" htmlFor="policy-title">
            Policy Title / Provision Name:
          </label>
          <input 
            id="policy-title"
            type="text" 
            required
            className="omni-input" 
            placeholder="E.g. Menstrual Wellness Leave, Relocation Grant, Higher Education Sabbatical..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Category & Paid Status */}
        <div className="grid grid--form-2" style={{ gap: '14px' }}>
          <div className="omni-field">
            <label className="omni-label" htmlFor="policy-category">
              Category:
            </label>
            <select 
              id="policy-category"
              className="omni-select" 
              value={category}
              onChange={(e) => {
                if (isPolicyCategory(e.target.value)) setCategory(e.target.value);
              }}
            >
              <option value="Parental Provisions">Parental Provisions (Maternal / Paternal)</option>
              <option value="Leave & Quotas">Leave & Quotas (CL, SL, EL, Comp-Off)</option>
              <option value="Separation & Notice">Separation & Notice Period</option>
              <option value="Extended & Sabbatical">Extended & Sabbatical</option>
              <option value="Wellness & Special Perks">Wellness & Special Perks</option>
              <option value="Custom Rules">Custom Rules</option>
            </select>
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="policy-comp">
              Compensation Type:
            </label>
            <select 
              id="policy-comp"
              className="omni-select" 
              value={isPaid ? 'paid' : 'unpaid'}
              onChange={(e) => setIsPaid(e.target.value === 'paid')}
            >
              <option value="paid">100% Fully Paid (Salary Retained)</option>
              <option value="unpaid">Unpaid / Leave of Absence</option>
            </select>
          </div>
        </div>

        {/* Days Allowed & Time Unit */}
        <div className="grid grid--form-2" style={{ gap: '14px' }}>
          <div className="omni-field">
            <label className="omni-label" htmlFor="policy-days">
              Duration / Quota Limit:
            </label>
            <input 
              id="policy-days"
              type="number" 
              required
              min={0}
              max={999}
              className="omni-input" 
              placeholder="15"
              value={daysAllowed}
              onChange={(e) => setDaysAllowed(Number(e.target.value))}
            />
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="policy-unit">
              Time Unit:
            </label>
            <select 
              id="policy-unit"
              className="omni-select" 
              value={timeUnit}
              onChange={(e) => {
                if (isTimeUnit(e.target.value)) setTimeUnit(e.target.value);
              }}
            >
              <option value="Days">Days</option>
              <option value="Weeks">Weeks</option>
              <option value="Months">Months</option>
            </select>
          </div>
        </div>

        {/* Gift / Perk / Allowance with full options list */}
        <div className="inset-panel" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-micro)', marginBottom: 'var(--space-2)' }}>
            <Gift size={16} className="text-primary" />
            <label className="omni-label" htmlFor="policy-gift" style={{ color: 'var(--text-main)', fontSize: 'var(--fs-sm)' }}>
              Corporate Gift / Family Perk / Allowance (Choose from list or customize):
            </label>
          </div>

          <select 
            id="policy-gift"
            className="omni-select" 
            style={{ marginBottom: selectedGift === 'Custom (Type Below)' ? '10px' : '0' }}
            value={selectedGift}
            onChange={(e) => setSelectedGift(e.target.value)}
          >
            {ALL_GIFT_PRESETS.map((g, idx) => (
              <option key={idx} value={g} title={g}>{g}</option>
            ))}
          </select>

          {selectedGift === 'Custom (Type Below)' && (
            <input 
              type="text" 
              className="omni-input" 
              placeholder="Type custom gift, stipend, wellness package, or hamper..."
              value={customGiftInput}
              onChange={(e) => setCustomGiftInput(e.target.value)}
            />
          )}
        </div>

        {/* Eligibility & Statutory Reference */}
        <div className="grid grid--form-2" style={{ gap: '14px' }}>
          <div className="omni-field">
            <label className="omni-label" htmlFor="policy-elig">
              Eligibility Criteria:
            </label>
            <input 
              id="policy-elig"
              type="text" 
              className="omni-input" 
              placeholder="E.g. All permanent staff with >= 1 yr tenure"
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
            />
          </div>

          <div className="omni-field">
            <label className="omni-label" htmlFor="policy-statute">
              Statutory / Legal Reference:
            </label>
            <input 
              id="policy-statute"
              type="text" 
              className="omni-input" 
              placeholder="E.g. Maternity Benefit Act, Factories Act..."
              value={statutoryRef}
              onChange={(e) => setStatutoryRef(e.target.value)}
            />
          </div>
        </div>

        {/* Summary description */}
        <div className="omni-field">
          <label className="omni-label" htmlFor="policy-desc">
            Summary Objective:
          </label>
          <input 
            id="policy-desc"
            type="text" 
            className="omni-input" 
            placeholder="Brief 1-line description of the policy scope..."
            value={shortDesc}
            onChange={(e) => setShortDesc(e.target.value)}
          />
        </div>

        {/* Detailed Rules Clauses */}
        <div className="omni-field">
          <label className="omni-label" htmlFor="policy-rules">
            Policy Terms & Bulleted Clauses (One per line):
          </label>
          <textarea 
            id="policy-rules"
            className="omni-input" 
            style={{ minHeight: '100px' }}
            placeholder="Enter rule terms line-by-line..."
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
          />
        </div>

        {/* Active Status Checkbox */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input 
            type="checkbox" 
            id="policyActiveCheck"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
          />
          <label htmlFor="policyActiveCheck" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-main)', cursor: 'pointer' }}>
            Policy is actively enforced in the organization
          </label>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 'var(--space-2)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {isEditing ? <Check size={16} /> : <Plus size={16} />}
            {isEditing ? 'Save Policy Changes' : 'Create Policy / Rule'}
          </button>
        </div>
      </form>
    </>
  );
};

export const PolicyModal: React.FC<PolicyModalProps> = ({
  isOpen,
  onClose,
  onSavePolicy,
  policyToEdit
}) => {
  // The form keeps its own `key` so that switching between policies re-runs its state
  // initialisers. The scrim and the focus lifecycle belong to `Dialog`, which stays
  // mounted either side of the open edge so it can capture and restore the opener.
  //
  // The heading id is minted here rather than in `PolicyForm` and passed down, because
  // `PolicyForm` is remounted whenever the edited policy changes while `Dialog` is not. A
  // literal would also be wrong the moment a second policy dialog existed: `aria-labelledby`
  // resolves to the first matching id in the document, so both would announce the first title.
  const titleId = useId();

  return (
    <Dialog isOpen={isOpen} onClose={onClose} labelledBy={titleId} className="modal-window--narrow">
      <PolicyForm 
        key={policyToEdit?.id || 'new_policy'}
        onClose={onClose}
        onSavePolicy={onSavePolicy}
        policyToEdit={policyToEdit}
        titleId={titleId}
      />
    </Dialog>
  );
};
