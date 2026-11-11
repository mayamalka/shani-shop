import type { PageOptionDTO } from '@shani/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NAME_RULE_MESSAGE, sanitizeName } from '@shani/shared';
import { Combobox, filterOptions } from './Combobox';
import { PagePicker } from './PagePicker';
import { ErrorSummary, PriceTag, QuantityStepper, TextField } from './ui';

describe('PriceTag', () => {
  it('shows a regular price', () => {
    render(<PriceTag price={30000} />);
    expect(screen.getByText(/300/)).toBeInTheDocument();
    expect(document.querySelector('s')).toBeNull();
  });
  it('discount: old price struck through + new price, both red, with screen-reader words', () => {
    render(<PriceTag price={30000} discountPrice={27000} />);
    const old = document.querySelector('s')!;
    expect(old).toHaveTextContent('300');
    expect(old).toHaveClass('text-sale');
    expect(screen.getByText('מחיר מבצע:', { exact: false })).toHaveClass('sr-only');
    expect(screen.getByText(/270/).closest('span')).toHaveClass('text-sale');
  });
  it('expired discount → regular price only', () => {
    render(<PriceTag price={30000} discountPrice={27000} discountEndsAt="2020-01-01T00:00:00Z" />);
    expect(document.querySelector('s')).toBeNull();
  });
  it('"from" price for the custom book', () => {
    render(<PriceTag price={30000} from />);
    expect(screen.getByText(/החל מ/)).toBeInTheDocument();
  });
});

describe('QuantityStepper', () => {
  function Harness() {
    const [n, setN] = useState(1);
    return <QuantityStepper value={n} onChange={setN} label="כמות" max={3} />;
  }
  it('goes up to the max and not below 1', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const plus = screen.getByRole('button', { name: 'הוספת יחידה' });
    const minus = screen.getByRole('button', { name: 'הפחתת יחידה' });
    expect(minus).toBeDisabled();
    await user.click(plus);
    await user.click(plus);
    expect(screen.getByRole('group', { name: 'כמות' })).toHaveTextContent('3');
    expect(plus).toBeDisabled();
  });
});

describe('form fields are accessible', () => {
  it('label, required and error are wired to the input', () => {
    render(<TextField label="שם הילד/ה" required error="יש למלא את שם הילד/ה" />);
    const input = screen.getByLabelText(/שם הילד/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('יש למלא את שם הילד/ה');
  });
  it('error summary lists every problem as an alert', () => {
    render(<ErrorSummary errors={{ a: 'שגיאה א', b: 'שגיאה ב' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('2 שדות');
  });
});

const pages: PageOptionDTO[] = [
  { id: '1', title: 'משפחה', summary: 's', minAge: 1, maxAge: 5, imageUrl: null, active: true, sortOrder: 0 },
  { id: '2', title: 'רכב', summary: 's', minAge: 3, maxAge: 5, imageUrl: null, active: true, sortOrder: 1 },
  { id: '3', title: 'דגים', summary: 's', minAge: 1, maxAge: 2, imageUrl: null, active: true, sortOrder: 2 },
];

describe('PagePicker', () => {
  function Harness({ max }: { max: number }) {
    const [sel, setSel] = useState<string[]>([]);
    return (
      <>
        <PagePicker pages={pages} selected={sel} onChange={setSel} max={max} />
        <output data-testid="sel">{sel.join(',')}</output>
      </>
    );
  }
  it('selects pages with checkboxes and stops at the maximum', async () => {
    const user = userEvent.setup();
    render(<Harness max={2} />);
    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[0]!);
    await user.click(boxes[1]!);
    expect(screen.getByTestId('sel')).toHaveTextContent('1,2');
    expect(boxes[2]).toBeDisabled();
    await user.click(boxes[0]!);
    expect(boxes[2]).toBeEnabled();
  });
  it('filters by age', async () => {
    const user = userEvent.setup();
    render(<Harness max={5} />);
    await user.click(screen.getByRole('button', { name: '4–5' }));
    expect(screen.queryByText('דגים')).toBeNull();
    expect(screen.getByText('רכב')).toBeInTheDocument();
  });
});

describe('TextField with a filter', () => {
  function Harness() {
    const [v, setV] = useState('');
    return <TextField label="שם" value={v} onChange={(e) => setV(e.target.value)} filter={sanitizeName} filterMessage={NAME_RULE_MESSAGE} />;
  }
  it('drops digits and symbols as you type and explains why', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('שם');
    await user.type(input, 'שני1<כהן>');
    expect(input).toHaveValue('שניכהן');
    expect(input).toHaveAccessibleDescription(NAME_RULE_MESSAGE);
  });
  it('accepts long Hebrew names', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('שם');
    await user.type(input, 'אוריאל-חיים בן דוד');
    expect(input).toHaveValue('אוריאל-חיים בן דוד');
  });
});

describe('Combobox', () => {
  const options = [
    { value: '4000', label: 'חיפה' },
    { value: '6500', label: 'חדרה' },
    { value: '7800', label: 'פרדס חנה-כרכור' },
  ];
  it('filters ignoring hyphens; startsWith first', () => {
    expect(filterOptions(options, 'פרדס חנה כרכור').map((o) => o.label)).toEqual(['פרדס חנה-כרכור']);
    expect(filterOptions(options, 'ח').map((o) => o.label)).toEqual(['חיפה', 'חדרה', 'פרדס חנה-כרכור']);
    const streets = ['גרינשפון הרצל', 'הרב הרצוג', 'הרצל', 'שד הרצל'].map((l) => ({ value: l, label: l }));
    expect(filterOptions(streets, 'הרצ').map((o) => o.label)).toEqual(['הרצל', 'גרינשפון הרצל', 'הרב הרצוג', 'שד הרצל']);
  });
  it('choose with the keyboard', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [v, setV] = useState('');
      return (
        <>
          <Combobox label="יישוב" options={options} value={v} onChange={(o) => setV(o?.value ?? '')} />
          <output data-testid="v">{v}</output>
        </>
      );
    }
    render(<Harness />);
    const box = screen.getByRole('combobox', { name: 'יישוב' });
    await user.type(box, 'חד');
    expect(screen.getByRole('listbox')).toBeVisible();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('v')).toHaveTextContent('6500');
    expect(box).toHaveValue('חדרה');
  });
});
