import { getSettings } from "@/lib/settings";

export function Logo({ className = "h-9 w-auto", variant }: { className?: string; variant?: "dark" | "light" }) {
  // Custom uploaded logo overrides both variants when set.
  const custom = getSettings().customLogoUrl;
  if (custom) return <img src={custom} alt="Logo" className={className} />;

  const dark = "/2a-logo-transparent-light.png"; // light-colored mark for dark bg
  const light = "/2a-logo-transparent-dark.png"; // dark-colored mark for light bg
  if (variant === "dark") return <img src={dark} alt="2A" className={className} />;
  if (variant === "light") return <img src={light} alt="2A" className={className} />;
  return (
    <>
      <img src={light} alt="2A" className={`${className} block dark:hidden`} />
      <img src={dark} alt="2A" className={`${className} hidden dark:block`} />
    </>
  );
}
