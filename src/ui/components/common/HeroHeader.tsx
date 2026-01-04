import React, { ReactNode } from 'react';

interface HeroHeaderProps {
  /** Background image URL that fills the container */
  imageUrl: string;
  /** Optional additional classes for the container */
  className?: string;
  /** Foreground content rendered above the overlay */
  children?: ReactNode;
}

/**
 * Hero/Header component with a strict 3-layer stack:
 * 1) Background image
 * 2) Texture overlay (leafy dapple)
 * 3) Foreground content
 */
const HeroHeader: React.FC<HeroHeaderProps> = ({ imageUrl, className = '', children }) => {
  return (
    <div className={`relative w-full h-64 overflow-hidden ${className}`}>
      <img
        src={imageUrl}
        alt="Header background"
        className="absolute inset-0 w-full h-full object-cover z-0"
      />

      <div className="absolute inset-0 overlay-leafy-dapple pointer-events-none z-10" />

      <div className="relative z-20 h-full w-full flex items-center justify-center p-6">
        {children}
      </div>
    </div>
  );
};

export default HeroHeader;
