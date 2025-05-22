const express = require('express'); // Cria o servidor web
const puppeteer = require('puppeteer'); // Controla o browser "invisível"

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/scrape', async (req, res) => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const projects = [];

  // Percorre as 11 páginas de empreendimentos
  for (let i = 1; i <= 11; i++) {
    await page.goto(`https://www.sothebysrealtypt.com/empreendimentos?page=${i}`, {
      waitUntil: 'networkidle2',
    });

    const pageProjects = await page.evaluate(() => {
      const cards = document.querySelectorAll('.card-project');
      return Array.from(cards).map(card => {
        const name = card.querySelector('.card-title')?.innerText?.trim();
        const location = card.querySelector('.card-local')?.innerText?.trim();
        const priceText = card.querySelector('.price')?.innerText?.replace(/[^\d]/g, '');
        const price_from = priceText ? parseInt(priceText) : null;
        const typology = card.querySelector('.card-info')?.innerText?.trim();
        const link = card.querySelector('a')?.href;

        return { name, location, price_from, typology, link };
      });
    });

    projects.push(...pageProjects);
  }

  const fullProjects = [];

  // Vai a cada página de detalhe e extrai dados das frações
  for (const proj of projects) {
    if (!proj.link) continue;
    await page.goto(proj.link, { waitUntil: 'networkidle2' });

    const result = await page.evaluate(() => {
      const description = document.querySelector('.description')?.innerText || '';
      const unitRows = document.querySelectorAll('.units-table tbody tr');

      const units = Array.from(unitRows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          referencia: cells[0]?.innerText?.trim(),
          price: parseInt(cells[1]?.innerText?.replace(/[^\d]/g, '')),
          floor: cells[2]?.innerText?.trim(),
          bedrooms: cells[3]?.innerText?.trim(),
          garage: cells[5]?.innerText?.trim(),
          status: cells[7]?.innerText?.trim(),
          plan_url: cells[8]?.querySelector('a')?.href || '',
        };
      });

      return { description, units };
    });

    fullProjects.push({
      project_name: proj.name,
      location: proj.location,
      price_from: proj.price_from,
      typology_range: proj.typology,
      description: result.description,
      link: proj.link,
      total_units: result.units.length,
      available_units: result.units.filter(u => !u.status?.toLowerCase().includes('vendido')).length,
      scraped_at: new Date().toISOString(),
      units: result.units.map(u => ({
        ...u,
        project_name: proj.name,
        scraped_at: new Date().toISOString(),
      })),
    });
  }

  await browser.close();
  res.json(fullProjects);
});

app.listen(PORT, () => console.log(`Scraper online na porta ${PORT}`));
