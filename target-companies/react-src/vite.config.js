import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({base:'./',build:{outDir:'../react-build',emptyOutDir:true,rollupOptions:{input:{resource:resolve('resource.html'),report:resolve('report.html')}}}});
