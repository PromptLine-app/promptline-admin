type StatusBadgeProps = {
  status: string;
  label?: string;
};

export const StatusBadge = ({ status, label }: StatusBadgeProps) => {
  const normalizedStatus = status.toLowerCase();
  
  // Format the label if not provided (e.g. 'past_due' -> 'Past Due')
  const displayLabel = label || status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <span className={`status-badge status-badge--${normalizedStatus}`}>
      {displayLabel}
    </span>
  );
};
