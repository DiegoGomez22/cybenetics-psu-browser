import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Sirve el HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'psu-viewer.html'));
});

// Sirve el CSV
app.get('/psu.csv', (req, res) => {
  res.sendFile(path.join(__dirname, 'psu.csv'));
});

// Endpoint que dispara la actualización
app.post('/actualizar', async (req, res) => {
  try {
    console.log('Iniciando actualización...');

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://www.cybenetics.com/index.php?option=psu-performance-database', {
      waitUntil: 'domcontentloaded'
    });

    const cookies = await page.cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const url = 'https://www.cybenetics.com/code/performance-in.php?volts=2&brand=0&formFactor=0&wattage=0,4000&atx=3&referenceScore=0&sorting=brand-asc';

    const html = await page.evaluate(async (url, cookieStr) => {
      const r = await fetch(url, {
        headers: {
          'Referer': 'https://www.cybenetics.com/index.php?option=psu-performance-database',
          'Cookie': cookieStr
        }
      });
      return r.text();
    }, url, cookieStr);

    await browser.close();

    const $ = cheerio.load(html);
    const rows = [];
    const headers = [];
    $('table tr th').each((_, el) => headers.push($(el).text().trim()));
    rows.push(headers.join(','));
    $('table tr').each((_, row) => {
      const cells = [];
      $(row).find('td').each((_, cell) => cells.push(`"${$(cell).text().trim()}"`));
      if (cells.length) rows.push(cells.join(','));
    });

    writeFileSync(path.join(__dirname, 'psu.csv'), rows.join('\n'), 'utf8');
    const count = rows.length - 1;
    console.log(`Listo. ${count} PSUs guardadas.`);
    res.json({ ok: true, count });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});