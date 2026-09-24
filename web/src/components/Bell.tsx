type Tone = "white" | "bell" | "wait" | "done" | "delay" | "offline";
type Face = "look" | "wide" | "happy" | "sorry" | "sleep" | "dash";

const TONES: Record<Tone, [string, string]> = {
  white: ["#FFFFFF", "#D8D2C4"],
  bell: ["#D8AE45", "#9A7320"],
  wait: ["#6F8DA8", "#4E6E8E"],
  done: ["#5E9A7C", "#2E5F48"],
  delay: ["#C97B58", "#8A3A18"],
  offline: ["#C9C3B5", "#8A857B"],
};

function FaceMarks({ face }: { face: Face }) {
  const ink = "#1C1B1A";
  const dot = (x: number, y: number, r: number, dx = 0) => (
    <g className="pupil">
      <circle cx={x + dx} cy={y} r={r} fill={ink} />
    </g>
  );
  switch (face) {
    case "wide":
      return (
        <>
          <path d="M68 84q12-8 24 0M108 84q12-8 24 0" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          {dot(80, 104, 8)}
          {dot(120, 104, 8)}
        </>
      );
    case "happy":
      return <path d="M70 106q10-12 20 0M110 106q10-12 20 0" fill="none" stroke={ink} strokeWidth="5" strokeLinecap="round" />;
    case "sorry":
      return (
        <>
          <path d="M68 90l22 8M132 90l-22 8" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          {dot(80, 108, 6)}
          {dot(120, 108, 6)}
        </>
      );
    case "sleep":
      return <path d="M68 106h24M108 106h24" fill="none" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />;
    case "dash":
      return (
        <>
          {dot(80, 104, 6)}
          {dot(120, 104, 6)}
        </>
      );
    default:
      return (
        <>
          {dot(80, 104, 6.5, 2)}
          {dot(120, 104, 6.5, 2)}
        </>
      );
  }
}

/** شخصية دورك: جرس هندسي يعبّر بعينيه. */
export function Bell({ tone = "bell", face = "look", anim = "sway", className = "" }: { tone?: Tone; face?: Face; anim?: "sway" | "ring" | "none"; className?: string }) {
  const [fill, deep] = TONES[tone];
  const dotted = tone === "offline";
  const waves = face === "wide" && (tone === "white" || tone === "bell");
  const cls = [className, anim === "sway" ? "sway" : anim === "ring" ? "ring-anim" : "", face === "look" ? "drift" : ""].join(" ");
  return (
    <svg className={`bell ${cls}`} viewBox="0 0 200 212" aria-hidden="true" focusable="false">
      <ellipse cx="100" cy="200" rx="52" ry="6" fill="#1C1B1A" opacity=".12" />
      {waves && (
        <g className="waves" fill="none" stroke={tone === "white" ? "#fff" : deep} strokeWidth="5" strokeLinecap="round">
          <path d="M34 78q-14 30 0 60" />
          <path d="M18 66q-22 42 0 84" />
          <path d="M166 78q14 30 0 60" />
          <path d="M182 66q22 42 0 84" />
        </g>
      )}
      <g {...(dotted ? { fill: "none", stroke: deep, strokeWidth: 4, strokeDasharray: "8 8" } : {})}>
        <circle cx="100" cy="40" r="9" fill={dotted ? "none" : deep} />
        <path d="M46 152C46 84 66 46 100 46s54 38 54 106z" fill={dotted ? "none" : fill} />
        {!dotted && <path d="M62 150C62 100 76 62 100 62" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="7" strokeLinecap="round" />}
        <rect x="36" y="148" width="128" height="20" rx="10" fill={dotted ? "none" : deep} />
        <circle cx="100" cy="176" r="10" fill={dotted ? "none" : deep} />
      </g>
      <FaceMarks face={dotted ? "dash" : face} />
    </svg>
  );
}
