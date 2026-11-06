import React from 'react';

interface CentralLogoProps {
  className?: string;
  size?: number;
}

export const CentralLogo: React.FC<CentralLogoProps> = ({ className = 'w-10 h-10', size }) => {
  const style = size ? { width: size, height: size } : undefined;

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`} style={style}>
      <svg
        viewBox="0 0 320 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-xs"
      >
        <defs>
          <path
            id="curve-top"
            d="M 52 160 A 108 108 0 0 1 268 160"
          />
          <path
            id="curve-bottom"
            d="M 268 160 A 108 108 0 0 1 52 160"
          />
        </defs>

        {/* Outer Black Ring */}
        <circle cx="160" cy="160" r="150" fill="#1A1817" stroke="#ECE3D6" strokeWidth="2.5" />

        {/* Inner Green Circle */}
        <circle cx="160" cy="160" r="115" fill="#145A32" />

        {/* Inner decorative dotted/thin ring */}
        <circle cx="160" cy="160" r="112" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="3 3" fill="none" />

        {/* Top Text: PIZZAS & */}
        <text
          fill="#FFFFFF"
          fontSize="24"
          fontFamily="'Playfair Display', Georgia, serif"
          fontWeight="bold"
          letterSpacing="4"
        >
          <textPath href="#curve-top" startOffset="50%" textAnchor="middle">
            PIZZAS &amp;
          </textPath>
        </text>

        {/* Bottom Text: EMPANADAS */}
        <text
          fill="#FFFFFF"
          fontSize="24"
          fontFamily="'Playfair Display', Georgia, serif"
          fontWeight="bold"
          letterSpacing="4"
        >
          <textPath href="#curve-bottom" startOffset="50%" textAnchor="middle">
            EMPANADAS
          </textPath>
        </text>

        {/* Central Green Ribbon */}
        <rect
          x="18"
          y="126"
          width="284"
          height="68"
          rx="4"
          fill="#0E4424"
          stroke="#FFFFFF"
          strokeWidth="2"
        />

        {/* CENTRAL Wordmark */}
        <text
          x="160"
          y="172"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="36"
          fontFamily="'Playfair Display', Georgia, serif"
          fontWeight="800"
          letterSpacing="6"
        >
          CENTRAL
        </text>

        {/* Mustache icon in red with white outline */}
        <g transform="translate(160, 218) scale(0.9)">
          <path
            d="M 0,-4 
               C 8,-18 32,-18 44,-2
               C 48,4 40,12 28,10
               C 18,8 8,2 0,0
               C -8,2 -18,8 -28,10
               C -40,12 -48,4 -44,-2
               C -32,-18 -8,-18 0,-4 Z"
            fill="#C8232B"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
};
