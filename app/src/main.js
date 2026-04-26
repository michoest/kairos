import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';

// Restore theme preference before mount to avoid flash.
const saved = localStorage.getItem('kairos.theme');
if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

createApp(App).use(createPinia()).mount('#app');
