interface MetricValueProps {
  value: number;
  format?: (value: number) => string;
  className?: string;
}

function defaultFormat(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function MetricValue({ value, format = defaultFormat, className }: MetricValueProps) {
  const rootClass = [
    'inline-block whitespace-nowrap [font-variant-numeric:tabular-nums]',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={rootClass}>{format(value)}</span>;
}
