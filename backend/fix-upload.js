const fs = require('fs');

let code = fs.readFileSync('controllers/uploadController.js', 'utf8');

const regex = /await new Promise\(\(resolve, reject\) => \{\s+fs\.createReadStream\(req\.file\.path\)\s+\.pipe\(csv\(\{[\s\S]*?\}\)\)\s+\.on\('data', \(data\) => \{/g;

const replacement = `const firstLine = await new Promise((resolve) => {
          const stream = fs.createReadStream(req.file.path, { encoding: 'utf8' });
          let data = '';
          stream.on('data', chunk => {
            data += chunk;
            const nlIndex = data.indexOf('\\n');
            if (nlIndex !== -1) {
              stream.destroy();
              resolve(data.substring(0, nlIndex));
            }
          });
          stream.on('end', () => resolve(data));
        });
        const separator = firstLine.includes(';') ? ';' : ',';

        await new Promise((resolve, reject) => {
          fs.createReadStream(req.file.path)
            .pipe(csv({ separator, mapHeaders: ({ header }) => header.trim().replace(/^\\uFEFF/, '') }))
            .on('data', (data) => {`;

code = code.replace(regex, replacement);

code = code.replace(/const energyVal = normalized\.energyconsumed \|\| normalized\['energy consumed'\] \|\| normalized\.kwh \|\| normalized\.energy;/g, "const energyVal = normalized.energyconsumed || normalized['energy consumed'] || normalized.kwh || normalized.energy || normalized.global_active_power;");

code = code.replace(/const parsedDate = new Date\(dateVal\);/g, `let dateStr = dateVal;
              if (dateStr && dateStr.includes('/') && dateStr.split('/')[0].length === 2) {
                const parts = dateStr.split('/');
                dateStr = \`\${parts[2]}-\${parts[1]}-\${parts[0]}\`;
              }
              if (normalized.time) {
                dateStr += \`T\${normalized.time}\`;
              }
              const parsedDate = new Date(dateStr);`);

fs.writeFileSync('controllers/uploadController.js', code);
console.log('Done!');
