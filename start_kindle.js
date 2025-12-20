const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Kindle Mode (Server + Renderer)...');

// Start Server
const server = spawn('node', ['server.js'], { stdio: 'inherit', shell: true });

// Start Renderer (wait 2s for server to boot)
setTimeout(() => {
    console.log('📸 Starting Renderer...');
    const renderer = spawn('node', ['render.js'], { stdio: 'inherit', shell: true });

    renderer.on('close', (code) => {
        console.log(`Renderer exited with code ${code}`);
        server.kill();
        process.exit(code);
    });
}, 2000);

server.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
    process.exit(code);
});
