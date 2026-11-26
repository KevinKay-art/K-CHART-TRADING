import React from 'react';

interface LogoProps {
  compact?: boolean;
  className?: string;
}

export const KChartLogo: React.FC<LogoProps> = ({ compact = false, className = '' }) => {
  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="1"
          y="1"
          width="26"
          height="26"
          rx="6"
          className="fill-[#1E222D] stroke-[#2A2E39]"
          strokeWidth="1.5"
        />
        {/* Left candlestick stem forming the vertical bar of K */}
        <line x1="9" y1="5" x2="9" y2="23" stroke="#26A69A" strokeWidth="1.75" strokeLinecap="round" />
        <rect x="6.75" y="8" width="4.5" height="12" rx="1" fill="#26A69A" />
        {/* Upper diagonal candle wick + body */}
        <line x1="12.5" y1="14" x2="21" y2="6.5" stroke="#2962FF" strokeWidth="2.2" strokeLinecap="round" />
        {/* Lower diagonal bearish candle leg */}
        <line x1="12.5" y1="14" x2="21" y2="21.5" stroke="#EF5350" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="18" y="17.5" width="3.5" height="4" rx="0.8" fill="#EF5350" />
      </svg>
      {!compact && (
        <span className="font-bold tracking-tight text-sm text-[#0F172A] dark:text-[#F8FAFC] whitespace-nowrap">
          K-CHART <span className="text-[#2962FF]">VIEW</span>
        </span>
      )}
    </div>
  );
};
