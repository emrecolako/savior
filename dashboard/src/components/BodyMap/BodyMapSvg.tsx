interface BodyMapSvgProps {
  highlightedOrgans: Record<string, { color: string; intensity: number }>;
  onOrganClick: (organId: string) => void;
  onOrganHover: (organId: string | null) => void;
  selectedOrgan: string | null;
}

function OrganGroup({
  id,
  children,
  highlight,
  isSelected,
  onClick,
  onHover,
}: {
  id: string;
  children: React.ReactNode;
  highlight?: { color: string; intensity: number };
  isSelected: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
}) {
  const baseOpacity = highlight ? highlight.intensity * 0.6 : 0.04;
  const fill = highlight?.color ?? "#4b5563";
  return (
    <g
      data-organ={id}
      onClick={onClick}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: highlight ? "pointer" : "default" }}
    >
      <g
        style={{
          fill,
          opacity: isSelected ? 0.9 : baseOpacity,
          transition: "opacity 0.2s, fill 0.2s",
        }}
      >
        {children}
      </g>
      {isSelected && (
        <g style={{ fill: "none", stroke: fill, strokeWidth: 2, opacity: 0.8 }}>
          {children}
        </g>
      )}
    </g>
  );
}

export function BodyMapSvg({ highlightedOrgans, onOrganClick, onOrganHover, selectedOrgan }: BodyMapSvgProps) {
  const organ = (id: string) => ({
    highlight: highlightedOrgans[id],
    isSelected: selectedOrgan === id,
    onClick: () => onOrganClick(id),
    onHover: onOrganHover,
  });

  return (
    <svg viewBox="0 0 300 520" className="w-full max-w-[300px] mx-auto" xmlns="http://www.w3.org/2000/svg">
      {/* Body outline */}
      <g fill="none" stroke="#374151" strokeWidth="1.5" opacity="0.6">
        {/* Head */}
        <ellipse cx="150" cy="52" rx="32" ry="40" />
        {/* Neck */}
        <rect x="138" y="90" width="24" height="20" rx="4" />
        {/* Torso */}
        <path d="M100 110 Q90 110 85 130 L80 250 Q78 280 95 300 L105 310 Q110 315 110 325 L110 380 Q110 395 120 400 L130 405 Q140 408 150 408 Q160 408 170 405 L180 400 Q190 395 190 380 L190 325 Q190 315 195 310 L205 300 Q222 280 220 250 L215 130 Q210 110 200 110 Z" />
        {/* Left arm */}
        <path d="M85 130 Q65 135 55 160 L40 230 Q35 250 38 260 L42 270 Q48 280 55 275 L60 265 Q62 260 60 250 L65 200 Q68 185 72 175" />
        {/* Right arm */}
        <path d="M215 130 Q235 135 245 160 L260 230 Q265 250 262 260 L258 270 Q252 280 245 275 L240 265 Q238 260 240 250 L235 200 Q232 185 228 175" />
        {/* Left leg */}
        <path d="M110 380 L105 430 Q103 445 105 460 L108 500 Q110 515 120 515 L128 512 Q132 510 132 505 L130 470 Q128 455 130 440 L135 405" />
        {/* Right leg */}
        <path d="M190 380 L195 430 Q197 445 195 460 L192 500 Q190 515 180 515 L172 512 Q168 510 168 505 L170 470 Q172 455 170 440 L165 405" />
      </g>

      {/* Brain */}
      <OrganGroup id="brain" {...organ("brain")}>
        <ellipse cx="150" cy="45" rx="24" ry="28" />
      </OrganGroup>

      {/* Eyes */}
      <OrganGroup id="eyes" {...organ("eyes")}>
        <ellipse cx="139" cy="45" rx="6" ry="4" />
        <ellipse cx="161" cy="45" rx="6" ry="4" />
      </OrganGroup>

      {/* Lungs */}
      <OrganGroup id="lungs" {...organ("lungs")}>
        <path d="M112 135 Q105 140 102 160 L100 195 Q100 210 112 210 L128 208 Q132 207 132 200 L130 160 Q130 145 125 135 Z" />
        <path d="M188 135 Q195 140 198 160 L200 195 Q200 210 188 210 L172 208 Q168 207 168 200 L170 160 Q170 145 175 135 Z" />
      </OrganGroup>

      {/* Heart */}
      <OrganGroup id="heart" {...organ("heart")}>
        <path d="M140 155 Q135 148 140 142 Q145 136 150 142 Q155 136 160 142 Q165 148 160 155 L150 170 Z" />
      </OrganGroup>

      {/* Liver */}
      <OrganGroup id="liver" {...organ("liver")}>
        <path d="M155 195 Q160 192 175 192 Q195 193 200 200 Q205 208 200 215 L180 220 Q165 222 155 218 Q148 214 150 205 Z" />
      </OrganGroup>

      {/* Stomach / Digestive */}
      <OrganGroup id="stomach" {...organ("stomach")}>
        <path d="M125 200 Q118 205 118 215 Q118 228 128 232 L140 234 Q148 235 148 228 L145 212 Q143 203 135 200 Z" />
      </OrganGroup>

      {/* Pancreas */}
      <OrganGroup id="pancreas" {...organ("pancreas")}>
        <path d="M125 238 Q130 234 145 236 Q165 238 175 235 Q180 233 182 236 Q180 240 170 242 Q155 244 140 243 Q128 242 125 238 Z" />
      </OrganGroup>

      {/* Kidneys */}
      <OrganGroup id="kidneys" {...organ("kidneys")}>
        <ellipse cx="115" cy="230" rx="8" ry="14" />
        <ellipse cx="185" cy="230" rx="8" ry="14" />
      </OrganGroup>

      {/* Blood - circulatory hint */}
      <OrganGroup id="blood" {...organ("blood")}>
        <line x1="150" y1="170" x2="150" y2="300" strokeWidth="3" stroke="currentColor" />
        <line x1="150" y1="140" x2="120" y2="175" strokeWidth="2" stroke="currentColor" />
        <line x1="150" y1="140" x2="180" y2="175" strokeWidth="2" stroke="currentColor" />
      </OrganGroup>

      {/* Immune - lymph nodes */}
      <OrganGroup id="immune" {...organ("immune")}>
        <circle cx="130" cy="105" r="4" />
        <circle cx="170" cy="105" r="4" />
        <circle cx="95" cy="145" r="4" />
        <circle cx="205" cy="145" r="4" />
        <circle cx="125" cy="300" r="4" />
        <circle cx="175" cy="300" r="4" />
      </OrganGroup>

      {/* Bones - skeleton hint */}
      <OrganGroup id="bones" {...organ("bones")}>
        <line x1="150" y1="110" x2="150" y2="130" strokeWidth="4" stroke="currentColor" />
        <path d="M110 135 L190 135" strokeWidth="3" stroke="currentColor" fill="none" />
        <line x1="150" y1="130" x2="150" y2="380" strokeWidth="3" stroke="currentColor" />
        <path d="M100 140 L100 210" strokeWidth="2" stroke="currentColor" fill="none" />
        <path d="M200 140 L200 210" strokeWidth="2" stroke="currentColor" fill="none" />
      </OrganGroup>

      {/* Skin - outline glow */}
      <OrganGroup id="skin" {...organ("skin")}>
        <ellipse cx="150" cy="52" rx="34" ry="42" />
        <path d="M98 110 Q88 110 83 130 L78 250 Q76 282 93 302 L103 312 Q108 317 108 327 L108 382 Q108 397 118 402 L130 407 Q140 410 150 410 Q160 410 170 407 L182 402 Q192 397 192 382 L192 327 Q192 317 197 312 L207 302 Q224 282 222 250 L217 130 Q212 110 202 110 Z" />
      </OrganGroup>

      {/* Reproductive */}
      <OrganGroup id="reproductive" {...organ("reproductive")}>
        <ellipse cx="150" cy="340" rx="20" ry="12" />
      </OrganGroup>

      {/* DNA / Oncology marker */}
      <OrganGroup id="dna" {...organ("dna")}>
        <g transform="translate(248, 40)">
          <path d="M0 0 Q8 10 0 20 Q-8 30 0 40 Q8 50 0 60" fill="none" strokeWidth="2" stroke="currentColor" />
          <path d="M12 0 Q4 10 12 20 Q20 30 12 40 Q4 50 12 60" fill="none" strokeWidth="2" stroke="currentColor" />
          <line x1="1" y1="10" x2="11" y2="10" strokeWidth="1.5" stroke="currentColor" />
          <line x1="1" y1="20" x2="11" y2="20" strokeWidth="1.5" stroke="currentColor" />
          <line x1="1" y1="30" x2="11" y2="30" strokeWidth="1.5" stroke="currentColor" />
          <line x1="1" y1="40" x2="11" y2="40" strokeWidth="1.5" stroke="currentColor" />
          <line x1="1" y1="50" x2="11" y2="50" strokeWidth="1.5" stroke="currentColor" />
        </g>
      </OrganGroup>
    </svg>
  );
}
