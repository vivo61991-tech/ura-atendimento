// Botões de grupo com coluna selecionada: mostram as oferecidas daquela coluna e trocar de grupo NÃO tira a seleção.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
const abrir = async p => { if (await p.locator('#pgEvo .topbar.fechado').count()) await p.click('#pgEvo .ctl-seta'); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL);
  await p.waitForFunction(() => window.__ura.estado().dados);
  await p.click('nav.tabs button[data-v="evo"]');
  await abrir(p); await p.click('#pgEvo button[data-passo="60"]');
  const chips = () => p.$$eval('#pgEvo .chip', cs => Object.fromEntries(cs.map(c => [c.dataset.grp || 'TODOS', c.querySelector('.qt').textContent])));
  const dia = await chips();
  // esperado: oferecidas do intervalo 11:00–12:00 (leitura 12:00 − leitura 11:00) por grupo, direto dos dados
  const esperado = (ini, fim) => p.evaluate(([ini, fim]) => {
    const d = window.__ura.estado().dados, a = d.leituras.find(l => l.m === ini), z = d.leituras.find(l => l.m === fim), m = { TODOS: 0 };
    d.skills.filter(s => d.trad[s].DIRECIONAMENTO === 'CO').forEach(s => { const g = d.trad[s].SKILL_GRUPO, v = (z.v[s].Distinct_Entered || 0) - (a ? a.v[s].Distinct_Entered || 0 : 0); m[g] = (m[g] || 0) + v; m.TODOS += v; });
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.toLocaleString('pt-BR')]));
  }, [ini, fim]);
  await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(3).click();   // 11h
  let c = await chips(), e = await esperado(11 * 60, 12 * 60);
  ok(JSON.stringify(c) === JSON.stringify(Object.fromEntries(Object.keys(c).map(k => [k, e[k]]))), 'com 11h selecionada: cada grupo mostra as oferecidas de 11:00–12:00 (' + Object.entries(c).map(([k, v]) => k.split(' ').pop() + ' ' + v).join(', ') + ')');
  ok(c.TODOS === '187', 'Todos os grupos = 187 (o mesmo do gráfico)');
  ok(await p.$eval('#pgEvo .chips', x => x.classList.contains('per')), 'números com a cor da seleção');
  // trocar de grupo mantém a seleção e os gráficos mostram o grupo no mesmo horário
  await p.click('#pgEvo .chip[data-grp="MANOBRA"]'); await p.waitForTimeout(500);
  let st = await p.evaluate(() => window.__ura.estado().evo);
  ok(st.grupo === 'MANOBRA' && st.sel === 11 * 60, 'trocar para MANOBRA não tira a seleção (continua 11h)');
  const capOf = await p.$eval('#pgEvo .chart .csel', x => x.innerText.replace(/\s+/g, ' '));
  ok(capOf.startsWith('11:00–12:00') && capOf.includes(e.MANOBRA + ' oferecidas'), 'gráfico de oferecidas mostra MANOBRA às 11h: ' + capOf.trim());
  const kOf = await p.$eval('#pgEvo .kpis2 .kpi .v', x => x.textContent);
  ok(kOf === e.MANOBRA, `card de oferecidas = ${kOf} (MANOBRA no intervalo)`);
  await p.click('#pgEvo .chip[data-grp="SUPORTE TV"]'); await p.waitForTimeout(500);
  st = await p.evaluate(() => window.__ura.estado().evo);
  ok(st.grupo === 'SUPORTE TV' && st.sel === 11 * 60, 'alternar para SUPORTE TV: seleção continua');
  // tocar de novo no grupo: volta para Todos, seleção mantida
  await p.click('#pgEvo .chip[data-grp="SUPORTE TV"]'); await p.waitForTimeout(500);
  st = await p.evaluate(() => window.__ura.estado().evo);
  ok(st.grupo === null && st.sel === 11 * 60, 'voltar para Todos os grupos: seleção continua');
  // modo acumulado: números até o fim da coluna
  await abrir(p); await p.click('#pgEvo button[data-modo="acum"]');
  c = await chips(); e = await esperado(-1, 12 * 60);
  ok(c.TODOS === '501' && Object.keys(c).every(k => c[k] === e[k]), 'acumulado com "até 12:00" selecionado: grupos com o acumulado até 12:00 (Todos 501)');
  // limpar seleção: volta para o dia
  await p.click('#pgEvo .selchip');
  c = await chips();
  ok(JSON.stringify(c) === JSON.stringify(dia), 'sem seleção: volta a mostrar as oferecidas do dia');
  ok(!(await p.$eval('#pgEvo .chips', x => x.classList.contains('per'))), 'sem seleção: números na cor normal');
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();
