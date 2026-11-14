import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PayComponent, PayComponentBasis } from '../types';

/**
 * The earning-component editor shared by the Payslip Designer's two working
 * areas (design §6.1).
 *
 * A structure is an ORDERED list of components, so the editor edits the list in
 * place: each row edits one component, the Basic radio moves the Basic mark
 * (there is exactly one, and validation refuses a draft without it), and the
 * remove button takes a row out. The editor itself validates nothing - the
 * draft is validated by `validatePayStructure` at the page level so an
 * incomplete draft can sit on screen while HR works on it, with the errors
 * listed next to the Save button.
 *
 * Bases are named the way HR reads them, not the way the union is spelt:
 * "% of Monthly CTC", "% of Basic", "Fixed ₹" and "Remainder of CTC". The
 * Remainder's value input is disabled because the value is ignored - its
 * amount is whatever CTC is left after the other earnings.
 *
 * Rows use the console's `omni-field`/`omni-label` pairing (same as every form
 * on the page), so a phone that stacks the grid keeps every input named.
 * `idPrefix` keeps the ids and the Basic radio group name apart when the
 * company editor and the override editor sit on one page.
 */

const BASIS_OPTIONS: { value: PayComponentBasis; label: string }[] = [
  { value: 'PercentOfCTC', label: '% of Monthly CTC' },
  { value: 'PercentOfBasic', label: '% of Basic' },
  { value: 'Fixed', label: 'Fixed ₹' },
  { value: 'Remainder', label: 'Remainder of CTC' },
];

export interface PayComponentEditorProps {
  components: PayComponent[];
  onChange: (next: PayComponent[]) => void;
  /**
   * Prefix for the per-row input ids and the Basic radio group name, so the
   * company editor and the override editor can sit on one page without their
   * radios and labels colliding.
   */
  idPrefix: string;
}

export const PayComponentEditor: React.FC<PayComponentEditorProps> = ({
  components,
  onChange,
  idPrefix,
}) => {
  const patchComponent = (index: number, patch: Partial<PayComponent>) => {
    onChange(components.map((component, i) => (i === index ? { ...component, ...patch } : component)));
  };

  const markBasic = (index: number) => {
    onChange(
      components.map((component, i) => {
        if (i === index) return { ...component, isBasic: true };
        // `undefined` rather than `false` keeps an unmarked component's shape
        // exactly as the model documents it (`isBasic?`).
        const { isBasic: _dropped, ...rest } = component;
        void _dropped;
        return rest as PayComponent;
      }),
    );
  };

  const removeComponent = (index: number) => {
    onChange(components.filter((_, i) => i !== index));
  };

  const addComponent = () => {
    // Ids must be unique even mid-draft: the validation errors name duplicates,
    // and a fresh row should never be born already in error. Walk the numbered
    // ids until one is free of the CURRENT list.
    const used = new Set(components.map((component) => component.id));
    let n = components.length + 1;
    let id = `component-${n}`;
    while (used.has(id)) {
      n += 1;
      id = `component-${n}`;
    }
    // A new row is a silent ₹0 Fixed line: it changes nothing until HR names
    // and prices it, which is the safest starting point a draft can have.
    onChange([...components, { id, name: '', basis: 'Fixed', value: 0 }]);
  };

  return (
    <div className="designer-editor">
      <div className="designer-rows">
        {components.map((component, index) => {
          const idBase = `${idPrefix}-row-${index}`;
          const rowName = component.name || 'unnamed component';
          return (
            <div className="designer-row" key={`${idBase}-${component.id}`}>
              <div className="omni-field designer-row__name">
                <label className="omni-label" htmlFor={`${idBase}-name`}>
                  Component {index + 1} name
                </label>
                <input
                  id={`${idBase}-name`}
                  type="text"
                  className="omni-input"
                  value={component.name}
                  placeholder={component.basis === 'Remainder' ? 'e.g. Special Allowance' : 'e.g. Basic Salary'}
                  onChange={(e) => patchComponent(index, { name: e.target.value })}
                />
              </div>
              <div className="omni-field designer-row__basis">
                <label className="omni-label" htmlFor={`${idBase}-basis`}>
                  Basis
                </label>
                <select
                  id={`${idBase}-basis`}
                  className="omni-select"
                  value={component.basis}
                  onChange={(e) => patchComponent(index, { basis: e.target.value as PayComponentBasis })}
                >
                  {BASIS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="omni-field designer-row__value">
                <label className="omni-label" htmlFor={`${idBase}-value`}>
                  Value
                </label>
                <input
                  id={`${idBase}-value`}
                  type="number"
                  className="omni-input"
                  min={0}
                  step="any"
                  value={Number.isFinite(component.value) ? component.value : 0}
                  disabled={component.basis === 'Remainder'}
                  title={
                    component.basis === 'Remainder'
                      ? 'The remainder takes whatever CTC is left; it has no value of its own'
                      : component.basis === 'Fixed'
                        ? 'Rupees per month'
                        : 'Percent'
                  }
                  onChange={(e) => patchComponent(index, { value: Number(e.target.value) })}
                />
              </div>
              <div className="omni-field designer-row__basic">
                <label className="omni-label" htmlFor={`${idBase}-basic`}>
                  Basic
                </label>
                <input
                  id={`${idBase}-basic`}
                  type="radio"
                  name={`${idPrefix}-basic`}
                  checked={component.isBasic === true}
                  onChange={() => markBasic(index)}
                  title="Mark this component as the Basic component"
                />
              </div>
              <div className="omni-field designer-row__remove">
                <span className="omni-label" aria-hidden="true">
                  Remove
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => removeComponent(index)}
                  aria-label={`Remove row ${index + 1} (${rowName})`}
                  title="Remove this earning component"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="designer-editor__foot">
        <button type="button" className="btn btn-secondary btn-sm" onClick={addComponent}>
          <Plus size={14} aria-hidden="true" /> Add earning component
        </button>
        <span className="designer-hint">
          Percent bases price off Monthly CTC or Basic; Fixed is rupees; the Remainder line takes
          the rest of the CTC.
        </span>
      </div>
    </div>
  );
};
