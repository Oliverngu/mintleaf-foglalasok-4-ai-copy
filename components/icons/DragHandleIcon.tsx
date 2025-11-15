import React from 'react';

const DragHandleIcon: React.FC<{ className?: string }> = ({ className = "h-5 w-5" }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    fill="currentColor" 
    viewBox="0 0 20 20" 
  >
    <circle cx="7" cy="5" r="1.5" />
    <circle cx="13" cy="5" r="1.5" />
    <circle cx="7" cy="10" r="1.5" />
    <circle cx="13" cy="10" r="1.5" />
    <circle cx="7" cy="15" r="1.5" />
    <circle cx="13" cy="15" r="1.5" />
  </svg>
);

export default DragHandleIcon;
