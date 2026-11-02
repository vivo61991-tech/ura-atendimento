// Total URA · CO · TEL é um filtro só: escolher em qualquer tela (Agora, Evolução, Skills) vale nas outras.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/ura/';
const ok = (c, m) => { if (!c) { console.log('FALHOU', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const b = await chromium.launch(); const erros = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => erros.push(e.message));
  await p.clock.install({ time: new Date('2026-10-30T19:17:30') });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => window.__ura.estado().dados);
  const tab = async v => { await p.click(`nav.tabs button[data-v="${v}"]`); await p.waitForTimeout(120); };
  const telas = async () => {
    await tab('agora'); const a = await p.$eval('#pgAgora .agdir button.on', x => x.textContent);
    await tab('evo'); const e = await p.$eval('#pgEvo [data-menu="dir"] span', x => x.textContent);
    await tab('skills'); const s = await p.$eval('#pgSkills button[data-skdir].on', x => x.textContent);
    return [a, e, s].join(' | ');
  };
  ok(await telas() === 'Total URA | Total URA | Total URA', 'as três telas começam em Total URA');
  await tab('skills'); await p.click('#pgSkills button[data-skdir="CO"]');
  ok(await telas() === 'CO | CO | CO', 'CO escolhido na Skills: Agora e Evolução também em CO');
  await tab('evo'); await p.click('#pgEvo .chip[data-grp="MANOBRA"]'); await p.waitForTimeout(300);
  await p.click('#pgEvo [data-menu="dir"]'); await p.click('#pgEvo .ctl-menu button[data-dir="TEL"]');
  ok(await telas() === 'TEL | TEL | TEL', 'TEL escolhido na Evolução: Agora e Skills também em TEL');
  ok(await p.evaluate(() => window.__ura.estado().evo.grupo) === null, 'trocar de atendimento limpa o grupo');
  await tab('agora'); await p.click('#pgAgora .agdir button[data-agdir="TODOS"]');
  ok(await telas() === 'Total URA | Total URA | Total URA', 'Total URA escolhido na Agora: as outras também');
  await tab('skills');
  ok(await p.locator('#pgSkills .fi .dtag').count() > 0, 'Skills em Total URA: lista com CO e TEL');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await b.close();
})();
