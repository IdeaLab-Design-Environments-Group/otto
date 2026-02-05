import { AssemblyApp } from './AssemblyApp.js';

const container = document.getElementById('assembly-canvas-container');
const emptyState = document.getElementById('assembly-empty');
const backButton = document.getElementById('btn-back-editor');
const selectedName = document.getElementById('assembly-selected-name');

const app = new AssemblyApp({
    container,
    emptyState,
    backButton,
    controls: {
        selectedName
    },
    thickness: 3
});

app.init();
