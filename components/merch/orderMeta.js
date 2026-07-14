import { colors } from '../../lib/theme';

// Order lifecycle: new -> paid -> shipped (or cancelled at any point).
export const ORDER_STATUSES = ['new', 'paid', 'shipped', 'cancelled'];
export const ORDER_STATUS_LABEL = { new: 'New', paid: 'Paid', shipped: 'Shipped', cancelled: 'Cancelled' };

export function orderStatusColor(status) {
  return {
    new: colors.accent2,
    paid: colors.star,
    shipped: colors.success,
    cancelled: colors.textMute,
  }[status] ?? colors.textLo;
}

export function formatOrderDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.toLocaleDateString()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
