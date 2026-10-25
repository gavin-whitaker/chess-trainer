import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './styles/app.css';
import './styles/board.css';
import { registerSW } from 'virtual:pwa-register';
import { h, icon } from './ui/dom';
import { route, startRouter, navigate } from './router';
import { applyTheme } from './settings';
import { unlockAudio } from './board/feedback';
import { markActive } from './stats';

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
unlockAudio();
registerSW({ immediate: true });

route('home', { tab: 'home', screen: async () => (await import('./screens/home')).homeScreen });
route('puzzles', { tab: 'puzzles', screen: async () => (await import('./screens/puzzles')).puzzlesHub });
route('puzzles/rated', { tab: 'puzzles', full: true, screen: async () => (await import('./screens/puzzleRated')).ratedScreen });
route('puzzles/daily', { tab: 'puzzles', full: true, screen: async () => (await import('./screens/puzzleRated')).dailyScreen });
route('puzzles/rush', { tab: 'puzzles', screen: async () => (await import('./screens/rush')).rushMenu });
route('puzzles/rush/play', { tab: 'puzzles', full: true, screen: async () => (await import('./screens/rush')).rushScreen });
route('puzzles/themes', { tab: 'puzzles', screen: async () => (await import('./screens/themes')).themesScreen });
route('puzzles/theme', { tab: 'puzzles', full: true, screen: async () => (await import('./screens/themes')).themePlayScreen });
route('puzzles/woodpecker', { tab: 'puzzles', screen: async () => (await import('./screens/woodpecker')).woodpeckerMenu });
route('puzzles/woodpecker/play', { tab: 'puzzles', full: true, screen: async () => (await import('./screens/woodpecker')).woodpeckerScreen });
route('learn', { tab: 'learn', screen: async () => (await import('./screens/learn')).learnHub });
route('learn/browse', { tab: 'learn', screen: async () => (await import('./screens/learn')).browseScreen });
route('learn/line', { tab: 'learn', full: true, screen: async () => (await import('./screens/lineView')).lineScreen });
route('learn/explore', { tab: 'learn', full: true, screen: async () => (await import('./screens/explorer')).explorerScreen });
route('learn/lesson', { tab: 'learn', full: true, screen: async () => (await import('./screens/lesson')).lessonScreen });
route('learn/repertoire', { tab: 'learn', screen: async () => (await import('./screens/repertoire')).repertoireScreen });
route('learn/drill', { tab: 'learn', full: true, screen: async () => (await import('./screens/repertoire')).drillScreen });
route('analyze', { tab: 'analyze', full: true, screen: async () => (await import('./screens/analyze')).analyzeScreen });
route('profile', { tab: 'profile', screen: async () => (await import('./screens/profile')).profileScreen });
route('settings', { tab: 'profile', screen: async () => (await import('./screens/settings')).settingsScreen });

const TABS = [
  { id: 'home', label: 'Home', icon: 'home' as const },
  { id: 'puzzles', label: 'Puzzles', icon: 'puzzle' as const },
  { id: 'learn', label: 'Learn', icon: 'learn' as const },
  { id: 'analyze', label: 'Analyze', icon: 'analyze' as const },
  { id: 'profile', label: 'Profile', icon: 'profile' as const },
];

const view = h('main.view');
const tabButtons = new Map<string, HTMLElement>();
const tabbar = h(
  'nav.tabbar',
  TABS.map((t) => {
    const b = h('button.tab', { onclick: () => navigate(t.id) }, icon(t.icon), h('span', t.label));
    tabButtons.set(t.id, b);
    return b;
  }),
);

document.getElementById('app')!.append(view, tabbar);

startRouter(view, (tab, full) => {
  tabButtons.forEach((b, id) => b.classList.toggle('active', id === tab));
  document.body.classList.toggle('full', full);
});

void markActive();
