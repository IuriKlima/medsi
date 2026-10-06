/** Vector interpretation of the MedSI reference supplied on 29 September 2026. */
export function BrandMark({className = ''}:{className?:string}) {
  return <svg className={`medsi-symbol ${className}`} viewBox="0 0 100 68" fill="none" aria-hidden="true" focusable="false">
    <path className="medsi-mark-base" d="M3 49 25 12C32 0 46 0 54 13l24 39c4 7 1 14-8 14H59c-8 0-14-4-18-11L35 44c-1-2-3-2-4 0L21 60C12 75-6 65 3 49Z"/>
    <path className="medsi-mark-mint" d="m48 37 12-18c7-10 20-9 25 2l14 31c6 15-14 24-21 10l-8-16c-1-2-3-2-4 0l-4 6c-10 15-27 1-18-11Z"/>
  </svg>;
}

export function BrandWordmark() {
  return <span className="medsi-wordmark" aria-label="MedSI"><BrandMark/><span>Med<span className="medsi-wordmark-accent">SI</span></span></span>;
}

/** Flowing conversation lines from the MedSI visual reference. */
export function BrandContours({className = ''}:{className?:string}) {
  return <svg className={`medsi-contours ${className}`} viewBox="0 0 800 600" fill="none" aria-hidden="true" focusable="false">
    <path d="M-80 340C130 185 220 520 410 385S680 220 870 280"/>
    <path d="M-80 590C170 580 270 560 415 440S650 320 870 360"/>
    <path d="M600-60c0 130 105 120 105 215S580 240 630 310"/>
  </svg>;
}
