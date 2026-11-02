// Evolução · eixo por dia: botão Horas/Dia na barra de data; a chave Previsto escolhe os dias do eixo
// (dias corridos ou o mesmo dia da semana) e o previsto de cada dia é a mediana dos 7 dias de referência dele.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const D = require('../dados.js'), Hs = require('../historico.js');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
const H = Hs.parse(fs.readFileSync(path.join(__dirname, 'historico_amostra.csv'), 'utf8'));
const amostra = require('./amostra.json'), P = D.normalizar(amostra), trad = amostra.skills;
const fI = n => Math.round(n).toLocaleString('pt-BR');
const dia = iso => iso === '2026-10-30' ? P : Hs.diaComoDados(H, iso, trad);
const tot = iso => { const d = dia(iso), L = d.leituras[d.leituras.length - 1]; return D.agregar(L, D.filtro(d, { dir: 'CO' })).ofer + D.agregar(L, D.filtro(d, { dir: 'TEL' })).ofer; };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => window.__ura.estado().hist);
  await p.click('nav.tabs button[data-v="evo"]');
  // botão na barra de data, à direita
  const bt = await p.$eval('#pgEvo .dnav', n => { const v = n.querySelector('.dn-vis'), r = v.getBoundingClientRect(), k = n.getBoundingClientRect(); return { t: v.textContent.trim(), dir: k.right - r.right < 12 }; });
  ok(bt.t === 'Horas' && bt.dir, 'barra de data: botão "Horas" no lado direito');
  const nH = await p.$$eval('#pgEvo .chart[data-ch="evo-of"] rect.hit', r => r.length);
  await p.click('#pgEvo .dn-vis'); await p.waitForTimeout(150);
  ok(await p.$eval('#pgEvo .dn-vis', v => v.textContent.trim()) === 'Dia' && await p.evaluate(() => window.__ura.estado().evo.vista) === 'dia', 'tocar alterna para "Dia"');
  // dia da semana (padrão da chave): só as sextas até 30/10
  const N = await p.$$eval('#pgEvo .chart[data-ch="evo-of"] rect.hit', r => r.length);
  const sextas = []; for (let x = '2026-10-30'; sextas.length < N && x >= H.inicio; x = Hs.somaDias(x, -7)) if (x === '2026-10-30' || H.dias.has(x)) sextas.push(x);
  sextas.reverse();
  const tits = await p.$$eval('#pgEvo .chart[data-ch="evo-of"] rect.hit title', t => t.map(x => x.textContent));
  ok(N >= 8 && tits.every(t => /^sex, /.test(t)) && tits[tits.length - 1].startsWith('sex, 30/10/2026'), `"sex a sex": ${N} sextas no eixo, até 30/10 (${tits[0]} … ${tits[tits.length - 1]})`);
  const somaSem = sextas.reduce((t, x) => t + tot(x), 0);
  ok(await p.$eval('#pgEvo .chart[data-ch="evo-of"] .ch-v', x => x.textContent) === fI(somaSem), `total embaixo do título = soma das sextas (${fI(somaSem)})`);
  ok(/sex a sex/.test(await p.$eval('#pgEvo .cmpk', k => k.textContent)), 'chave mostra "Corridos · sex a sex · Desligado"');
  // dias corridos
  await p.click('#pgEvo button[data-cmp="dias"]'); await p.waitForTimeout(150);
  const tC = await p.$$eval('#pgEvo .chart[data-ch="evo-of"] rect.hit title', t => t.map(x => x.textContent));
  const corr = []; for (let k = tC.length - 1, x = '2026-10-30'; k >= 0; k--, x = Hs.somaDias(x, -1)) corr.unshift(x);
  ok(tC.length === N && tC[tC.length - 1].startsWith('sex, 30/10') && tC[tC.length - 2].startsWith('qui, 29/10') && tC[0].includes(corr[0].slice(8) + '/' + corr[0].slice(5, 7)), `corridos: ${tC.length} dias seguidos (${tC[0]} … ${tC[tC.length - 1]})`);
  // previsto do dia 29/10 = mediana dos 7 dias anteriores a ele (dia inteiro)
  await p.locator('#pgEvo .chart[data-ch="evo-of"] rect.hit').nth(N - 2).click(); await p.waitForTimeout(150);
  const refs = Hs.referencias(H, '2026-10-29', 'dias');
  const m29 = Hs.mediana(refs.map(r => { const d = Hs.diaComoDados(H, r, trad); return D.agregarEm(d, 21 * 60, D.filtro(d, { dir: 'CO' })).ofer + D.agregarEm(d, 21 * 60, D.filtro(d, { dir: 'TEL' })).ofer; }));
  const cap = await p.$eval('#pgEvo .chart[data-ch="evo-of"] .csel', x => x.innerText.replace(/\s+/g, ' '));
  ok(cap.startsWith('qui, 29/10/2026') && cap.includes(fI(tot('2026-10-29')) + ' oferecidas') && cap.includes(': ' + fI(m29)), `29/10 selecionado: ${cap}`);
  ok(/Selecionado: qui, 29\/10\/2026/.test(await p.$eval('#pgEvo .selchip', x => x.textContent)), 'aviso "Selecionado: qui, 29/10/2026"');
  ok(await p.locator('#pgEvo path.ref').count() >= 7, 'previsto (área) nos gráficos');
  // tabela por dia
  const tb = await p.$$eval('#tIv tbody tr', rs => rs.map(r => r.children[0].textContent));
  ok(/^Dias/.test(await p.$eval('#tIv', t => t.closest('.card').querySelector('h2').textContent)) && tb[0] === 'sex 30/10*' && tb[1] === 'qui 29/10', `tabela "Dias", mais recente primeiro (${tb.slice(0, 3).join(', ')})`);
  // modo e eixo não se aplicam
  const pills = await p.$$eval('#pgEvo .ctl-p', bs => bs.map(x => x.textContent.trim() + (x.disabled ? '(off)' : '')));
  ok(pills.join('|') === 'Total URA|Por dia(off)|Dias(off)', 'controles: modo e eixo desligados na vista por dia: ' + pills.join(' · '));
  // navegar: o último dia do eixo acompanha a data
  await p.click('#pgEvo [data-navdia="-1"]'); await p.waitForTimeout(150);
  const tN = await p.$$eval('#pgEvo .chart[data-ch="evo-of"] rect.hit title', t => t.map(x => x.textContent));
  ok(tN[tN.length - 1] === 'qui, 29/10/2026', 'dia anterior: o eixo termina em 29/10');
  // desligado: dias seguidos, sem previsto
  await p.click('#pgEvo button[data-cmp="off"]'); await p.waitForTimeout(150);
  ok(await p.locator('#pgEvo path.ref').count() === 0 && (await p.$$eval('#pgEvo .chart[data-ch="evo-of"] rect.hit title', t => t.map(x => x.textContent))).slice(-2).join() === 'qua, 28/10/2026,qui, 29/10/2026', 'Desligado: dias seguidos, sem área');
  // fila por dia e o pico
  ok(/maior em /.test(await p.$eval('#pgEvo .chart[data-ch="evo-esp"] .ch-tot', x => x.textContent)), 'técnicos em espera: maior fila entre os dias');
  // volta para horas
  await p.click('#pgEvo button[data-cmp="sem"]');
  await p.click('#pgEvo .dn-vis'); await p.waitForTimeout(150);
  ok(await p.$eval('#pgEvo .dn-vis', v => v.textContent.trim()) === 'Horas' && await p.$$eval('#pgEvo .ctl-p', bs => bs.every(x => !x.disabled)), 'voltar para "Horas": controles de novo');
  ok(/med\. 7 qui/.test(await p.$eval('#pgEvo .chart[data-ch="evo-of"] .ch-det', x => x.textContent)), 'na vista por horas a mediana volta ao rodapé');
  // 360 px escuro
  const q = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
  q.on('pageerror', e => erros.push(e.message));
  await q.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await q.goto(URL); await q.waitForFunction(() => window.__ura.estado().hist); await q.click('nav.tabs button[data-v="evo"]');
  await q.click('#pgEvo [data-navdia="-1"]'); await q.click('#pgEvo .dn-vis'); await q.waitForTimeout(150);
  const caber = await q.$eval('#pgEvo .dnav', n => { const b = n.querySelector('.dn-t b'); return b.scrollWidth <= b.parentElement.parentElement.clientWidth + 1; });
  ok(caber && await q.evaluate(() => document.documentElement.scrollWidth) <= 360, '360 px: data inteira com "Último" e o botão Dia, sem estouro');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();
