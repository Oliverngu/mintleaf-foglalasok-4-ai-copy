import React from 'react';

const MoneyIcon: React.FC<{ className?: string }> = ({ className = "h-10 w-10" }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    fill="none" 
    viewBox="0 0 24 24" 
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6.75 6.75 0 000-13.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75a9 9 0 100 18 9 9 0 000-18z" />
  </svg>
);

export default MoneyIcon;