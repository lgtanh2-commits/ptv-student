import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { language } from "./messages";
import { router } from "./router";
import "./styles/main.css";

document.documentElement.lang = language;

createApp(App).use(createPinia()).use(router).mount("#app");
