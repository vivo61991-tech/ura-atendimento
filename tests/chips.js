// Botões de grupo da Evolução: oferecidas do dia à direita do nome.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL);
  await p.waitForFunction(() => window.__ura.estado().dados);
  await p.click('nav.tabs button[data-v="evo"]');
  const ler = () => p.$$eval('#pgEvo .chip', cs => cs.map(c => ({ g: c.dataset.grp, n: +c.querySelector('.qt').textContent.replace(/\./g, ''), zero: c.classList.contains('zero') })));
  // valores esperados direto dos dados (soma das oferecidas na última coleta, por grupo)
  const esperado = dir => p.evaluate(dir => {
    const d = window.__ura.estado().dados, L = d.leituras[d.leituras.length - 1], m = {};
    d.skills.filter(s => d.trad[s].DIRECIONAMENTO === dir).forEach(s => { const g = d.trad[s].SKILL_GRUPO; m[g] = (m[g] || 0) + (L.v[s].Distinct_Entered || 0); });
    return m;
  }, dir);
  for (const dir of ['CO', 'TEL']) {
    if (dir === 'TEL') await p.click('#pgEvo button[data-dir="TEL"]');
    const cs = await ler(), e = await esperado(dir);
    const soma = Object.values(e).reduce((a, b) => a + b, 0);
    ok(cs[0].g === '' && cs[0].n === soma, `${dir}: "Todos os grupos" = ${soma}`);
    ok(cs.slice(1).every(c => c.n === e[c.g]), `${dir}: cada grupo com as oferecidas do dia`);
    ok(cs.slice(1).every((c, i, a) => i === 0 || a[i - 1].n >= c.n), `${dir}: maior volume primeiro`);
    ok(cs.every(c => c.zero === (c.n === 0)), `${dir}: grupos zerados em cinza (${cs.filter(c => c.zero).map(c => c.g).join(', ') || 'nenhum'})`);
  }
  // escolher um grupo zerado: texto continua branco no botão selecionado
  const z = (await ler()).find(c => c.zero);
  if (z) {
    await p.click(`#pgEvo .chip[data-grp="${z.g}"]`);
    const cor = await p.$eval(`#pgEvo .chip[data-grp="${z.g}"]`, e => getComputedStyle(e).color);
    ok(cor === 'rgb(255, 255, 255)', 'grupo zerado selecionado: texto branco legível');
  }
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();
