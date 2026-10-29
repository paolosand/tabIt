type NavLike = Pick<Navigator, 'platform'> & { userAgentData?: { platform: string } };

export function isMac(nav: NavLike = navigator as NavLike): boolean {
  const p = nav.userAgentData?.platform || nav.platform || '';
  return /mac/i.test(p);
}
