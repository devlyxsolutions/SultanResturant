const fs = require('fs');
const HTMLtoDOCX = require('html-to-docx');
const marked = require('marked');

(async () => {
  try {
    const mdString = fs.readFileSync('Sultan_Restaurant_Extended_Documentation.md', 'utf-8');
    // Convert MD to HTML with a basic wrapper
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif;">
        ${marked.parse(mdString)}
      </body>
      </html>
    `;
    
    console.log('Converting to DOCX...');
    const fileBuffer = await HTMLtoDOCX(htmlContent, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });

    fs.writeFileSync('Sultan_Restaurant_Extended_Documentation.docx', fileBuffer);
    console.log('Conversion complete!');
  } catch(e) {
    console.error(e);
  }
})();
