export interface DualPulseProps {
  /** Null when that side hasn't rated the account. */
  csmPulseScore: number | null;
  aiPulseScore: number | null;
  /** At or above this gap the two lanes are treated as disagreeing. */
  divergenceThreshold?: number;
}

const SCALE = [1, 2, 3, 4, 5];

/**
 * The CSM's read and the AI's read on one account, stacked so the gap between
 * them is the thing you see.
 *
 * `CSMPulseBar` and `AIPulseBar` each render one of these scores in its own
 * card, which means the *difference* between them — the only part that tells
 * you the team's read might be wrong — has never been on screen. Stacking the
 * lanes makes a disagreement a shape rather than a number you have to hold in
 * your head while looking at two charts.
 */
export function DualPulse({ csmPulseScore, aiPulseScore, divergenceThreshold = 2 }: DualPulseProps) {
  const rated = csmPulseScore !== null && aiPulseScore !== null;
  // Only a colder AI is flagged. The reverse means the CSM caught something
  // the model hasn't — worth knowing, but it isn't the blind spot. An unrated
  // pair diverges by nothing: there is no second opinion to differ from.
  const diverges = rated && (csmPulseScore as number) - (aiPulseScore as number) >= divergenceThreshold;

  const lane = (label: string, score: number | null) => (
    <div className="flex items-center gap-[2px]">
      <span className="w-6 text-[10px] text-ink-faint">{label}</span>
      {score === null ? (
        // Hollow track, not five empty dots: "unrated" has to look different
        // from "rated 1 out of 5".
        <span className="block w-[34px] h-[6px] rounded-full border border-dashed border-line-strong" />
      ) : (
        SCALE.map((step) => (
          <span
            key={step}
            className={`block w-[6px] h-[6px] rounded-full ${
              step <= score ? (diverges ? 'bg-danger' : 'bg-ink-muted') : 'bg-line-strong'
            }`}
          />
        ))
      )}
    </div>
  );

  return (
    <div
      className="flex flex-col gap-[3px]"
      role="img"
      aria-label={
        `CSM Pulse ${csmPulseScore ?? 'not rated'}, AI Pulse ${aiPulseScore ?? 'not rated'}` +
        (diverges ? ' — the two disagree' : '')
      }
      title={`CSM ${csmPulseScore ?? '—'} · AI ${aiPulseScore ?? '—'}`}
    >
      {lane('CSM', csmPulseScore)}
      {lane('AI', aiPulseScore)}
    </div>
  );
}
