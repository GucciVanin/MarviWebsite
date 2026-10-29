import {
  LucideArrowRight, LucideBuilding, LucideCheck, LucideChevronDown, LucideCircleAlert, LucideCircleCheck,
  LucideClipboardList, LucideExternalLink, LucideFunnel, LucideHouse, LucideInbox, LucideInfo, LucideLoaderCircle,
  LucideLock, LucideLogIn, LucideLogOut, LucideMail, LucideMapPin, LucideMenu, LucideMessageCircle, LucidePackage,
  LucidePhone, LucideRefreshCw, LucideSearch, LucideSend, LucideShieldCheck, LucideShoppingCart, LucideStar,
  LucideStore, LucideTriangleAlert, LucideTruck, LucideUser, LucideUserPlus, LucideX,
  type LucideIconData,
} from '@lucide/angular';

/** Lucide dropped brand logos, so these two follow its stroke style (24x24 grid, 2px stroke) and live here. */
const facebook: LucideIconData = {
  name: 'facebook',
  node: [['path', { d: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' }]],
};
const instagram: LucideIconData = {
  name: 'instagram',
  node: [
    ['rect', { x: '2', y: '2', width: '20', height: '20', rx: '5', ry: '5' }],
    ['path', { d: 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z' }],
    ['line', { x1: '17.5', x2: '17.51', y1: '6.5', y2: '6.5' }],
  ],
};

/**
 * The one place that lists every icon the site may use. Only the icons named here are bundled (tree-shaking), and
 * `IconName` is derived from the keys, so an unknown name in a template fails to compile. Add an icon here to use it.
 */
export const ICONS = {
  'alert-circle': LucideCircleAlert.icon,
  'alert-triangle': LucideTriangleAlert.icon,
  'arrow-right': LucideArrowRight.icon,
  building: LucideBuilding.icon,
  check: LucideCheck.icon,
  'check-circle': LucideCircleCheck.icon,
  'chevron-down': LucideChevronDown.icon,
  'clipboard-list': LucideClipboardList.icon,
  'external-link': LucideExternalLink.icon,
  facebook,
  filter: LucideFunnel.icon,
  home: LucideHouse.icon,
  inbox: LucideInbox.icon,
  info: LucideInfo.icon,
  instagram,
  loader: LucideLoaderCircle.icon,
  lock: LucideLock.icon,
  'log-in': LucideLogIn.icon,
  'log-out': LucideLogOut.icon,
  mail: LucideMail.icon,
  'map-pin': LucideMapPin.icon,
  menu: LucideMenu.icon,
  'message-circle': LucideMessageCircle.icon,
  package: LucidePackage.icon,
  phone: LucidePhone.icon,
  'refresh-cw': LucideRefreshCw.icon,
  search: LucideSearch.icon,
  send: LucideSend.icon,
  'shield-check': LucideShieldCheck.icon,
  'shopping-cart': LucideShoppingCart.icon,
  star: LucideStar.icon,
  store: LucideStore.icon,
  truck: LucideTruck.icon,
  user: LucideUser.icon,
  'user-plus': LucideUserPlus.icon,
  x: LucideX.icon,
} satisfies Record<string, LucideIconData>;

export type IconName = keyof typeof ICONS;
