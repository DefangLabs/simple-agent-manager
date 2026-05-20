import type { SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={`w-full min-h-11 rounded-sm border border-[rgba(34,197,94,0.10)] bg-[rgba(8,15,12,0.5)] text-fg-primary py-2.5 px-3 text-[0.95rem] transition-[border-color,box-shadow] duration-150 ease-in-out hover:border-[rgba(34,197,94,0.18)] focus:border-[rgba(34,197,94,0.35)] focus:shadow-[0_0_0_3px_rgba(34,197,94,0.10)] focus:outline-none ${className ?? ''}`}
      {...props}
    />
  );
}
