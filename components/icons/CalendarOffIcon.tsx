import React from 'react';

const CalendarOffIcon: React.FC<{ className?: string }> = ({ className = "h-10 w-10" }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    fill="none" 
    viewBox="0 0 24 24" 
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 10.75L9.75 15.25" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 10.75L14.25 15.25" />
  </svg>
);

export default CalendarOffIcon;
