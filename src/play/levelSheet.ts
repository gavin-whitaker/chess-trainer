import { h, sheet } from '../ui/dom';
import { BOT_LEVELS, botLabel, lastBotElo, saveBotElo } from './bot';

export function chooseBotLevel(onPick: (elo: number) => void, title = 'Play a bot from here'): void {
  let elo = lastBotElo();
  const label = h('div.level-label');
  const buttons = BOT_LEVELS.map((v) => h('button.level-chip', { onclick: () => select(v) }, String(v)));
  const select = (v: number) => {
    elo = v;
    buttons.forEach((b, i) => b.classList.toggle('active', BOT_LEVELS[i] === v));
    label.replaceChildren(h('b', `${v}`), ` · ${botLabel(v)}`);
  };
  select(BOT_LEVELS.includes(elo) ? elo : 1200);
  const s = sheet(
    title,
    h('div.sheet-body',
      h('p.muted', 'Pick the bot’s rating. It plays the other side from the current position.'),
      label,
      h('div.level-grid', ...buttons),
      h('button.btn.green', {
        style: { marginTop: '14px' },
        onclick: () => {
          saveBotElo(elo);
          s.close();
          onPick(elo);
        },
      }, 'Play'),
    ),
  );
}
