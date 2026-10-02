/*
 * Nur — ночник-маскот. Рисунки эмоций лежат в public/nur/<эмоция>.svg.
 * Реплика Nur пишется рукописным шрифтом в «пузыре» рядом с ним.
 */

export type NurMood =
  | 'default' | 'focus' | 'eureka' | 'late' | 'off' | 'laugh' | 'surprised' | 'proud' | 'panic' | 'wink' | 'dreamy'
  | 'grit' | 'shy' | 'think' | 'starry' | 'party' | 'moved' | 'tease' | 'sly' | 'support' | 'zen' | 'skeptic'
  | 'waiting' | 'facepalm' | 'angry' | 'offended' | 'sad' | 'nervous' | 'draft' | 'yawn';

export const nurSrc = (mood: NurMood = 'default') => `/nur/${mood}.svg`;

export function Nur({ mood = 'default', width = 84, className }: { mood?: NurMood; width?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={nurSrc(mood)} alt="" width={width} height={Math.round(width * 1.1)} />
  );
}

/** Nur и его реплика в одну строку. */
export function NurSay({ mood = 'default', lamp = false, children }: { mood?: NurMood; lamp?: boolean; children: React.ReactNode }) {
  return (
    <div className="nur-row">
      <Nur mood={mood} />
      <p className={`say${lamp ? ' lamp' : ''}`} style={{ margin: 0 }}>{children}</p>
    </div>
  );
}

/** Круглый аватар: лицо Nur. */
export function NurAvatar({ mood = 'focus' }: { mood?: NurMood }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={nurSrc(mood)} alt="" width={74} height={81} />;
}
