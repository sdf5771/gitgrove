interface Props {
  size?: number
}

export function LogoIcon({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      {/* Background: rounded square, dark navy */}
      <rect width="200" height="200" rx="38" fill="#0d1220"/>
      {/* Pixel border glow */}
      <rect x=".75" y=".75" width="198.5" height="198.5" rx="37.5" fill="none" stroke="#e6a536" strokeWidth="1.5" opacity=".22"/>
      {/* Inner top highlight */}
      <rect x="1" y="1" width="198" height="8" rx="37" fill="rgba(244,236,210,.045)"/>

      {/* Trunk: main branch */}
      <rect x="97" y="38" width="6" height="128" fill="#e6a536"/>

      {/* Left branch */}
      <rect x="60" y="108" width="37" height="6" fill="#e6a536"/>
      <rect x="60" y="60" width="6" height="54" fill="#e6a536"/>

      {/* Right branch */}
      <rect x="103" y="108" width="37" height="6" fill="#e6a536"/>
      <rect x="134" y="60" width="6" height="54" fill="#e6a536"/>

      {/* Commit nodes */}
      <rect x="92" y="152" width="16" height="16" rx="3" fill="#e6a536"/>
      <rect x="95" y="155" width="10" height="10" rx="1.5" fill="#c98a22" opacity=".5"/>
      <rect x="92" y="102" width="16" height="16" rx="3" fill="#e6a536"/>
      <rect x="95" y="105" width="10" height="10" rx="1.5" fill="#c98a22" opacity=".5"/>
      {/* HEAD — brightest */}
      <rect x="92" y="30" width="16" height="16" rx="3" fill="#ffd770"/>
      <rect x="96" y="34" width="8" height="8" rx="1" fill="#e6a536"/>
      <rect x="52" y="52" width="16" height="16" rx="3" fill="#e6a536"/>
      <rect x="132" y="52" width="16" height="16" rx="3" fill="#e6a536"/>

      {/* Leaf clusters — left */}
      <rect x="40" y="32" width="9" height="9" fill="#6fcf7c"/>
      <rect x="51" y="26" width="9" height="9" fill="#6fcf7c"/>
      <rect x="62" y="22" width="9" height="9" fill="#6fcf7c"/>
      <rect x="44" y="42" width="9" height="9" fill="#6fcf7c" opacity=".75"/>
      <rect x="55" y="36" width="9" height="9" fill="#6fcf7c" opacity=".75"/>
      <rect x="66" y="32" width="9" height="9" fill="#6fcf7c" opacity=".6"/>
      <rect x="35" y="42" width="7" height="7" fill="#6fcf7c" opacity=".45"/>
      <rect x="68" y="42" width="7" height="7" fill="#6fcf7c" opacity=".4"/>

      {/* Leaf clusters — right */}
      <rect x="142" y="32" width="9" height="9" fill="#6fcf7c"/>
      <rect x="131" y="26" width="9" height="9" fill="#6fcf7c"/>
      <rect x="120" y="22" width="9" height="9" fill="#6fcf7c"/>
      <rect x="138" y="42" width="9" height="9" fill="#6fcf7c" opacity=".75"/>
      <rect x="127" y="36" width="9" height="9" fill="#6fcf7c" opacity=".75"/>
      <rect x="116" y="32" width="9" height="9" fill="#6fcf7c" opacity=".6"/>
      <rect x="149" y="42" width="7" height="7" fill="#6fcf7c" opacity=".45"/>
      <rect x="113" y="42" width="7" height="7" fill="#6fcf7c" opacity=".4"/>

      {/* Leaf clusters — top canopy */}
      <rect x="84" y="12" width="9" height="9" fill="#6fcf7c"/>
      <rect x="95" y="7" width="9" height="9" fill="#6fcf7c"/>
      <rect x="106" y="12" width="9" height="9" fill="#6fcf7c"/>
      <rect x="89" y="21" width="9" height="9" fill="#6fcf7c" opacity=".8"/>
      <rect x="101" y="21" width="9" height="9" fill="#6fcf7c" opacity=".8"/>
      <rect x="78" y="20" width="7" height="7" fill="#6fcf7c" opacity=".5"/>
      <rect x="115" y="20" width="7" height="7" fill="#6fcf7c" opacity=".5"/>
    </svg>
  )
}
