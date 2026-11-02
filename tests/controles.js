// Controles da Evolução: três botões sempre à vista e presos no topo (atendimento · modo · eixo); cada um abre um
// menu suspenso; escolher aplica e fecha; tocar fora ou Esc fecha sem mudar. Sem seta de abrir/recolher, sem alfinete.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch(); const erros = [];
  for (const [larg, tema] of [[360, 'dark'], [390, 'light']]) {
    const p = await b.newPage({ viewport: { width: larg, height: 800 }, colorScheme: tema });
    p.on('pageerror', e => erros.push(e.message));
    await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
    await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.waitForFunction(() => window.__ura.estado().dados);
    await p.click('nav.tabs button[data-v="evo"]');
    const pills = () => p.$$eval('#pgEvo .ctl-p', bs => bs.map(x => ({ t: x.querySelector('span').textContent, corta: x.querySelector('span').scrollWidth > x.querySelector('span').clientWidth, top: Math.round(x.getBoundingClientRect().top) })));
    let ps = await pills();
    ok(ps.map(x => x.t).join(' | ') === 'Total URA | Por intervalo | Auto · 1 h' && ps.every(x => !x.corta) && new Set(ps.map(x => x.top)).size === 1, `${larg}px: 3 botões inteiros numa linha: ${ps.map(x => x.t).join(' · ')}`);
    ok(await p.locator('#pgEvo .ctl-seta, #pgEvo .ctl-pino, #pgEvo .ctl-res').count() === 0, `${larg}px: sem seta de abrir/recolher e sem alfinete`);
    // menu do eixo
    await p.click('#pgEvo [data-menu="passo"]');
    const m = await p.$eval('#pgEvo .ctl-menu', mm => ({ ops: [...mm.querySelectorAll('button')].map(x => x.textContent + (x.classList.contains('on') ? '*' : '')), dentro: mm.getBoundingClientRect().right <= innerWidth && mm.getBoundingClientRect().left >= 0 }));
    ok(m.ops.join('|') === 'Auto · 1 h*|15 min|30 min|1 h|2 h' && m.dentro, `${larg}px: eixo abre o menu com as opções (atual marcada), dentro da tela: ${m.ops.join(' · ')}`);
    ok(await p.getAttribute('#pgEvo [data-menu="passo"]', 'aria-expanded') === 'true', `${larg}px: botão indica menu aberto`);
    await p.click('#pgEvo .ctl-menu button[data-passo="30"]');
    ps = await pills();
    ok(ps[2].t === '30 min' && await p.locator('#pgEvo .ctl-menu').count() === 0 && await p.evaluate(() => window.__ura.estado().evo.passo) === 30, `${larg}px: escolher 30 min aplica e fecha o menu`);
    // atendimento e modo
    await p.click('#pgEvo [data-menu="dir"]');
    ok((await p.$$eval('#pgEvo .ctl-menu button', bs => bs.map(x => x.textContent))).join('|') === 'Total URA|CO|TEL', `${larg}px: atendimento: Total URA · CO · TEL`);
    await p.click('#pgEvo .ctl-menu button[data-dir="CO"]');
    await p.click('#pgEvo [data-menu="modo"]'); await p.click('#pgEvo .ctl-menu button[data-modo="acum"]');
    ps = await pills();
    ok(ps.map(x => x.t).join(' | ') === 'CO | Acumulado | 30 min', `${larg}px: botões mostram o escolhido: ${ps.map(x => x.t).join(' · ')}`);
    // só um menu por vez; tocar fora e Esc fecham sem mudar
    await p.click('#pgEvo [data-menu="dir"]'); await p.click('#pgEvo [data-menu="modo"]');
    ok(await p.locator('#pgEvo .ctl-menu').count() === 1 && await p.locator('#pgEvo .ctl-menu button[data-modo]').count() === 2, `${larg}px: abrir outro menu fecha o anterior`);
    await p.mouse.click(5, 600);
    ok(await p.locator('#pgEvo .ctl-menu').count() === 0 && await p.evaluate(() => window.__ura.estado().evo.modo) === 'acum', `${larg}px: tocar fora fecha sem mudar`);
    await p.click('#pgEvo [data-menu="passo"]'); await p.keyboard.press('Escape');
    ok(await p.locator('#pgEvo .ctl-menu').count() === 0, `${larg}px: Esc fecha`);
    // sempre presos no topo ao rolar, com a faixa de grupos
    await p.mouse.wheel(0, 2000); await p.waitForTimeout(250);
    const v = await p.evaluate(() => { const h = document.querySelector('header.top').getBoundingClientRect().bottom, c = document.querySelector('#pgEvo .ctl-l').getBoundingClientRect(), ch = document.querySelector('#pgEvo .chips').getBoundingClientRect();
      return { c: c.top >= h - 1 && c.bottom < innerHeight, ch: ch.top >= h - 1 && ch.bottom < innerHeight, y: scrollY }; });
    ok(v.y > 1000 && v.c && v.ch, `${larg}px: rolando a tela, controles e grupos continuam à vista`);
    // menu aberto com a tela rolada: aparece por cima dos gráficos
    await p.click('#pgEvo [data-menu="passo"]');
    const sobre = await p.$eval('#pgEvo .ctl-menu', mm => { const r = mm.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.bottom - 8); return mm.contains(el); });
    ok(sobre, `${larg}px: menu por cima dos gráficos`);
    await p.click('#pgEvo .ctl-menu button[data-passo="60"]');
    ok(await p.evaluate(() => window.__ura.estado().evo.passo) === 60, `${larg}px: escolher com a tela rolada funciona`);
    // coluna selecionada: aviso continua visível
    await p.evaluate(() => scrollTo(0, 0));
    await p.locator('#pgEvo .chart').first().locator('rect.hit').nth(2).click();
    ok(await p.locator('#pgEvo .topbar .selchip').isVisible(), `${larg}px: seleção visível junto dos controles`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth) <= larg, `${larg}px: sem estouro lateral`);
    // reabrir o app: volta para o começo
    await p.reload(); await p.waitForFunction(() => window.__ura.estado().dados); await p.click('nav.tabs button[data-v="evo"]');
    ps = await pills();
    ok(ps.map(x => x.t).join(' | ') === 'Total URA | Por intervalo | Auto · 1 h', `${larg}px: reabrir o app volta para Total URA · Por intervalo · Auto`);
    await p.close();
  }
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();
