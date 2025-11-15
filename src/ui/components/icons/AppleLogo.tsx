import React from 'react';

const mintLeafLogoSvgDataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzM0RDM5OSIgZD0iTTUgMjFjLjUtNC41IDIuNS04IDctMTBNOSAxOGM2LjIxOCAwIDEwLjUtMy4yODIgMTEtMTJ2LTJoLTQuMDE0Yy05IDAtMTEuOTg2IDQtMTIgOWMwIDEgMCAzIDIgNWgzeiIgLz48L3N2Zz4=";

const MintLeafLogo: React.FC<{ className?: string }> = ({ className = "h-12 w-12" }) => (
  <img 
    src={mintLeafLogoSvgDataUri}
    alt="MintLeaf Logo"
    className={className}
  />
);

export default MintLeafLogo;
