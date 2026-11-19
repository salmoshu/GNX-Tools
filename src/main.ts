import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import './style.css'

document.documentElement.classList.remove('dark')

createApp(App).use(ElementPlus).mount('#app')
