#!/usr/bin/env node
/**
 * Literature Clock Data Converter
 * Downloads literary quotes CSV and converts to optimized JSON format
 * 
 * Source: https://github.com/JohannesNE/literature-clock
 * Format: time|time_text|quote|title|author|sfw
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ANSI colors for pretty output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m'
};

const CSV_URL = 'https://raw.githubusercontent.com/JohannesNE/literature-clock/master/litclock_annotated.csv';
const OUTPUT_FILE = path.join(__dirname, 'litclock_quotes.json');

console.log(`
${colors.cyan}${colors.bright}╔════════════════════════════════════════════╗
║     📚 Literature Clock Data Converter     ║
╚════════════════════════════════════════════╝${colors.reset}
`);

/**
 * Download file from URL
 */
function downloadFile(url) {
    return new Promise((resolve, reject) => {
        console.log(`${colors.yellow}⬇ Downloading quotes from GitHub...${colors.reset}`);

        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect
                return downloadFile(response.headers.location).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
            response.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Parse CSV line respecting quotes
 */
function parseCSVLine(line) {
    // The file uses pipe (|) as delimiter, not comma
    return line.split('|');
}

/**
 * Process the quote to separate before/highlight/after parts
 */
function processQuote(quote, timeText) {
    // Clean up HTML tags like <br/>
    let cleanQuote = quote.replace(/<br\s*\/?>/gi, ' ').trim();

    // Find the time text in the quote (case insensitive)
    const lowerQuote = cleanQuote.toLowerCase();
    const lowerTimeText = timeText.toLowerCase();
    const idx = lowerQuote.indexOf(lowerTimeText);

    if (idx === -1) {
        // Time text not found in quote - return whole quote
        return {
            quote_before: '',
            quote_highlight: timeText,
            quote_after: cleanQuote
        };
    }

    return {
        quote_before: cleanQuote.substring(0, idx),
        quote_highlight: cleanQuote.substring(idx, idx + timeText.length),
        quote_after: cleanQuote.substring(idx + timeText.length)
    };
}

/**
 * Convert CSV data to structured JSON
 */
function convertToJSON(csvData) {
    const lines = csvData.split('\n');
    const quotes = {};
    let totalQuotes = 0;
    let sfwQuotes = 0;
    let skippedNsfw = 0;

    console.log(`${colors.cyan}📖 Processing ${lines.length} lines...${colors.reset}`);

    for (const line of lines) {
        if (!line.trim()) continue;

        const parts = parseCSVLine(line);
        if (parts.length < 5) continue;

        const [time, timeText, quote, title, author, sfw] = parts;

        // Skip NSFW content (only include 'sfw' or 'unknown')
        if (sfw && sfw.toLowerCase() === 'nsfw') {
            skippedNsfw++;
            continue;
        }

        // Validate time format (HH:MM)
        if (!/^\d{2}:\d{2}$/.test(time)) continue;

        totalQuotes++;
        if (sfw && sfw.toLowerCase() === 'sfw') sfwQuotes++;

        // Process the quote
        const processed = processQuote(quote, timeText);

        const quoteObj = {
            time_text: timeText,
            quote_before: processed.quote_before,
            quote_highlight: processed.quote_highlight,
            quote_after: processed.quote_after,
            title: title.trim(),
            author: author.trim()
        };

        // Group by time
        if (!quotes[time]) {
            quotes[time] = [];
        }
        quotes[time].push(quoteObj);
    }

    console.log(`${colors.green}✓ Processed ${totalQuotes} quotes${colors.reset}`);
    console.log(`   ${colors.cyan}SFW: ${sfwQuotes} | Unknown: ${totalQuotes - sfwQuotes} | Skipped NSFW: ${skippedNsfw}${colors.reset}`);
    console.log(`   ${colors.cyan}Unique times covered: ${Object.keys(quotes).length}/1440 (${(Object.keys(quotes).length / 1440 * 100).toFixed(1)}%)${colors.reset}`);

    return quotes;
}

/**
 * Main execution
 */
async function main() {
    try {
        // Download CSV
        const csvData = await downloadFile(CSV_URL);
        console.log(`${colors.green}✓ Downloaded ${(csvData.length / 1024).toFixed(1)} KB${colors.reset}`);

        // Convert to JSON
        const quotes = convertToJSON(csvData);

        // Write output file
        console.log(`${colors.yellow}💾 Writing to ${path.basename(OUTPUT_FILE)}...${colors.reset}`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(quotes, null, 2));

        const stats = fs.statSync(OUTPUT_FILE);
        console.log(`${colors.green}✓ Created ${path.basename(OUTPUT_FILE)} (${(stats.size / 1024).toFixed(1)} KB)${colors.reset}`);

        // Show sample quote
        const sampleTime = '12:00';
        if (quotes[sampleTime] && quotes[sampleTime].length > 0) {
            const sample = quotes[sampleTime][0];
            console.log(`
${colors.magenta}📖 Sample quote for ${sampleTime}:${colors.reset}
   "${sample.quote_before}${colors.bright}${sample.quote_highlight}${colors.reset}${sample.quote_after}"
   — ${sample.title} by ${sample.author}
`);
        }

        console.log(`${colors.green}${colors.bright}✨ Conversion complete!${colors.reset}`);

    } catch (error) {
        console.error(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
        process.exit(1);
    }
}

main();
