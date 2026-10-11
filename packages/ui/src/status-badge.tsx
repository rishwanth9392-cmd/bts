const colorMap = {
  success: 'bg-status-success-bg text-status-success ring-status-success/20',
  warning: 'bg-status-warning-bg text-status-warning ring-status-warning/20',
  danger: 'bg-status-danger-bg text-status-danger ring-status-danger/20',
  info: 'bg-status-info-bg text-status-info ring-status-info/20',
  neutral: 'bg-status-neutral-bg text-status-neutral ring-status-neutral/20',
};

interface StatusBadgeProps {
  status: string;
  color?: keyof typeof colorMap;
  className?: string;
}

export function StatusBadge({ status, color = 'neutral', className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${colorMap[color]} ${className}`}
    >
      {status}
    </span>
  );
}
