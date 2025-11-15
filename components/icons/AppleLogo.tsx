import React from 'react';
import { mintLeafLogoSvgDataUri } from '../../data/mockData';

const MintLeafLogo: React.FC<{ className?: string }> = ({ className = "h-12 w-12" }) => (
  <img 
    src={mintLeafLogoSvgDataUri}
    alt="MintLeaf Logo"
    className={className}
  />
);

export default MintLeafLogo;