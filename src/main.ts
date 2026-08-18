import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/tokens.css";
import "./styles/inspector.css";

const target = document.getElementById("app");
if (target === null) throw new Error("Не знайдено кореневий вузол #app");

export default mount(App, { target });
