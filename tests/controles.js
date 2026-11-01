// Controles da Evolução: começam recolhidos numa linha fina; a seta abre e recolhe.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch();
  const erros = [];
  for (const larg of [360, 390]) {
    const p = await b.newPage({ viewport: { width: larg, height: 844 } });
    p.on('pageerror', e => erros.push(e.message));
    await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
    await p.goto(URL);
    await p.waitForFunction(() => window.__ura.estado().dados);
    await p.click('nav.tabs button[data-v="evo"]');
    const est = () => p.$eval('#pgEvo .topbar', t => ({ fechado: t.classList.contains('fechado'), h: Math.round(t.getBoundingClientRect().height), segs: t.querySelectorAll('.seg').length,
      res: [...t.querySelectorAll('.ctl-p')].map(x => x.textContent), seta: t.querySelector('.ctl-seta').getAttribute('aria-expanded'),
      linhas: (() => { const ps = [...t.querySelectorAll('.ctl-p')]; return new Set(ps.map(x => Math.round(x.getBoundingClientRect().top))).size; })(),
      dentro: [...t.querySelectorAll('.ctl-p')].every(x => x.getBoundingClientRect().right <= t.querySelector('.ctl-seta').getBoundingClientRect().left) }));
    let e = await est();
    ok(e.fechado && e.segs === 0 && e.seta === 'false', `${larg}px: começa recolhido (sem os botões)`);
    ok(e.res.join(' | ') === 'Total URA | Por intervalo | Auto · 1 h', `${larg}px: abre sempre em Total URA · Por intervalo · Auto: ${e.res.join(' · ')}`);
    ok(e.linhas === 1 && e.dentro, `${larg}px: numa linha só, sem passar por baixo da seta`);
    ok(e.h <= 60, `${larg}px: barra fina (${e.h}px)`);
    const enc = await p.$eval('#pgEvo .ctl-res', r => {
      const ps = [...r.querySelectorAll('.ctl-p')], rr = r.getBoundingClientRect();
      const cs = getComputedStyle(ps[0]), on = document.createElement('div');
      return { ini: Math.round(ps[0].getBoundingClientRect().left - rr.left), fim: Math.round(rr.right - ps[ps.length - 1].getBoundingClientRect().right),
        raio: cs.borderRadius, cor: ps.map(x => getComputedStyle(x).backgroundColor), corta: ps.some(x => x.scrollWidth > x.clientWidth) };
    });
    ok(enc.ini === 0 && enc.fim === 0, `${larg}px: botões ocupam toda a largura até a seta`);
    ok(enc.raio === '9px' && new Set(enc.cor).size === 1, `${larg}px: mesmo formato do botão marcado aberto (canto ${enc.raio}, mesma cor)`);
    ok(!enc.corta, `${larg}px: textos inteiros, sem cortar`);
    const seta = await p.$eval('#pgEvo .ctl-seta', s => { const r = s.getBoundingClientRect(), c = s.closest('.topbar').getBoundingClientRect(); return { dir: Math.round(c.right - r.right), baixo: Math.round(c.bottom - r.bottom) }; });
    ok(seta.dir <= 14 && seta.baixo <= 14, `${larg}px: seta no canto inferior direito (${seta.dir}px da direita, ${seta.baixo}px de baixo)`);
    // abrir pela seta
    await p.click('#pgEvo .ctl-seta');
    e = await est();
    ok(!e.fechado && e.segs === 3 && e.seta === 'true', `${larg}px: a seta abre os controles`);
    const seta2 = await p.$eval('#pgEvo .ctl-seta', s => { const r = s.getBoundingClientRect(), c = s.closest('.topbar').getBoundingClientRect(); return Math.round(c.bottom - r.bottom); });
    ok(seta2 <= 20, `${larg}px: aberta, a seta continua embaixo à direita`);
    // trocar opções mantém aberto
    await p.click('#pgEvo button[data-dir="TEL"]'); await p.click('#pgEvo button[data-modo="acum"]'); await p.click('#pgEvo button[data-passo="30"]');
    e = await est();
    ok(!e.fechado, `${larg}px: trocar opções não recolhe`);
    // recolher
    await p.click('#pgEvo .ctl-seta');
    e = await est();
    ok(e.fechado && e.res.join(' | ') === 'TEL | Acumulado | 30 min', `${larg}px: recolhido mostra o novo escolhido: ${e.res.join(' · ')}`);
    // tocar na linha recolhida também abre
    await p.click('#pgEvo .ctl-res');
    ok(!(await est()).fechado, `${larg}px: tocar na linha recolhida também abre`);
    // sair e voltar: recolhido de novo
    await p.click('nav.tabs button[data-v="agora"]'); await p.click('nav.tabs button[data-v="evo"]');
    ok((await est()).fechado, `${larg}px: ao voltar para a Evolução, começa recolhido`);
    // com coluna selecionada, o aviso de seleção continua visível com os controles recolhidos
    await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(2).click();
    ok(await p.locator('#pgEvo .topbar .selchip').isVisible() && (await est()).fechado, `${larg}px: seleção visível com os controles recolhidos`);
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= larg, `${larg}px: sem estouro lateral`);
    // escolher outras opções e reabrir o app: volta para Total URA · Por intervalo · Auto (o 1º de cada linha)
    await p.click('#pgEvo .ctl-res'); await p.click('#pgEvo button[data-dir="TEL"]'); await p.click('#pgEvo button[data-modo="acum"]'); await p.click('#pgEvo button[data-passo="30"]');
    await p.reload(); await p.waitForFunction(() => window.__ura.estado().dados); await p.click('nav.tabs button[data-v="evo"]');
    e = await est();
    ok(e.res.join(' | ') === 'Total URA | Por intervalo | Auto · 1 h', `${larg}px: reabrir o app volta para Total URA · Por intervalo · Auto: ${e.res.join(' · ')}`);
    await p.click('#pgEvo .ctl-seta');
    const ordem = await p.$$eval('#pgEvo .topbar .seg', ss => ss.map(s => [...s.querySelectorAll('button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(',')));
    ok(ordem[0] === 'Total URA*,CO,TEL' && ordem[1].startsWith('Por intervalo*') && ordem[2].startsWith('Auto*'), `${larg}px: botões na ordem e marcados à esquerda: ${ordem.join(' | ')}`);
    await p.close();
  }
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();
