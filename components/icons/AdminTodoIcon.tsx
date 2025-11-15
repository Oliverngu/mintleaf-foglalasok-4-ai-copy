import React from 'react';

const AdminTodoIcon: React.FC<{ className?: string }> = ({ className = "h-10 w-10" }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    fill="none" 
    viewBox="0 0 24 24" 
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21.75c2.426 0 4.712-.803 6.5-2.25V6.326a2.25 2.25 0 00-1.24-2.013L13.25 2.5a2.25 2.25 0 00-2.5 0L6.74 4.313A2.25 2.25 0 005.5 6.326v13.174c1.788 1.447 4.074 2.25 6.5 2.25z" />
  </svg>
);

export default AdminTodoIcon;