// Builds the WorkFuel Excel report for one machine and a date range.
import { buildXlsx, dateSerial, ST } from './xlsx.js';

const L = {
  uz: {
    sheetSummary: 'Hisobot', sheetEntries: 'Ish yozuvlari', sheetFills: 'Salyarka',
    title: 'WorkFuel: ish va yonilg\'i hisoboti', machine: 'Texnika', period: 'Davr', cap: "Bak sig'imi (l)", norm: "Me'yor (l/soat)",
    summary: 'Umumiy ko\'rsatkichlar', totalH: 'Jami ish vaqti (soat)', totalHM: 'Jami ish vaqti (soat:daq)', workDays: 'Ish kunlari',
    avgDay: "O'rtacha kunlik ish (soat)", maxDay: 'Eng uzoq ish kuni (soat)', breakH: 'Tushlik tanaffuslari (soat)',
    spent: "Sarflangan yonilg'i (l)", avgFuel: "O'rtacha kunlik sarf (l)", filled: "Quyilgan yonilg'i (l)", fullCount: "\"To'la bak\" quyishlar soni",
    byDay: "Kunlar bo'yicha", date: 'Sana', weekday: 'Hafta kuni', hours: 'Ish vaqti (soat)', hm: 'Ish vaqti (soat:daq)', firstStart: 'Boshlanish',
    lastEnd: 'Tugash', breakMin: 'Tushlik (daq)', fuel: "Yonilg'i (l)", count: 'Yozuvlar', total: 'Jami',
    start: 'Boshlanish', end: 'Tugash', normCol: "Me'yor (l/soat)", used: 'Sarf (l)',
    time: 'Vaqt', kind: 'Turi', liters: 'Litr', fill: 'Quyildi', full: "To'la bak", set: 'Aniq qoldiq', none: "Bu davrda yozuv yo'q",
    days: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
    types: { excavator: 'Ekskavator', bulldozer: 'Buldozer', loader: 'Yuklagich', grader: 'Greyder', crane: 'Avtokran', roller: 'Katok', tractor: 'Traktor', truck: 'Yuk mashinasi', other: 'Boshqa' },
    caption: '📊 {m}\n{p}\nIsh vaqti: {h}, sarf: {l} l',
  },
  ru: {
    sheetSummary: 'Отчёт', sheetEntries: 'Записи работы', sheetFills: 'Заправки',
    title: 'WorkFuel: отчёт по работе и топливу', machine: 'Техника', period: 'Период', cap: 'Объём бака (л)', norm: 'Норма (л/ч)',
    summary: 'Итоги', totalH: 'Всего работы (ч)', totalHM: 'Всего работы (ч:мин)', workDays: 'Рабочих дней',
    avgDay: 'Среднее в день (ч)', maxDay: 'Самый долгий день (ч)', breakH: 'Обеденные перерывы (ч)',
    spent: 'Израсходовано топлива (л)', avgFuel: 'Средний расход в день (л)', filled: 'Заправлено (л)', fullCount: 'Заправок «полный бак»',
    byDay: 'По дням', date: 'Дата', weekday: 'День недели', hours: 'Работа (ч)', hm: 'Работа (ч:мин)', firstStart: 'Начало',
    lastEnd: 'Окончание', breakMin: 'Обед (мин)', fuel: 'Топливо (л)', count: 'Записей', total: 'Итого',
    start: 'Начало', end: 'Окончание', normCol: 'Норма (л/ч)', used: 'Расход (л)',
    time: 'Время', kind: 'Тип', liters: 'Литры', fill: 'Заправка', full: 'Полный бак', set: 'Точный остаток', none: 'За период записей нет',
    days: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
    types: { excavator: 'Экскаватор', bulldozer: 'Бульдозер', loader: 'Погрузчик', grader: 'Грейдер', crane: 'Автокран', roller: 'Каток', tractor: 'Трактор', truck: 'Грузовик', other: 'Другое' },
    caption: '📊 {m}\n{p}\nРабота: {h}, расход: {l} л',
  },
};

const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;
const hm = min => { min = Math.round(min); return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; };
const dmy = ymd => ymd.split('-').reverse().join('.');
const pad = n => String(n).padStart(2, '0');
const addDay = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const isYmd = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
export const MAX_DAYS = 400;

/**
 * @param {object} o
 * @param {object} o.state  user state { machines, sessions, fills }
 * @param {object} o.machine
 * @param {string} o.from   YYYY-MM-DD (inclusive)
 * @param {string} o.to     YYYY-MM-DD (inclusive)
 * @param {number} o.tz     client Date#getTimezoneOffset() in minutes (for refuel timestamps)
 * @param {'uz'|'ru'} o.lang
 */
export function buildReport({ state, machine: m, from, to, tz = 0, lang = 'uz' }) {
  const t = L[lang] || L.uz;
  const local = iso => { const d = new Date(Date.parse(iso) - tz * 60000); return { ymd: d.toISOString().slice(0, 10), hm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }; };

  const sessions = state.sessions
    .filter(s => s.machineId === m.id && s.date >= from && s.date <= to)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const fills = state.fills
    .filter(f => f.machineId === m.id)
    .map(f => ({ ...f, loc: local(f.at) }))
    .filter(f => f.loc.ymd >= from && f.loc.ymd <= to)
    .sort((a, b) => a.at.localeCompare(b.at));

  // Per-day aggregation over every day of the range (days without work show zeros).
  const days = [];
  for (let d = from, i = 0; d <= to && i < MAX_DAYS; d = addDay(d, 1), i++) {
    const list = sessions.filter(s => s.date === d);
    days.push({
      date: d,
      min: list.reduce((a, s) => a + s.minutes, 0),
      brk: list.reduce((a, s) => a + (s.breakMin || 0), 0),
      l: list.reduce((a, s) => a + s.liters, 0),
      n: list.length,
      first: list.length ? list[0].start : '',
      last: list.length ? list.map(s => s.end).sort().at(-1) : '',
    });
  }
  const totalMin = days.reduce((a, d) => a + d.min, 0);
  const totalBrk = days.reduce((a, d) => a + d.brk, 0);
  const totalL = days.reduce((a, d) => a + d.l, 0);
  const workDays = days.filter(d => d.min > 0).length;
  const maxMin = Math.max(0, ...days.map(d => d.min));
  const filledL = fills.filter(f => f.type === 'fill').reduce((a, f) => a + f.liters, 0);
  const fullCount = fills.filter(f => f.type === 'full').length;
  const machineLabel = `${m.name} (${t.types[m.type] || t.types.other}${m.plate ? ', ' + m.plate : ''})`;
  const periodLabel = `${dmy(from)} – ${dmy(to)}`;

  const H = s => ({ v: s, s: ST.header });
  const summary = [
    [{ v: t.title, s: ST.title }],
    [{ v: t.machine, s: ST.bold }, machineLabel],
    [{ v: t.period, s: ST.bold }, periodLabel],
    [{ v: t.cap, s: ST.bold }, m.cap],
    [{ v: t.norm, s: ST.bold }, m.norm],
    [],
    [H(t.summary), H('')],
    [t.totalH, { v: r2(totalMin / 60), s: ST.num }],
    [t.totalHM, hm(totalMin)],
    [t.workDays, { v: workDays, s: ST.int }],
    [t.avgDay, { v: r2(workDays ? totalMin / 60 / workDays : 0), s: ST.num }],
    [t.maxDay, { v: r2(maxMin / 60), s: ST.num }],
    [t.breakH, { v: r2(totalBrk / 60), s: ST.num }],
    [t.spent, { v: r1(totalL), s: ST.num }],
    [t.avgFuel, { v: r1(workDays ? totalL / workDays : 0), s: ST.num }],
    [t.filled, { v: r1(filledL), s: ST.num }],
    [t.fullCount, { v: fullCount, s: ST.int }],
    [],
    [{ v: t.byDay, s: ST.bold }],
  ];
  summary.push([H(t.date), H(t.weekday), H(t.hours), H(t.hm), H(t.firstStart), H(t.lastEnd), H(t.breakMin), H(t.fuel), H(t.count)]);
  for (const d of days) {
    summary.push([
      { v: dateSerial(d.date), s: ST.date }, t.days[new Date(d.date + 'T00:00:00Z').getUTCDay()],
      { v: r2(d.min / 60), s: ST.num }, hm(d.min), d.first, d.last,
      { v: d.brk, s: ST.int }, { v: r1(d.l), s: ST.num }, { v: d.n, s: ST.int },
    ]);
  }
  summary.push([
    { v: t.total, s: ST.bold }, '', { v: r2(totalMin / 60), s: ST.boldNum }, { v: hm(totalMin), s: ST.bold }, '', '',
    { v: totalBrk, s: ST.boldInt }, { v: r1(totalL), s: ST.boldNum }, { v: sessions.length, s: ST.boldInt },
  ]);

  const entries = [[H(t.date), H(t.start), H(t.end), H(t.breakMin), H(t.hours), H(t.hm), H(t.normCol), H(t.used)]];
  for (const s of sessions) {
    entries.push([
      { v: dateSerial(s.date), s: ST.date }, s.start, s.end, { v: s.breakMin || 0, s: ST.int },
      { v: r2(s.minutes / 60), s: ST.num }, hm(s.minutes), s.norm, { v: r1(s.liters), s: ST.num },
    ]);
  }
  if (!sessions.length) entries.push([t.none]);
  else entries.push([{ v: t.total, s: ST.bold }, '', '', { v: totalBrk, s: ST.boldInt }, { v: r2(totalMin / 60), s: ST.boldNum }, { v: hm(totalMin), s: ST.bold }, '', { v: r1(totalL), s: ST.boldNum }]);

  const fillRows = [[H(t.date), H(t.time), H(t.kind), H(t.liters)]];
  for (const f of fills) {
    fillRows.push([{ v: dateSerial(f.loc.ymd), s: ST.date }, f.loc.hm, t[f.type] || f.type, f.type === 'full' ? '' : { v: r1(f.liters), s: ST.num }]);
  }
  if (!fills.length) fillRows.push([t.none]);

  const buffer = buildXlsx([
    { name: t.sheetSummary, rows: summary, widths: [30, 34, 14, 14, 12, 12, 12, 12, 10], freezeRow: 0 },
    { name: t.sheetEntries, rows: entries, widths: [13, 12, 12, 12, 14, 14, 14, 11], freezeRow: 1 },
    { name: t.sheetFills, rows: fillRows, widths: [13, 10, 16, 10], freezeRow: 1 },
  ]);

  const slug = String(m.name).normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  const filename = `WorkFuel_${slug ? slug + '_' : ''}${from}_${to}.xlsx`;
  const caption = t.caption.replace('{m}', machineLabel).replace('{p}', periodLabel).replace('{h}', hm(totalMin)).replace('{l}', r1(totalL));
  return { buffer, filename, caption };
}
