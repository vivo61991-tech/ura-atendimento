// Aba Skills: CO, TEL e Total URA (todas as skills).
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
  await p.click('nav.tabs button[data-v="skills"]');
  const bts = await p.$$eval('#pgSkills button[data-skdir]', x => x.map(b => b.textContent));
  ok(bts.join('|') === 'CO|TEL|Total URA', 'três opções: ' + bts.join(' · '));
  const conta = async () => {
    const n = await p.$eval('#pgSkills h2.sec .ct', x => +x.textContent);
    const z = await p.locator('#pgSkills .zeros').count() ? +(await p.$eval('#pgSkills .zeros', x => x.textContent.match(/\d+/)[0])) : 0;
    return { com: n, total: n + z };
  };
  const co = await conta();
  await p.click('#pgSkills button[data-skdir="TEL"]'); const tel = await conta();
  await p.click('#pgSkills button[data-skdir="TODOS"]'); const tot = await conta();
  ok(tot.total === co.total + tel.total && tot.com === co.com + tel.com, `Total URA = CO + TEL (${tot.com} com chamadas, ${tot.total} no total: ${co.total} CO + ${tel.total} TEL)`);
  const itens = await p.$$eval('#pgSkills .fi', fs => fs.map(f => ({ tag: f.querySelector('.dtag') && f.querySelector('.dtag').textContent, ofer: +(f.querySelector('.nv small').textContent.match(/^[\d.]+/) || [f.querySelector('.nv b').textContent])[0].replace(/\./g, ''), v: f.querySelector('.nv').innerText.replace(/\s+/g, ' ') })));
  ok(itens.every(i => i.tag === 'CO' || i.tag === 'TEL' || i.tag === 'CO+TEL'), 'cada skill com a etiqueta do atendimento');
  ok(itens.some(i => i.tag === 'CO') && itens.some(i => i.tag === 'TEL'), 'lista mistura CO e TEL');
  ok(itens.every(i => /^[\d.]+ /.test(i.v)), 'todas com as oferecidas em destaque (em cima)');
  ok(itens.filter(i => i.tag === 'CO').every(i => /^[\d.]+ NS [\d,]+%/.test(i.v)) && itens.filter(i => i.tag === 'TEL').every(i => /da URA/.test(i.v)), 'embaixo: NS no CO; % da URA na TEL');
  const ns = await p.$$eval('#pgSkills .fi .nv small .nsc', x => x.map(e => ({ c: e.className, fs: parseFloat(getComputedStyle(e).fontSize), big: parseFloat(getComputedStyle(e.closest('.nv').querySelector('b')).fontSize) })));
  ok(ns.length > 0 && ns.every(x => /c-(VERDE|AMARELO|VERMELHO)/.test(x.c) && x.fs < x.big), 'NS colorido pela situação e com letra menor que as oferecidas');
  // detalhe de uma skill TEL e de uma CO a partir do Total URA
  await p.locator('#pgSkills .fi:has(.dtag.d-TEL)').first().click(); await p.waitForTimeout(300);
  ok(/TEL ·/.test(await p.$eval('#sheet .sub', x => x.textContent)), 'detalhe de skill TEL abre como TEL');
  await p.click('#sheet .fechar'); await p.waitForTimeout(300);
  await p.locator('#pgSkills .fi:has(.dtag.d-CO)').first().click(); await p.waitForTimeout(300);
  ok(/CO ·/.test(await p.$eval('#sheet .sub', x => x.textContent)) && await p.locator('#sheet .kpi:has-text("NS 300s")').count() === 1, 'detalhe de skill CO abre como CO (com NS)');
  await p.click('#sheet .fechar'); await p.waitForTimeout(300);
  // representatividade e rank no detalhe (conferidos com os números da lista)
  const lista = await p.$$eval('#pgSkills .fi', fs => fs.map(f => ({ nome: f.querySelector('.nm').textContent, dir: f.dataset.skd, ofer: +f.querySelector('.nv b').textContent.replace(/\./g, '') })));
  const totURA = 4370;   // 1.562 CO + 2.808 TEL
  for (const k of [0, 3]) {
    const it = lista[k];
    await p.locator('#pgSkills .fi').nth(k).click(); await p.waitForTimeout(300);
    const pz = await p.$eval('#sheet .peso', x => x.innerText.replace(/\s+/g, ' '));
    const rep = (it.ofer / totURA * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    const pos = 1 + lista.filter(x => x.ofer > it.ofer).length;
    const posDir = 1 + lista.filter(x => x.dir === it.dir && x.ofer > it.ofer).length;
    ok(pz.includes('Representatividade ' + rep) && pz.includes(`${it.ofer.toLocaleString('pt-BR')} de 4.370 oferecidas`), `${it.nome}: representatividade ${rep} (${it.ofer} de 4.370)`);
    ok(pz.includes(`Rank ${pos}º de 45`) && pz.includes(`${posDir}º ${it.dir === 'CO' ? 'no CO' : 'na TEL'}`), `${it.nome}: rank ${pos}º de 45 na URA e ${posDir}º ${it.dir === 'CO' ? 'no CO' : 'na TEL'}`);
    await p.click('#sheet .fechar'); await p.waitForTimeout(300);
  }
  // busca funciona no Total URA
  await p.fill('#skQ', 'manobra'); await p.waitForTimeout(150);
  const tags = await p.$$eval('#pgSkills .fi .dtag', x => [...new Set(x.map(t => t.textContent))]);
  ok(tags.includes('CO') && tags.includes('TEL'), 'busca "manobra" no Total URA traz CO e TEL');
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 390, `sem estouro lateral (${w}px)`);
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();
